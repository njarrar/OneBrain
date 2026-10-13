import { db, env } from "@/lib/db";
import { markSynced, saveMany, type Incoming } from "@/lib/ingest";
import { htmlToText, mailBody, tidyMail } from "@/lib/connect/mailtext";
import { knownIds, readState, readToken, saveState, saveToken } from "@/lib/connect/tokens";
import type { Connector, SyncResult } from "@/lib/connect/types";

// Outlook, Hotmail and Live mail (and work Microsoft 365 mail), read only, through Microsoft
// Graph. Works like Gmail: whole history newest first, a slice a run, then new mail. Junk,
// Deleted, Drafts and the "Other" tab (newsletters and offers) stay out.

const AUTH = "https://login.microsoftonline.com/common/oauth2/v2.0";
const GRAPH = "https://graph.microsoft.com/v1.0/me";
const SCOPE = "offline_access User.Read Mail.Read";
const TOKEN = "outlook_refresh_token";
const STATE = "outlook_state";
const PAGE = 50;
const PAGES = 8; // a run reads up to 400 messages
const FIELDS = "id,subject,from,toRecipients,receivedDateTime,body,webLink,parentFolderId,inferenceClassification";

type State = {
  // Newest receivedDateTime seen. New mail is anything after it.
  since: string;
  // Graph's link to the next page of older mail; null at the start.
  next: string | null;
  done: boolean;
  // Where the walk through new mail stopped when a run ran out of pages, and the newest time it
  // saw. "since" holds still until that walk ends, so no new mail is skipped.
  newNext?: string | null;
  pendingSince?: string | null;
};

type Address = { emailAddress?: { name?: string; address?: string } };
type Message = {
  id: string;
  subject?: string | null;
  from?: Address;
  toRecipients?: Address[];
  receivedDateTime?: string;
  body?: { contentType?: string; content?: string };
  webLink?: string;
  parentFolderId?: string;
  inferenceClassification?: string;
};

async function tokenRequest(e: CloudflareEnv, body: Record<string, string>) {
  const res = await fetch(`${AUTH}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: e.MS_CLIENT_ID ?? "", client_secret: e.MS_CLIENT_SECRET ?? "", scope: SCOPE, ...body }),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Microsoft said: ${json.error_description?.split("\r\n")[0] ?? json.error ?? res.status}`);
  return json;
}

// Microsoft swaps the refresh token on use, so each new one is kept.
async function accessToken(): Promise<string> {
  const refresh = await readToken(TOKEN);
  if (!refresh) throw new Error("Outlook is not connected.");
  const t = await tokenRequest(await env(), { refresh_token: refresh, grant_type: "refresh_token" });
  if (t.refresh_token) await saveToken(TOKEN, t.refresh_token);
  return t.access_token!;
}

async function get<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}`, prefer: 'outlook.body-content-type="text"' } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Outlook said: ${json.error?.message ?? res.status}`);
  return json;
}

type Page = { value?: Message[]; "@odata.nextLink"?: string };

const name = (a?: Address) => a?.emailAddress?.name || a?.emailAddress?.address || null;
const full = (a?: Address) =>
  a?.emailAddress ? [a.emailAddress.name, a.emailAddress.address && `<${a.emailAddress.address}>`].filter(Boolean).join(" ") : null;

function toIncoming(m: Message): Incoming {
  const raw = m.body?.content ?? "";
  const text = tidyMail(m.body?.contentType === "html" ? htmlToText(raw) : raw);
  return {
    source: "outlook",
    externalId: m.id,
    key: `mail:outlook:${m.id}`,
    url: m.webLink ?? null,
    title: m.subject?.trim() || "(no subject)",
    body: mailBody({ from: full(m.from), to: (m.toRecipients ?? []).map(full).filter(Boolean).join(", ") || null, text }),
    author: name(m.from),
    authorHandle: m.from?.emailAddress?.address ?? null,
    kind: "email",
    status: "read",
    postedAt: m.receivedDateTime ?? null,
    savedAt: m.receivedDateTime ?? null,
  };
}

// The folders to leave out: Junk, Deleted and Drafts.
async function skippedFolders(token: string): Promise<Set<string>> {
  const ids = await Promise.all(
    ["junkemail", "deleteditems", "drafts"].map((f) => get<{ id: string }>(token, `${GRAPH}/mailFolders/${f}?$select=id`).then((x) => x.id).catch(() => null)),
  );
  return new Set(ids.filter((x): x is string => !!x));
}

async function keep(d: D1Database, skip: Set<string>, messages: Message[]): Promise<number> {
  const wanted = messages.filter((m) => m.id && m.inferenceClassification !== "other" && !skip.has(m.parentFolderId ?? ""));
  const known = await knownIds(d, "outlook", wanted.map((m) => m.id));
  const fresh = wanted.filter((m) => !known.has(m.id));
  await saveMany(fresh.map(toIncoming));
  return fresh.length;
}

const firstPage = (filter?: string) =>
  `${GRAPH}/messages?${new URLSearchParams({
    $select: FIELDS,
    $top: String(PAGE),
    $orderby: "receivedDateTime desc",
    ...(filter ? { $filter: filter } : {}),
  })}`;

async function sync(): Promise<SyncResult> {
  const d = await db();
  let added = 0;
  try {
    const token = await accessToken();
    const state = await readState<State>(STATE, { since: new Date().toISOString(), next: null, done: false });
    const skip = await skippedFolders(token);
    let pages = PAGES;

    // New mail since the last run.
    let url: string | undefined = state.newNext ?? firstPage(`receivedDateTime gt ${state.since}`);
    let latest = state.pendingSince ?? state.since;
    while (url && pages > 0) {
      const page: Page = await get<Page>(token, url);
      added += await keep(d, skip, page.value ?? []);
      for (const m of page.value ?? []) if (m.receivedDateTime && m.receivedDateTime > latest) latest = m.receivedDateTime;
      url = page["@odata.nextLink"];
      pages--;
    }
    if (url) {
      // Out of pages with new mail left: the next run picks up on this page.
      state.newNext = url;
      state.pendingSince = latest;
    } else {
      state.newNext = null;
      state.pendingSince = null;
      state.since = latest;
    }
    await saveState(STATE, state);

    // Then older mail, from where the last run stopped.
    while (!state.done && pages > 0) {
      const page: Page = await get<Page>(token, state.next ?? firstPage());
      added += await keep(d, skip, page.value ?? []);
      state.next = page["@odata.nextLink"] ?? null;
      state.done = !state.next;
      pages--;
      await saveState(STATE, state);
    }
    await saveState(STATE, state);
    await markSynced("outlook", added);
    return { added, more: !state.done || !!state.newNext };
  } catch (err) {
    await markSynced("outlook", added, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export const outlook: Connector = {
  id: "outlook",
  name: "Outlook",
  keysSet: (e) => !!(e.MS_CLIENT_ID && e.MS_CLIENT_SECRET),
  authUrl(e, { state, redirectUri, challenge }) {
    const p = new URLSearchParams({
      client_id: e.MS_CLIENT_ID ?? "",
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return `${AUTH}/authorize?${p}`;
  },
  async finish(code, { redirectUri, verifier }) {
    const t = await tokenRequest(await env(), { code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier });
    if (!t.refresh_token) throw new Error("Microsoft did not give lasting access. Connect again.");
    await saveToken(TOKEN, t.refresh_token);
    await saveState(STATE, { since: new Date().toISOString(), next: null, done: false } satisfies State);
  },
  connected: async () => !!(await readToken(TOKEN)),
  sync,
  async disconnect() {
    await saveToken(TOKEN, null);
    await saveState(STATE, null);
    await markSynced("outlook", 0, null, "not_connected");
  },
};

export const forTests = { toIncoming };
