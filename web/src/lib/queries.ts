import { all, first, ftsQuery } from "@/lib/db";

export type View = "inbox" | "all" | "archived";

export type ItemRow = {
  id: string;
  title: string | null;
  summary: string | null;
  body: string | null;
  note: string | null;
  url: string | null;
  kind: string;
  category: string | null;
  status: "inbox" | "read" | "archived";
  author: string | null;
  author_handle: string | null;
  posted_at: string | null;
  created_at: string;
  media: string[];
  sources: string[];
  tags: string[];
};

type RawItem = Omit<ItemRow, "media" | "sources" | "tags"> & { media: string; sources?: string; tags?: string };

function parse(r: RawItem): ItemRow {
  return {
    ...r,
    media: JSON.parse(r.media || "[]"),
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
  page: number;
};

export const PAGE_SIZE = 50;

export async function listItems(f: ListFilter): Promise<{ items: ItemRow[]; total: number }> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (f.view === "inbox") conds.push(`i.status = 'inbox'`);
  else if (f.view === "archived") conds.push(`i.status = 'archived'`);
  else conds.push(`i.status <> 'archived'`);
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
    : `order by coalesce(i.posted_at, i.created_at) desc`;

  const rows = await all<RawItem>(
    `select i.*,
       (select json_group_array(distinct s.source_id) from saves s where s.item_id = i.id) as sources,
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
  const raw = await first<RawItem>(`select * from items where id = ?`, id);
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
  const views = (await first<{ inbox: number; all: number; archived: number }>(
    `select coalesce(sum(status = 'inbox'), 0) as inbox,
            coalesce(sum(status <> 'archived'), 0) as "all",
            coalesce(sum(status = 'archived'), 0) as archived
     from items`,
  ))!;
  const categories = await all<{ name: string; count: number }>(
    `select c.name, count(i.id) as count
     from categories c left join items i on i.category = c.name and i.status <> 'archived'
     group by c.name order by c.name`,
  );
  const tags = await all<{ name: string; count: number }>(
    `select t.name, count(i.id) as count
     from tags t join item_tags it on it.tag_id = t.id
     join items i on i.id = it.item_id and i.status <> 'archived'
     group by t.id order by count desc, t.name`,
  );
  return { views, categories, tags };
}

export async function listSources() {
  return all<{ id: string; name: string; status: string; last_sync_at: string | null; last_error: string | null; items: number }>(
    `select so.*, (select count(distinct item_id) from saves s where s.source_id = so.id) as items
     from sources so
     order by case so.id when 'manual' then 1 else 0 end, so.name`,
  );
}

export async function listCategoryNames(): Promise<string[]> {
  return (await all<{ name: string }>(`select name from categories order by name`)).map((r) => r.name);
}
