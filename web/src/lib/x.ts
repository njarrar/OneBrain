import { db, env } from "@/lib/db";
import { countSaves, markSynced, saveStatements, type Incoming } from "@/lib/ingest";
import { getSetting, setSetting } from "@/lib/settings";

// X sign-in (OAuth 2.0 with PKCE) with read-only access to your bookmarks, kept with a
// refresh token. X swaps the refresh token on every use, so each new one is saved.
const SCOPE = "tweet.read users.read bookmark.read offline.access";
const API = "https://api.x.com/2";
const MAX_PAGES = 10; // 100 bookmarks a page; X only returns your latest 800 anyway

export async function redirectUri() {
  const e = await env();
  return `${e.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/x/callback`;
}

export async function xConnected() {
  return !!(await getSetting("x_refresh_token"));
}

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);

// A fresh PKCE verifier and the challenge made from it.
export async function pkce() {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  return { verifier, challenge };
}

export async function authUrl(state: string, challenge: string) {
  const e = await env();
  const p = new URLSearchParams({
    response_type: "code",
    client_id: e.X_CLIENT_ID ?? "",
    redirect_uri: await redirectUri(),
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `https://x.com/i/oauth2/authorize?${p}`;
}

async function tokenRequest(body: Record<string, string>) {
  const e = await env();
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${e.X_CLIENT_ID ?? ""}:${e.X_CLIENT_SECRET ?? ""}`)}`,
    },
    body: new URLSearchParams({ client_id: e.X_CLIENT_ID ?? "", ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`X said: ${json.error_description ?? json.error ?? res.status}`);
  return json;
}

export async function finishConnect(code: string, verifier: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: await redirectUri(), code_verifier: verifier });
  if (!t.refresh_token) throw new Error("X did not give lasting access. Connect again.");
  await setSetting("x_refresh_token", t.refresh_token);
}

// Imported bookmarks stay, so the source goes back to "imported from file".
export async function disconnect() {
  await setSetting("x_refresh_token", null);
  await markSynced("x", 0, null, (await countSaves("x")) ? "import" : "not_connected");
}

async function accessToken() {
  const refresh = await getSetting("x_refresh_token");
  if (!refresh) throw new Error("X is not connected.");
  const t = await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" });
  if (t.refresh_token) await setSetting("x_refresh_token", t.refresh_token);
  return t.access_token!;
}

async function get<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${API}/${path}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${token}` } });
  const json = (await res.json().catch(() => ({}))) as T & { title?: string; detail?: string };
  if (!res.ok) throw new Error(`X said: ${json.detail ?? json.title ?? res.status}`);
  return json;
}

type Tweet = {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  lang?: string;
  note_tweet?: { text?: string };
  attachments?: { media_keys?: string[] };
  entities?: unknown;
};
type User = { id: string; name: string; username: string; profile_image_url?: string };
type Media = { media_key: string; type: string; url?: string; preview_image_url?: string };
type Page = {
  data?: Tweet[];
  includes?: { users?: User[]; media?: Media[] };
  meta?: { next_token?: string; result_count?: number };
};

function post(t: Tweet, users: Map<string, User>, media: Map<string, Media>): Incoming {
  const user = t.author_id ? users.get(t.author_id) : undefined;
  return {
    source: "x",
    externalId: t.id,
    itemKey: t.id,
    url: user ? `https://x.com/${user.username}/status/${t.id}` : `https://x.com/i/status/${t.id}`,
    body: t.note_tweet?.text ?? t.text,
    author: user?.name,
    authorHandle: user?.username,
    media: (t.attachments?.media_keys ?? [])
      .map((k) => media.get(k))
      .map((m) => (m?.type === "photo" ? m.url : m?.preview_image_url))
      .filter((u): u is string => !!u),
    kind: "post",
    postedAt: t.created_at,
    raw: { ...t, user },
  };
}

// Pulls your newest bookmarks, stopping at the first page that has nothing new (X charges
// per post read). Returns how many saves were new.
export async function syncX(): Promise<number> {
  if (!(await xConnected())) return 0;
  const d = await db();
  const before = await countSaves("x");
  try {
    const token = await accessToken();
    const me = await get<{ data?: { id: string } }>(token, "users/me");
    if (!me.data?.id) throw new Error("X did not say who you are.");

    let seen = before;
    let next = "";
    for (let i = 0; i < MAX_PAGES; i++) {
      const page = await get<Page>(token, `users/${me.data.id}/bookmarks`, {
        max_results: "100",
        "tweet.fields": "created_at,attachments,entities,lang,note_tweet,author_id",
        expansions: "author_id,attachments.media_keys",
        "user.fields": "name,username,profile_image_url",
        "media.fields": "url,preview_image_url,type",
        ...(next ? { pagination_token: next } : {}),
      });
      const users = new Map((page.includes?.users ?? []).map((u) => [u.id, u]));
      const media = new Map((page.includes?.media ?? []).map((m) => [m.media_key, m]));
      const incoming = (page.data ?? []).map((t) => post(t, users, media));
      for (let j = 0; j < incoming.length; j += 40) {
        const stmts = (await Promise.all(incoming.slice(j, j + 40).map((x) => saveStatements(x)))).flatMap((s) => s.stmts);
        await d.batch(stmts);
      }
      const count = await countSaves("x");
      if (count === seen || !page.meta?.next_token) break;
      seen = count;
      next = page.meta.next_token;
    }

    const added = (await countSaves("x")) - before;
    await markSynced("x", added);
    return added;
  } catch (err) {
    await markSynced("x", 0, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
