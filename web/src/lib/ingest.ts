import { db, now } from "@/lib/db";

export type Incoming = {
  source: string;
  externalId?: string | null;
  // Names the item when one thing can be saved more than once from a source (a video liked and in a playlist).
  itemKey?: string;
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
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(external));
  return [...new Uint8Array(hash)].slice(0, 10).map((b) => b.toString(16).padStart(2, "0")).join("");
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

// Statements that save one item from a source. The same link saved twice becomes one item
// with two saves; the same save from the same source is skipped.
export async function saveStatements(x: Incoming): Promise<{ id: string; stmts: D1PreparedStatement[] }> {
  const d = await db();
  const url = clean(x.url, 2000);
  const key = x.itemKey ?? x.externalId;
  const id = key ? `${x.source}-${await safeId(key)}` : crypto.randomUUID();
  const stmts = [
    d.prepare(
      `insert into items (id, title, body, url, kind, author, author_handle, posted_at, media)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict do nothing`,
    ).bind(
      id, clean(x.title, 500), clean(x.body), url, x.kind ?? "link", clean(x.author, 200), clean(x.authorHandle, 200),
      iso(x.postedAt), JSON.stringify((x.media ?? []).filter(Boolean).slice(0, 8)),
    ),
    d.prepare(
      `insert into saves (id, item_id, source_id, external_id, saved_at, original_url, raw)
       select ?, i.id, ?, ?, ?, ?, ? from items i
       where i.id = ? or (? is not null and i.url = ?)
       order by i.id = ? desc limit 1
       on conflict do nothing`,
    ).bind(
      crypto.randomUUID(), x.source, x.externalId ?? null, iso(x.savedAt), url,
      x.raw === undefined ? null : JSON.stringify(x.raw), id, url, url, id,
    ),
  ];
  return { id, stmts };
}

// Saves one item and returns the id it ended up under (an older item with the same link wins).
export async function saveOne(x: Incoming): Promise<string> {
  const { id, stmts } = await saveStatements(x);
  const d = await db();
  await d.batch(stmts);
  const url = x.url?.trim() || null;
  const row = await d
    .prepare(`select id from items where id = ? or (? is not null and url = ?) order by id = ? desc limit 1`)
    .bind(id, url, url, id)
    .first<{ id: string }>();
  return row?.id ?? id;
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

