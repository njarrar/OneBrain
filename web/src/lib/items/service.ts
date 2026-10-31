import { all, db, env, first, ftsQuery, now, run } from "@/lib/db";
import { InputError, runLater } from "@/lib/http";
import { noteKey, sha256Hex, urlKey } from "@/lib/canonical";
import { saveOne } from "@/lib/ingest";
import { reminderStatement } from "@/lib/memory/reminders";
import { embedItems, forgetItems } from "@/lib/memory/embed";
import { isAudioFile } from "@/lib/memory/read";
import { readSortEmbed } from "@/lib/memory/pipeline";
import { firstUrl, isWebLink, sourceOfUrl, type SourceId } from "@/lib/sources";
import { unfurl } from "@/lib/unfurl";
import type { ItemChange, ListFilter } from "@/lib/items/schema";
import { ITEM_COLUMNS, decodeCursor, encodeCursor, filterSql, parseItem, type ItemRow, type RawItem } from "@/lib/items/sql";

// Everything that reads or changes items. Web server actions and the /api/app routes (iPhone,
// share sheet) are thin wrappers around these functions, so both behave the same.

export type { ItemRow } from "@/lib/items/sql";
export const PAGE_SIZE = 50;

export type ItemPage = {
  items: ItemRow[];
  // Counted on the first page only (and on every page asked for by number, for older app builds).
  total: number | null;
  nextCursor: string | null;
  page: number;
  pageSize: number;
};

// ───────────────────────────── Reading ─────────────────────────────

export async function listItems(f: ListFilter): Promise<ItemPage> {
  const { conds, params } = filterSql(f);
  const match = f.q ? ftsQuery(f.q) : null;
  if (f.q && !match) conds.push("0");
  if (match) {
    conds.push(`items_fts match ?`);
    params.push(match);
  }
  const from = match ? `from items i join items_fts on items_fts.rowid = i.rowid` : `from items i`;

  // The date order pages by (sort_at, id), which never repeats or skips rows when new items
  // arrive between pages. Search (ranked) and Trash (by delete time) page by offset.
  const cursor = decodeCursor(f.cursor);
  const keyed = !match && f.view !== "trash";
  const pageConds = [...conds];
  const pageParams = [...params];
  let offset = f.cursor ? 0 : (f.page - 1) * PAGE_SIZE;
  if (cursor?.kind === "offset") offset = cursor.offset;
  if (keyed && cursor?.kind === "key") {
    pageConds.push(`(i.sort_at < ? or (i.sort_at = ? and i.id < ?))`);
    pageParams.push(cursor.sortAt, cursor.sortAt, cursor.id);
    offset = 0;
  }
  const order = match
    ? `order by bm25(items_fts), i.sort_at desc, i.id desc`
    : f.view === "trash"
      ? `order by i.deleted_at desc, i.id desc`
      : `order by i.sort_at desc, i.id desc`;

  const rows = await all<RawItem>(
    `select ${ITEM_COLUMNS} ${from} where ${pageConds.join(" and ")} ${order} limit ? offset ?`,
    ...pageParams,
    PAGE_SIZE + 1,
    offset,
  );
  const more = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE).map(parseItem);
  const last = items.at(-1);
  const nextCursor = !more || !last ? null
    : keyed ? encodeCursor({ kind: "key", sortAt: last.sort_at, id: last.id })
    : encodeCursor({ kind: "offset", offset: offset + PAGE_SIZE });

  const total = f.cursor
    ? null
    : ((await first<{ n: number }>(`select count(*) as n ${from} where ${conds.join(" and ")}`, ...params))?.n ?? 0);
  return { items, total, nextCursor, page: f.page, pageSize: PAGE_SIZE };
}

export type ItemDetail = {
  item: ItemRow;
  saves: { source_id: string; name: string; saved_at: string | null; original_url: string | null; created_at: string }[];
  tags: { name: string; added_by: string }[];
  files: { id: string; filename: string; mime: string }[];
  // Why Brain couldn't hear or read this save, when it tried and failed.
  textError: string | null;
};

export async function getItem(id: string): Promise<ItemDetail | null> {
  const raw = await first<RawItem>(`select ${ITEM_COLUMNS} from items i where i.id = ?`, id);
  if (!raw) return null;
  const [saves, tags, files] = await Promise.all([
    all<ItemDetail["saves"][number]>(
      `select s.source_id, so.name, s.saved_at, s.original_url, s.created_at
       from saves s join sources so on so.id = s.source_id
       where s.item_id = ? order by coalesce(s.saved_at, s.created_at)`,
      id,
    ),
    all<ItemDetail["tags"][number]>(
      `select t.name, it.added_by from item_tags it join tags t on t.id = it.tag_id where it.item_id = ? order by t.name`,
      id,
    ),
    all<ItemDetail["files"][number]>(`select id, filename, mime from files where item_id = ? order by created_at`, id),
  ]);
  return { item: parseItem(raw), saves, tags, files, textError: raw.text_error ?? null };
}

// ───────────────────────────── Changing ─────────────────────────────

// A tag you add is yours, even if Claude or an import added it first.
export function tagStatements(d: D1Database, id: string, add: string[], remove: string[] = []): D1PreparedStatement[] {
  const adds = [...new Set(add.map((t) => t.trim()).filter(Boolean))].flatMap((name) => [
    d.prepare(`insert or ignore into tags (name) values (?)`).bind(name),
    d.prepare(
      `insert into item_tags (item_id, tag_id, added_by) select ?, id, 'user' from tags where name = ?
       on conflict (item_id, tag_id) do update set added_by = 'user'`,
    ).bind(id, name),
  ]);
  const removes = [...new Set(remove)].map((name) =>
    d.prepare(`delete from item_tags where item_id = ? and tag_id in (select id from tags where name = ?)`).bind(id, name),
  );
  return [...adds, ...removes];
}

// Applies one change and returns the item as it is now, or null when there is no such item.
export async function updateItem(id: string, c: ItemChange): Promise<ItemDetail | null> {
  if (!(await first(`select 1 from items where id = ?`, id))) return null;
  const d = await db();
  const t = now();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (c.status !== undefined) {
    sets.push("status = ?");
    vals.push(c.status);
  }
  if (c.read !== undefined) {
    sets.push(c.read ? "read_at = coalesce(read_at, ?)" : "read_at = null");
    if (c.read) vals.push(t);
  }
  if (c.trash !== undefined) {
    sets.push(c.trash ? "deleted_at = coalesce(deleted_at, ?)" : "deleted_at = null");
    if (c.trash) vals.push(t);
  }
  if (c.category !== undefined) {
    // A new category changes what the item is about, so its vector is made again.
    sets.push("category = ?", "embedded_at = null");
    vals.push(c.category?.trim() || null);
  }
  if (c.keptWhy !== undefined) {
    sets.push("kept_why = ?");
    vals.push(c.keptWhy);
  }
  if (c.note !== undefined) {
    sets.push("note = ?", "embedded_at = null");
    vals.push(c.note?.trim() || null);
  }
  const stmts: D1PreparedStatement[] = [];
  if (sets.length) stmts.push(d.prepare(`update items set ${sets.join(", ")}, updated_at = ? where id = ?`).bind(...vals, t, id));
  stmts.push(...tagStatements(d, id, c.addTags ?? [], c.removeTags ?? []));
  if (c.remindAt !== undefined) stmts.push(reminderStatement(d, id, c.remindAt));
  if (stmts.length) await d.batch(stmts);
  if (c.note !== undefined || c.category !== undefined) runLater(embedItems([id]), "embed");
  return getItem(id);
}

// Marks an item read the first time it is opened.
export async function markOpened(id: string) {
  await run(`update items set read_at = ? where id = ? and read_at is null`, now(), id);
}

// Deletes items for good, with their files and vectors. Only items already in Trash;
// with no ids, everything in Trash.
export async function purgeItems(ids?: string[]): Promise<number> {
  if (ids && !ids.length) return 0;
  const d = await db();
  // D1 caps bound values per statement, so ids go 90 at a time.
  const gone: { id: string }[] = [];
  if (ids) {
    for (let i = 0; i < ids.length; i += 90) {
      const chunk = ids.slice(i, i + 90);
      gone.push(...(await all<{ id: string }>(`select id from items where deleted_at is not null and id in (${chunk.map(() => "?").join(",")})`, ...chunk)));
    }
  } else {
    gone.push(...(await all<{ id: string }>(`select id from items where deleted_at is not null`)));
  }
  if (!gone.length) return 0;
  const goneIds = gone.map((g) => g.id);
  const files: { r2_key: string }[] = [];
  // D1 caps bound values per statement, so look files up in chunks.
  for (let i = 0; i < goneIds.length; i += 90) {
    const chunk = goneIds.slice(i, i + 90);
    files.push(...(await all<{ r2_key: string }>(`select r2_key from files where item_id in (${chunk.map(() => "?").join(",")})`, ...chunk)));
  }
  // Rows go first, then the files: a failure midway leaves an unused file, never a broken item.
  let removed = 0;
  for (let i = 0; i < goneIds.length; i += 90) {
    const chunk = goneIds.slice(i, i + 90);
    const res = await d.prepare(`delete from items where deleted_at is not null and id in (${chunk.map(() => "?").join(",")})`).bind(...chunk).run();
    removed += res.meta.changes ?? 0;
  }
  if (files.length) {
    const bucket = (await env()).FILES;
    for (let i = 0; i < files.length; i += 100) await bucket.delete(files.slice(i, i + 100).map((f) => f.r2_key));
  }
  await forgetItems(goneIds).catch((err) => console.error("forget vectors failed", err));
  return removed;
}

// ───────────────────────────── Saving ─────────────────────────────

export type CaptureInput = {
  url?: string | null;
  // Free text from the share sheet or the Add sheet. A link inside it is used when url is empty.
  text?: string | null;
  title?: string | null;
  tags?: string[];
  remindAt?: string | null;
  file?: File | null;
  // For the Screenshots album: the photo's id on the phone, so it is saved only once.
  externalId?: string | null;
  takenAt?: string | null;
  // false skips the AI's sorting.
  sort?: boolean;
  // Where it came from, when the caller knows better than the link does.
  source?: SourceId;
};

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const TARGET = `select id from items where (?1 is not null and canon = ?1) or (?2 is not null and url = ?2) limit 1`;

// The one way a person saves something: the web Add page, the iPhone Add sheet, the share sheet
// and the Screenshots album all come here. The same link, picture or note saved again adds to
// the item already there (a new thought is added to its note) instead of making a copy.
export async function captureItem(x: CaptureInput): Promise<{ id: string; existed: boolean }> {
  const text = x.text?.trim() || null;
  const url = x.url?.trim() || firstUrl(text) || null;
  const file = x.file && x.file.size > 0 ? x.file : null;
  const title = x.title?.trim() || null;
  // The words that aren't the link itself.
  const words = text ? (url ? text.replace(url, "").trim() : text) || null : null;

  if (url && !isWebLink(url)) throw new InputError("Links need to start with http:// or https://");
  if (!url && !words && !file && !title) throw new InputError("Add a link, a note, or a picture.");
  if (file && file.size > MAX_FILE_BYTES) throw new InputError("That file is over 20 MB.", 413);

  const d = await db();
  const t = now();
  let id: string;
  let existed: boolean;
  // Words go in the item's note, unless they are the whole item (a note with nothing else).
  let note = words;

  if (file) {
    const bytes = await file.arrayBuffer();
    const hash = await sha256Hex(bytes);
    const key = `img:${hash}`;
    const source: SourceId = x.source ?? (x.externalId ? "photos" : "manual");
    // Some apps send a voice memo, video or picture with no type; name it by its ending so it plays on the page.
    const mime = file.type && file.type !== "application/octet-stream" ? file.type
      : /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name) ? `image/${file.name.split(".").pop()!.toLowerCase().replace("jpg", "jpeg")}`
      : isAudioFile("", file.name) ? (/\.(mp4|mov|m4v)$/i.test(file.name) ? "video/mp4" : "audio/mp4")
      : "application/octet-stream";
    const kind = mime.startsWith("image/") ? "image"
      : mime.startsWith("video/") ? "video"
      : isAudioFile(mime, file.name) ? "audio" : "file";
    const fallbackTitle = kind === "audio" || kind === "file"
      ? file.name.replace(/\.[^.]+$/, "").trim().slice(0, 120) || null
      : null;
    // A link sent with the file stays on the item.
    existed = !!(await first(TARGET, key, url));
    id = await saveOne({
      source,
      externalId: x.externalId ?? key,
      key,
      url,
      imageHash: hash,
      kind,
      title: title ?? words?.split("\n")[0].slice(0, 120) ?? fallbackTitle,
      postedAt: x.takenAt ?? null,
      savedAt: x.takenAt ?? t,
      raw: { filename: file.name, url },
    });
    const hasCopy = await first(`select 1 from files where item_id = ? and sha256 = ?`, id, hash);
    if (!hasCopy) {
      const fileId = crypto.randomUUID();
      const r2Key = `files/${fileId}`;
      await (await env()).FILES.put(r2Key, bytes, { httpMetadata: { contentType: mime } });
      await run(
        `insert into files (id, item_id, filename, mime, size, r2_key, sha256) select ?, ?, ?, ?, ?, ?, ?
         where not exists (select 1 from files where item_id = ? and sha256 = ?)`,
        fileId, id, (file.name || "file").slice(0, 200), mime, file.size, r2Key, hash, id, hash,
      );
    }
    if (source === "photos") {
      await run(`update sources set status = 'connected', last_sync_at = ? where id = 'photos'`, t);
    }
  } else {
    // One key per link however it is spelled, or per note by its words, so a retried share adds nothing.
    const key = url ? urlKey(url) : await noteKey(words ?? title ?? "");
    existed = !!(await first(TARGET, key, url));
    const found = url && !existed ? await unfurl(url) : {};
    const noteOnly = !url;
    if (noteOnly) note = null;
    id = await saveOne({
      source: x.source ?? sourceOfUrl(url),
      externalId: key ?? url,
      key,
      url,
      title: title ?? found.title ?? (noteOnly ? (words ?? "").split("\n")[0].slice(0, 120) || null : null),
      body: noteOnly ? words : (found.description ?? null),
      media: found.image ? [found.image] : [],
      kind: url ? "link" : "note",
      savedAt: t,
      raw: { url, text, title },
    });
  }

  const stmts: D1PreparedStatement[] = [];
  if (note) {
    // The same words sent twice are not added twice.
    stmts.push(
      d.prepare(
        `update items set note = case
           when note is null or note = '' then ?1
           when instr(note, ?1) > 0 then note
           else note || char(10) || char(10) || ?1 end,
           embedded_at = null, updated_at = ?2 where id = ?3`,
      ).bind(note, t, id),
    );
  }
  stmts.push(...tagStatements(d, id, x.tags ?? []));
  if (x.remindAt) stmts.push(reminderStatement(d, id, x.remindAt));
  if (stmts.length) await d.batch(stmts);

  // After the response, so saving stays quick: Brain hears or reads the save (voice memo, picture,
  // note) and pulls out people and dates, Claude sorts it, then it gets its vector. Each step uses
  // what the one before found, so a voice memo is sorted by what was said in it.
  if (!existed) runLater(readSortEmbed([id], { sort: x.sort !== false }), "read, sort and embed");
  else if (note) runLater(embedItems([id]), "embed");
  return { id, existed };
}
