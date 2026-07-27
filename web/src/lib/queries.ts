import { all, db, env, first, ftsQuery } from "@/lib/db";

export type View = "inbox" | "all" | "archived" | "trash";
export type MediaFilter = "with" | "without";
export type Layout = "grid" | "list";
export type Lang = "en" | "ar";

// An item has media when it came with pictures or has an image file attached.
const HAS_MEDIA = `(i.media <> '[]' or exists (select 1 from files f where f.item_id = i.id and f.mime like 'image/%'))`;

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
  media: string[];
  images: string[];
  sources: string[];
  tags: string[];
};

type RawItem = Omit<ItemRow, "media" | "images" | "sources" | "tags"> & { media: string; images?: string; sources?: string; tags?: string };

function parse(r: RawItem): ItemRow {
  return {
    ...r,
    media: JSON.parse(r.media || "[]"),
    images: JSON.parse(r.images || "[]"),
    sources: JSON.parse(r.sources || "[]"),
    tags: JSON.parse(r.tags || "[]"),
  };
}

export type ListFilter = {
  view: View;
  category?: string;
  tag?: string;
  source?: string;
  q?: string;
  media?: MediaFilter;
  lang?: Lang;
  sensitive?: boolean;
  unread?: boolean;
  layout?: Layout;
  page: number;
};

export const PAGE_SIZE = 50;

export async function listItems(f: ListFilter): Promise<{ items: ItemRow[]; total: number }> {
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
  if (f.tag) {
    conds.push(`exists (select 1 from item_tags it join tags t on t.id = it.tag_id
                        where it.item_id = i.id and t.name = ?)`);
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
  const match = f.q ? ftsQuery(f.q) : null;
  if (f.q && !match) conds.push("0");
  if (match) {
    conds.push(`items_fts match ?`);
    params.push(match);
  }

  const from = match ? `from items i join items_fts on items_fts.rowid = i.rowid` : `from items i`;
  const where = `where ${conds.join(" and ")}`;
  const order = match
    ? `order by bm25(items_fts), i.created_at desc`
    : f.view === "trash"
      ? `order by i.deleted_at desc`
      : `order by coalesce(i.posted_at, i.created_at) desc`;

  const rows = await all<RawItem>(
    `select i.*,
       (select color from categories c where c.name = i.category) as category_color,
       (select json_group_array(distinct s.source_id) from saves s where s.item_id = i.id) as sources,
       (select json_group_array(f.id) from files f where f.item_id = i.id and f.mime like 'image/%') as images,
       (select json_group_array(name) from (select t.name from item_tags it join tags t on t.id = it.tag_id
          where it.item_id = i.id order by t.name)) as tags
     ${from} ${where} ${order} limit ? offset ?`,
    ...params,
    PAGE_SIZE,
    (f.page - 1) * PAGE_SIZE,
  );
  const count = await first<{ n: number }>(`select count(*) as n ${from} ${where}`, ...params);
  return { items: rows.map(parse), total: count?.n ?? 0 };
}

export async function getItem(id: string) {
  const raw = await first<RawItem>(
    `select i.*, (select color from categories c where c.name = i.category) as category_color,
       (select json_group_array(distinct s.source_id) from saves s where s.item_id = i.id) as sources,
       (select json_group_array(f.id) from files f where f.item_id = i.id and f.mime like 'image/%') as images,
       (select json_group_array(name) from (select t.name from item_tags it join tags t on t.id = it.tag_id
          where it.item_id = i.id order by t.name)) as tags
     from items i where id = ?`,
    id,
  );
  if (!raw) return null;
  const item = parse(raw);
  const saves = await all<{ source_id: string; name: string; saved_at: string | null; original_url: string | null; created_at: string }>(
    `select s.source_id, so.name, s.saved_at, s.original_url, s.created_at
     from saves s join sources so on so.id = s.source_id
     where s.item_id = ? order by coalesce(s.saved_at, s.created_at)`,
    id,
  );
  const tags = await all<{ name: string; added_by: string }>(
    `select t.name, it.added_by from item_tags it join tags t on t.id = it.tag_id
     where it.item_id = ? order by t.name`,
    id,
  );
  const files = await all<{ id: string; filename: string; mime: string }>(
    `select id, filename, mime from files where item_id = ? order by created_at`,
    id,
  );
  return { item, saves, tags, files };
}

export async function menuCounts() {
  const views = (await first<{
    inbox: number; all: number; archived: number; media: number; sensitive: number; trash: number; unread: number; unsorted: number;
  }>(
    `select coalesce(sum(deleted_at is null and status = 'inbox'), 0) as inbox,
            coalesce(sum(deleted_at is null and status <> 'archived'), 0) as "all",
            coalesce(sum(deleted_at is null and status = 'archived'), 0) as archived,
            coalesce(sum(deleted_at is null and status <> 'archived' and ${HAS_MEDIA}), 0) as media,
            coalesce(sum(deleted_at is null and status <> 'archived' and sensitive = 1), 0) as sensitive,
            coalesce(sum(deleted_at is not null), 0) as trash,
            coalesce(sum(deleted_at is null and status = 'inbox' and read_at is null), 0) as unread,
            coalesce(sum(deleted_at is null and category is null), 0) as unsorted
     from items i`,
  ))!;
  const categories = await all<{ name: string; color: string | null; count: number }>(
    `select c.name, c.color, count(i.id) as count
     from categories c left join items i on i.category = c.name and i.status <> 'archived' and i.deleted_at is null
     group by c.name order by c.name`,
  );
  const tags = await all<{ name: string; count: number }>(
    `select t.name, count(i.id) as count
     from tags t join item_tags it on it.tag_id = t.id
     join items i on i.id = it.item_id and i.status <> 'archived' and i.deleted_at is null
     group by t.id order by count desc, t.name`,
  );
  return { views, categories, tags };
}

export async function listSources() {
  return all<{ id: string; name: string; status: string; last_sync_at: string | null; last_error: string | null; items: number }>(
    `select so.*, (select count(distinct s.item_id) from saves s join items i on i.id = s.item_id
                   where s.source_id = so.id and i.deleted_at is null) as items
     from sources so
     order by case so.id when 'manual' then 1 else 0 end, so.name`,
  );
}

export async function listCategories() {
  return all<{ name: string; color: string | null }>(`select name, color from categories order by name`);
}

export async function listCategoryNames(): Promise<string[]> {
  return (await all<{ name: string }>(`select name from categories order by name`)).map((r) => r.name);
}

// Deletes items for good, with their files in R2. Only items already in Trash.
export async function purgeItems(ids?: string[]): Promise<number> {
  if (ids && !ids.length) return 0;
  const d = await db();
  const where = ids ? `deleted_at is not null and id in (${ids.map(() => "?").join(",")})` : `deleted_at is not null`;
  const args = ids ?? [];
  const files = await all<{ r2_key: string }>(`select r2_key from files where item_id in (select id from items where ${where})`, ...args);
  const res = await d.prepare(`delete from items where ${where}`).bind(...args).run();
  if (files.length) {
    const bucket = (await env()).FILES;
    for (let i = 0; i < files.length; i += 100) await bucket.delete(files.slice(i, i + 100).map((f) => f.r2_key));
  }
  return res.meta.changes ?? 0;
}
