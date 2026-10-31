import type { ListFilter } from "@/lib/items/schema";
import { parseFacts, type Facts } from "@/lib/memory/read";

// SQL shared by every item query, so the list, the item page, Resurface, Related and the app
// API all return one shape.

// An item has media when it came with pictures or has an image file attached.
export const HAS_MEDIA = `(i.media <> '[]' or exists (select 1 from files f where f.item_id = i.id and f.mime like 'image/%'))`;

// Columns every item query returns. sort_at is a generated column (migration 0010).
export const ITEM_COLUMNS = `i.*,
  (select color from categories c where c.name = i.category) as category_color,
  (select json_group_array(distinct s.source_id) from saves s where s.item_id = i.id) as sources,
  (select json_group_array(f.id) from files f where f.item_id = i.id and f.mime like 'image/%') as images,
  (select json_group_array(name) from (select t.name from item_tags it join tags t on t.id = it.tag_id
     where it.item_id = i.id order by t.name)) as tags,
  (select r.due_at from reminders r where r.item_id = i.id) as remind_at`;

export type ItemRow = {
  id: string;
  title: string | null;
  summary: string | null;
  body: string | null;
  note: string | null;
  url: string | null;
  kind: string;
  category: string | null;
  category_color: string | null;
  subtopic: string | null;
  lang: string | null;
  sensitive: number;
  status: "inbox" | "read" | "archived";
  deleted_at: string | null;
  read_at: string | null;
  author: string | null;
  author_handle: string | null;
  posted_at: string | null;
  created_at: string;
  sort_at: string;
  remind_at: string | null;
  // Why it was kept (use, learn, buy, someone, idea), and when a snooze in the pile ends.
  kept_why?: string | null;
  snoozed_until?: string | null;
  // What Brain heard in a voice memo or read in a picture, and the people and dates Claude found.
  transcript: string | null;
  facts: Facts | null;
  media: string[];
  images: string[];
  sources: string[];
  tags: string[];
};

export type RawItem = Omit<ItemRow, "media" | "images" | "sources" | "tags" | "facts"> & {
  media: string;
  facts?: string | null;
  images?: string;
  sources?: string;
  tags?: string;
  // Internal columns the API does not send.
  canon?: string | null;
  embedded_at?: string | null;
  text_at?: string | null;
  text_error?: string | null;
};

const arr = (s: string | undefined | null): string[] => {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : [];
  } catch {
    return [];
  }
};

export function parseItem(r: RawItem): ItemRow {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { canon, embedded_at, text_at, text_error, ...rest } = r;
  return { ...rest, transcript: r.transcript ?? null, facts: parseFacts(r.facts), media: arr(r.media), images: arr(r.images), sources: arr(r.sources), tags: arr(r.tags) };
}

// Turns filters into a where clause. Search is handled by the caller because it changes the join.
export function filterSql(f: ListFilter): { conds: string[]; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  // Trashed items show only in Trash.
  if (f.view === "trash") conds.push(`i.deleted_at is not null`);
  else {
    conds.push(`i.deleted_at is null`);
    if (f.view === "inbox") conds.push(`i.status = 'inbox'`);
    else if (f.view === "archived") conds.push(`i.status = 'archived'`);
    else conds.push(`i.status <> 'archived'`);
  }
  if (f.unread) conds.push(`i.read_at is null`);
  if (f.category) {
    conds.push(`i.category = ?`);
    params.push(f.category);
  }
  if (f.subtopic) {
    conds.push(`i.subtopic = ?`);
    params.push(f.subtopic);
  }
  if (f.tag) {
    conds.push(`exists (select 1 from item_tags it join tags t on t.id = it.tag_id where it.item_id = i.id and t.name = ?)`);
    params.push(f.tag);
  }
  if (f.source) {
    conds.push(`exists (select 1 from saves s where s.item_id = i.id and s.source_id = ?)`);
    params.push(f.source);
  }
  if (f.lang) {
    conds.push(`i.lang = ?`);
    params.push(f.lang);
  }
  if (f.sensitive) conds.push(`i.sensitive = 1`);
  if (f.media === "with") conds.push(HAS_MEDIA);
  else if (f.media === "without") conds.push(`not ${HAS_MEDIA}`);
  return { conds, params };
}

// Cursors are opaque to clients: "k:<sort_at>|<id>" for the date order, "o:<offset>" for search and Trash.
export type Cursor = { kind: "key"; sortAt: string; id: string } | { kind: "offset"; offset: number };

function toBase64Url(raw: string) {
  const bin = String.fromCharCode(...new TextEncoder().encode(raw));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function encodeCursor(c: Cursor): string {
  return toBase64Url(c.kind === "key" ? `k:${c.sortAt}|${c.id}` : `o:${c.offset}`);
}

export function decodeCursor(s: string | undefined): Cursor | null {
  if (!s || s.length > 1000) return null;
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    const raw = new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
    if (raw.startsWith("o:")) {
      const n = Math.floor(Number(raw.slice(2)));
      return Number.isFinite(n) && n >= 0 ? { kind: "offset", offset: n } : null;
    }
    if (raw.startsWith("k:")) {
      const body = raw.slice(2);
      const bar = body.indexOf("|"); // sort_at never holds a bar; an id might
      return bar > 0 && bar < body.length - 1 ? { kind: "key", sortAt: body.slice(0, bar), id: body.slice(bar + 1) } : null;
    }
  } catch {
    // A bad cursor starts from the top.
  }
  return null;
}
