import { db, env } from "@/lib/db";
import { markSynced, saveStatements, type Incoming } from "@/lib/ingest";
import { getSetting, setSetting } from "@/lib/settings";

// YouTube has its own Google sign-in, separate from signing in to Brain, so it can ask
// for read-only access to your YouTube account and keep it.
export const YT_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const API = "https://www.googleapis.com/youtube/v3";
const MAX_PAGES = 20; // 50 videos a page

export async function redirectUri() {
  const e = await env();
  return `${e.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/youtube/callback`;
}

export async function youtubeConnected() {
  return !!(await getSetting("youtube_refresh_token"));
}

export async function authUrl(state: string) {
  const e = await env();
  const p = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: await redirectUri(),
    response_type: "code",
    scope: YT_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenRequest(body: Record<string, string>) {
  const e = await env();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: e.GOOGLE_CLIENT_ID ?? "", client_secret: e.GOOGLE_CLIENT_SECRET ?? "", ...body }),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google said: ${json.error_description ?? json.error ?? res.status}`);
  return json;
}

export async function finishConnect(code: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: await redirectUri() });
  if (!t.refresh_token) throw new Error("Google did not give lasting access. Remove Brain at myaccount.google.com/permissions and connect again.");
  await setSetting("youtube_refresh_token", t.refresh_token);
}

export async function disconnect() {
  await setSetting("youtube_refresh_token", null);
  await markSynced("youtube", 0, null, "not_connected");
}

type Thumbs = Record<string, { url: string } | undefined>;
type Snippet = {
  title: string;
  description?: string;
  channelTitle?: string;
  videoOwnerChannelTitle?: string;
  publishedAt?: string;
  thumbnails?: Thumbs;
  resourceId?: { videoId?: string };
};

const bestThumb = (t?: Thumbs) => (t?.maxres ?? t?.standard ?? t?.high ?? t?.medium ?? t?.default)?.url;

async function* pages<T>(token: string, path: string, params: Record<string, string>) {
  let pageToken = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    const q = new URLSearchParams({ ...params, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
    const res = await fetch(`${API}/${path}?${q}`, { headers: { authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { items?: T[]; nextPageToken?: string; error?: { message?: string } };
    if (!res.ok) throw new Error(`YouTube said: ${json.error?.message ?? res.status}`);
    yield json.items ?? [];
    if (!json.nextPageToken) return;
    pageToken = json.nextPageToken;
  }
}

function video(videoId: string, s: Snippet, savedAt: string | null, from: string): Incoming {
  return {
    source: "youtube",
    externalId: `${from}-${videoId}`,
    itemKey: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: s.title,
    body: s.description?.slice(0, 3000),
    author: s.videoOwnerChannelTitle ?? s.channelTitle,
    media: [bestThumb(s.thumbnails)].filter((u): u is string => !!u),
    kind: "video",
    postedAt: s.publishedAt,
    savedAt,
    raw: { from, videoId },
  };
}

async function accessToken() {
  const refresh = await getSetting("youtube_refresh_token");
  if (!refresh) throw new Error("YouTube is not connected.");
  return (await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" })).access_token!;
}

export type Playlist = { id: string; title: string; count: number };

// Your own playlists, for picking which ones to bring in.
async function playlists(token: string): Promise<Playlist[]> {
  const out: Playlist[] = [];
  type Row = { id: string; snippet: { title: string }; contentDetails?: { itemCount?: number } };
  for await (const batch of pages<Row>(token, "playlists", { part: "snippet,contentDetails", mine: "true" })) {
    out.push(...batch.map((p) => ({ id: p.id, title: p.snippet.title, count: p.contentDetails?.itemCount ?? 0 })));
  }
  return out;
}

export async function listPlaylists() {
  return playlists(await accessToken());
}

// Which lists to bring in: playlist ids, and "liked" for liked videos. Null until you pick.
export async function pickedPlaylists(): Promise<string[] | null> {
  const raw = await getSetting("youtube_playlists");
  if (!raw) return null;
  try {
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === "string") : null;
  } catch {
    return null;
  }
}

export async function setPickedPlaylists(ids: string[]) {
  await setSetting("youtube_playlists", JSON.stringify([...new Set(ids)]));
}

// Pulls the lists you picked (liked videos only, until you pick). Returns how many saves were new.
export async function syncYouTube(): Promise<number> {
  if (!(await youtubeConnected())) return 0;
  const d = await db();
  const before = (await d.prepare(`select count(*) as n from saves where source_id = 'youtube'`).first<{ n: number }>())?.n ?? 0;
  try {
    const token = await accessToken();
    const picked = new Set((await pickedPlaylists()) ?? ["liked"]);
    const incoming: Incoming[] = [];

    if (picked.has("liked")) {
      for await (const batch of pages<{ id: string; snippet: Snippet }>(token, "videos", { part: "snippet", myRating: "like" })) {
        for (const v of batch) incoming.push(video(v.id, v.snippet, null, "liked"));
      }
    }
    const lists = picked.size > (picked.has("liked") ? 1 : 0) ? (await playlists(token)).filter((p) => picked.has(p.id)) : [];
    for (const list of lists) {
      for await (const batch of pages<{ snippet: Snippet }>(token, "playlistItems", { part: "snippet", playlistId: list.id })) {
        for (const it of batch) {
          const id = it.snippet.resourceId?.videoId;
          // Deleted and private videos come back with no thumbnail and a stock title.
          if (id && it.snippet.thumbnails && Object.keys(it.snippet.thumbnails).length) {
            incoming.push({ ...video(id, it.snippet, it.snippet.publishedAt ?? null, list.id), raw: { from: "playlist", playlist: list.title, videoId: id } });
          }
        }
      }
    }

    for (let i = 0; i < incoming.length; i += 40) {
      const stmts = (await Promise.all(incoming.slice(i, i + 40).map(saveStatements))).flatMap((s) => s.stmts);
      await d.batch(stmts);
    }
    const after = (await d.prepare(`select count(*) as n from saves where source_id = 'youtube'`).first<{ n: number }>())?.n ?? 0;
    await markSynced("youtube", after - before);
    return after - before;
  } catch (err) {
    await markSynced("youtube", 0, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
