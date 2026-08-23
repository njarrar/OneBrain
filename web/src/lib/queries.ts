import { all, first } from "@/lib/db";
import { HAS_MEDIA } from "@/lib/items/sql";
import { countDue } from "@/lib/memory/reminders";

// Menu counts, sources and categories. Items themselves are read and changed in lib/items/service.ts;
// the names below are re-exported so older imports keep working.
export { getItem, listItems, purgeItems, PAGE_SIZE, type ItemRow, type ItemPage } from "@/lib/items/service";
export type { Lang, Layout, ListFilter, MediaFilter, View } from "@/lib/items/schema";

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
  const resurface = await countDue();
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
  return { views: { ...views, resurface }, categories, tags };
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

// The sub-topics Claude has used in one category, most used first.
export async function listSubtopics(category: string) {
  return all<{ name: string; count: number }>(
    `select subtopic as name, count(*) as count from items
     where category = ? and subtopic is not null and deleted_at is null and status <> 'archived'
     group by subtopic order by count desc, subtopic limit 30`,
    category,
  );
}
