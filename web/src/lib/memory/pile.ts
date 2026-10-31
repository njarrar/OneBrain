import { all, db, first, now } from "@/lib/db";
import { DECISIONS, WHYS, type Decision, type Why } from "@/lib/items/schema";
import { sourceLabel } from "@/lib/sources";
import { ITEM_COLUMNS, parseItem, type ItemRow, type RawItem } from "@/lib/items/sql";

// Clear the pile: every inbox save, oldest first, one at a time, until none are left.
//   done    keep it: it moves to the Archive, marked read
//   letgo   it goes to Trash (it can still come back from there)
//   snooze  it leaves the pile for two weeks, then comes back
//   undo    the last call is taken back: the save is in the inbox again
// After Done, one tap says why it was kept. Ask Brain, the digest and the podcast read that.

const DAY = 24 * 60 * 60 * 1000;
export const SNOOZE_DAYS = 14;

export { DECISIONS, WHYS, type Decision, type Why };

export const WHY_LABEL: Record<Why, string> = {
  use: "To use",
  learn: "To learn",
  buy: "To buy",
  someone: "For someone",
  idea: "An idea",
};

export function whyLabel(v: string | null | undefined): string | null {
  return v && v in WHY_LABEL ? WHY_LABEL[v as Why] : null;
}

// What counts as the pile. Email has its own place and never lands in the inbox.
const IN_PILE = `i.status = 'inbox' and i.deleted_at is null and i.kind <> 'email' and (i.snoozed_until is null or i.snoozed_until <= ?)`;

export async function pileLeft(): Promise<number> {
  return (await first<{ n: number }>(`select count(*) as n from items i where ${IN_PILE}`, now()))?.n ?? 0;
}

// The next saves in the pile, oldest first. `skip` leaves out ones the screen already holds.
export async function pileNext(limit = 30, skip: string[] = []): Promise<{ items: ItemRow[]; left: number }> {
  const t = now();
  const ids = skip.slice(0, 90);
  const not = ids.length ? `and i.id not in (${ids.map(() => "?").join(",")})` : "";
  const rows = await all<RawItem>(
    `select ${ITEM_COLUMNS} from items i where ${IN_PILE} ${not} order by i.sort_at asc, i.id asc limit ?`,
    t, ...ids, Math.min(60, Math.max(1, limit)),
  );
  return { items: rows.map(parseItem), left: await pileLeft() };
}

// One call on one save. Returns null when there is no such save.
export async function decide(id: string, how: Decision): Promise<{ left: number } | null> {
  const d = await db();
  const t = now();
  const sql: Record<Decision, [string, unknown[]]> = {
    done: [`update items set status = 'archived', read_at = coalesce(read_at, ?), snoozed_until = null, updated_at = ? where id = ?`, [t, t, id]],
    letgo: [`update items set deleted_at = coalesce(deleted_at, ?), snoozed_until = null, updated_at = ? where id = ?`, [t, t, id]],
    snooze: [`update items set snoozed_until = ?, updated_at = ? where id = ?`, [new Date(Date.now() + SNOOZE_DAYS * DAY).toISOString(), t, id]],
    undo: [`update items set status = 'inbox', deleted_at = null, snoozed_until = null, kept_why = null, updated_at = ? where id = ?`, [t, id]],
  };
  const [q, params] = sql[how];
  const res = await d.prepare(q).bind(...params).run();
  if (!res.meta.changes) return null;
  return { left: await pileLeft() };
}

// Why a save was kept. null clears it.
export async function setWhy(id: string, why: Why | null): Promise<boolean> {
  const res = await (await db()).prepare(`update items set kept_why = ?, updated_at = ? where id = ?`).bind(why, now(), id).run();
  return !!res.meta.changes;
}

// What the pile screen shows for one save.
export type PileCard = {
  id: string; text: string; summary: string | null; author: string | null; category: string | null;
  color: string | null; date: string; from: string; url: string | null; picture: string | null; rtl: boolean; sensitive: boolean;
};

export function pileCard(i: ItemRow): PileCard {
  return {
    id: i.id,
    text: (i.title ?? i.body?.trim() ?? i.url ?? "Untitled").slice(0, 600),
    summary: i.summary,
    author: i.author ?? i.author_handle,
    category: i.category,
    color: i.category_color,
    date: i.sort_at,
    from: sourceLabel(i.sources[0] ?? "manual"),
    url: i.url,
    picture: i.images[0] ? `/files/${i.images[0]}` : (i.media[0] ?? null),
    rtl: i.lang === "ar",
    sensitive: !!i.sensitive,
  };
}
