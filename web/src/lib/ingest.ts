import { idForKey, identityKey, sha256Hex } from "@/lib/canonical";
import { db, now } from "@/lib/db";

export type Incoming = {
  source: string;
  // An id made elsewhere (the iPhone app) to keep as is.
  id?: string;
  externalId?: string | null;
  // Names the item when one thing can be saved more than once from a source (a video liked and in a playlist).
  itemKey?: string;
  // The identity key, when the caller knows it (a note's words, a picture's bytes). Otherwise worked out from the link.
  key?: string | null;
  // SHA-256 of a picture's bytes.
  imageHash?: string | null;
  url?: string | null;
  title?: string | null;
  body?: string | null;
  author?: string | null;
  authorHandle?: string | null;
  media?: string[];
  kind?: string;
  postedAt?: string | null;
  savedAt?: string | null;
  raw?: unknown;
};

// Item ids go in page links, so ids like full URLs are hashed.
async function safeId(external: string) {
  if (/^[\w-]{1,80}$/.test(external)) return external;
  return (await sha256Hex(external)).slice(0, 20);
}

function iso(v?: string | null) {
  if (!v) return null;
  // IFTTT writes dates like "September 27, 2026 at 07:00PM".
  const d = new Date(v.replace(/ at (\d)/, " $1").replace(/(\d)(AM|PM)$/i, "$1 $2"));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function clean(v?: string | null, max = 20000) {
  const s = v?.trim();
  return s ? s.slice(0, max) : null;
}

// The item an incoming save belongs to: the one with the same key, then the same id, then the same link.
// Binds: ?1 key, ?2 id, ?3 url.
const TARGET = `select i.id from items i
  where (?1 is not null and i.canon = ?1) or i.id = ?2 or (?3 is not null and i.url = ?3)
  order by coalesce(i.canon = ?1, 0) desc, i.id = ?2 desc, i.created_at limit 1`;

export type Planned = { id: string; key: string | null; stmts: D1PreparedStatement[] };

// Statements that save one item from a source. Anything already here under the same key (the same post,
// video, link or picture however it was spelled or wherever it came from) gets one more save instead of
// a second item: it keeps its own date, note, tags, status and sorting, and only has blanks filled.
// The same save from the same source is skipped, so retries and re-syncs add nothing.
export async function saveStatements(x: Incoming, d?: D1Database): Promise<Planned> {
  d ??= await db();
  const url = clean(x.url, 2000);
  const key = x.key ?? identityKey({ source: x.source, url, externalId: x.externalId, itemKey: x.itemKey, imageHash: x.imageHash });
  const own = x.itemKey ?? x.externalId;
  const id = x.id ?? idForKey(key) ?? (own ? `${x.source}-${await safeId(own)}` : crypto.randomUUID());
  const title = clean(x.title, 500);
  const body = clean(x.body);
  const author = clean(x.author, 200);
  const handle = clean(x.authorHandle, 200);
  const posted = iso(x.postedAt);
  const media = JSON.stringify((x.media ?? []).filter(Boolean).slice(0, 8));
  const stmts = [
    d.prepare(
      `insert into items (id, title, body, url, kind, author, author_handle, posted_at, media, canon)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict do nothing`,
    ).bind(id, title, body, url, x.kind ?? "link", author, handle, posted, media, key),
    // Fill what the item is missing. "or ignore" leaves the key alone if another item already has it.
    d.prepare(
      `update or ignore items set title = coalesce(title, ?4), body = coalesce(body, ?5), author = coalesce(author, ?6),
         author_handle = coalesce(author_handle, ?7), posted_at = coalesce(posted_at, ?8),
         media = case when media = '[]' then ?9 else media end, canon = coalesce(canon, ?1),
         kind = case when kind in ('link', 'note') and ?10 not in ('link', 'note') then ?10 else kind end
       where id = (${TARGET})`,
    ).bind(key, id, url, title, body, author, handle, posted, media, x.kind ?? "link"),
    d.prepare(
      `insert into saves (id, item_id, source_id, external_id, saved_at, original_url, raw)
       select ?4, (${TARGET}), ?5, ?6, ?7, ?8, ?9
       where (${TARGET}) is not null
       on conflict do nothing`,
    ).bind(
      key, id, url, crypto.randomUUID(), x.source, x.externalId ?? null, iso(x.savedAt), x.url?.trim() || url,
      x.raw === undefined ? null : JSON.stringify(x.raw),
    ),
  ];
  return { id, key, stmts };
}

// The id an item was saved under (an older item with the same key or link wins).
export async function resolveId(p: { id: string; key: string | null }, url?: string | null): Promise<string> {
  const row = await (await db()).prepare(TARGET).bind(p.key, p.id, clean(url, 2000)).first<{ id: string }>();
  return row?.id ?? p.id;
}

// Saves one item and returns the id it ended up under.
export async function saveOne(x: Incoming): Promise<string> {
  const planned = await saveStatements(x);
  await (await db()).batch(planned.stmts);
  return resolveId(planned, x.url);
}

export async function markSynced(source: string, added: number, error: string | null = null, status = "connected") {
  await (await db()).batch([
    (await db()).prepare(`insert into sync_runs (source_id, finished_at, added, error) values (?, ?, ?, ?)`).bind(source, now(), added, error),
    (await db()).prepare(`update sources set status = ?, last_sync_at = ?, last_error = ? where id = ?`).bind(error ? "error" : status, now(), error, source),
  ]);
}

export async function countSaves(source: string) {
  const d = await db();
  return (await d.prepare(`select count(*) as n from saves where source_id = ?`).bind(source).first<{ n: number }>())?.n ?? 0;
}

