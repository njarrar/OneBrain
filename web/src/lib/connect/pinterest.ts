import { db, env } from "@/lib/db";
import { markSynced, saveMany, type Incoming } from "@/lib/ingest";
import { knownIds, readToken, saveToken } from "@/lib/connect/tokens";
import type { Connector, SyncResult } from "@/lib/connect/types";

// Pinterest: your own boards and the pins on them, read only, through the Pinterest API.
// Each run walks every board and brings in pins not here yet; the board name becomes a tag.

const API = "https://api.pinterest.com/v5";
const SCOPE = "boards:read,pins:read,user_accounts:read";
const TOKEN = "pinterest_refresh_token";
const MAX_PAGES = 40; // 100 pins or boards a page

type Board = { id: string; name: string };
type Pin = {
  id: string;
  created_at?: string;
  link?: string | null;
  title?: string | null;
  description?: string | null;
  alt_text?: string | null;
  board_id?: string;
  media?: { media_type?: string; images?: Record<string, { url?: string } | undefined> };
};

async function tokenRequest(body: Record<string, string>) {
  const e = await env();
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${e.PINTEREST_APP_ID ?? ""}:${e.PINTEREST_APP_SECRET ?? ""}`)}`,
    },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; message?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(`Pinterest said: ${json.message ?? json.error ?? res.status}`);
  return json;
}

async function accessToken(): Promise<string> {
  const refresh = await readToken(TOKEN);
  if (!refresh) throw new Error("Pinterest is not connected.");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh });
  if (t.refresh_token) await saveToken(TOKEN, t.refresh_token);
  return t.access_token!;
}

async function* pages<T>(token: string, path: string, budget: { left: number }) {
  let bookmark = "";
  while (budget.left-- > 0) {
    const q = new URLSearchParams({ page_size: "100", ...(bookmark ? { bookmark } : {}) });
    const res = await fetch(`${API}/${path}?${q}`, { headers: { authorization: `Bearer ${token}` } });
    const json = (await res.json().catch(() => ({}))) as { items?: T[]; bookmark?: string | null; message?: string };
    if (!res.ok) throw new Error(`Pinterest said: ${json.message ?? res.status}`);
    yield json.items ?? [];
    if (!json.bookmark) return;
    bookmark = json.bookmark;
  }
}

const bestImage = (p: Pin) => {
  const i = p.media?.images ?? {};
  return (i["1200x"] ?? i["600x"] ?? i["400x300"] ?? i["150x150"])?.url;
};

function toIncoming(p: Pin, board: string): Incoming {
  const words = [p.description, p.alt_text].map((s) => s?.trim()).filter(Boolean) as string[];
  return {
    source: "pinterest",
    externalId: p.id,
    url: `https://www.pinterest.com/pin/${p.id}/`,
    title: p.title?.trim() || words[0]?.split("\n")[0].slice(0, 140) || `Pin on ${board}`,
    body: [...words, `Board: ${board}`, p.link && `Link: ${p.link}`].filter(Boolean).join("\n"),
    media: [bestImage(p)].filter((u): u is string => !!u),
    kind: "pin",
    postedAt: p.created_at ?? null,
    savedAt: p.created_at ?? null,
    raw: { board, link: p.link ?? null },
  };
}

async function sync(): Promise<SyncResult> {
  const d = await db();
  let added = 0;
  try {
    const token = await accessToken();
    const budget = { left: MAX_PAGES };
    const boards: Board[] = [];
    for await (const batch of pages<Board>(token, "boards", budget)) boards.push(...batch);
    for (const board of boards) {
      for await (const batch of pages<Pin>(token, `boards/${board.id}/pins`, budget)) {
        const known = await knownIds(d, "pinterest", batch.map((p) => p.id));
        const fresh = batch.filter((p) => p.id && !known.has(p.id));
        await saveMany(fresh.map((p) => toIncoming(p, board.name)));
        // The board name as a tag, so each board is one tap away.
        const tag = board.name.trim().slice(0, 60);
        if (fresh.length && tag) {
          await d.batch([
            d.prepare(`insert or ignore into tags (name) values (?)`).bind(tag),
            ...fresh.map((p) =>
              d.prepare(
                `insert or ignore into item_tags (item_id, tag_id, added_by)
                 select s.item_id, t.id, 'import' from saves s, tags t where s.source_id = 'pinterest' and s.external_id = ? and t.name = ?`,
              ).bind(p.id, tag),
            ),
          ]);
        }
        added += fresh.length;
        // A board seen before stops at the first page with nothing new.
        if (!fresh.length && known.size) break;
      }
    }
    await markSynced("pinterest", added);
    return { added, more: budget.left < 0 };
  } catch (err) {
    await markSynced("pinterest", added, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export const pinterest: Connector = {
  id: "pinterest",
  name: "Pinterest",
  keysSet: (e) => !!(e.PINTEREST_APP_ID && e.PINTEREST_APP_SECRET),
  authUrl(e, { state, redirectUri }) {
    const p = new URLSearchParams({ client_id: e.PINTEREST_APP_ID ?? "", redirect_uri: redirectUri, response_type: "code", scope: SCOPE, state });
    return `https://www.pinterest.com/oauth/?${p}`;
  },
  async finish(code, { redirectUri }) {
    const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, continuous_refresh: "true" });
    if (!t.refresh_token) throw new Error("Pinterest did not give lasting access. Connect again.");
    await saveToken(TOKEN, t.refresh_token);
  },
  connected: async () => !!(await readToken(TOKEN)),
  sync,
  async disconnect() {
    await saveToken(TOKEN, null);
    await markSynced("pinterest", 0, null, "not_connected");
  },
};

export const forTests = { toIncoming };
