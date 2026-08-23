import { all, db, now } from "@/lib/db";
import { ITEM_COLUMNS, parseItem, type ItemRow, type RawItem } from "@/lib/items/sql";

// Resurface: saves come back on a schedule so they turn into memory instead of piling up.
//
// Each reminder keeps a small spaced-repetition state (like SM-2, without scores):
//   keep   the next gap grows by `ease` (1 day, then about 2.6, 7, 18 …) and ease rises a little
//   later  comes back tomorrow, and ease drops a little
//   done   the reminder is removed (the item stays where it is)
// Items from this day in earlier years are mixed in without a reminder.

const DAY = 24 * 60 * 60 * 1000;
export const DAILY_COUNT = 5;

export type Review = "keep" | "later" | "done";
export type Schedule = { intervalDays: number; ease: number };

// The next gap after an answer, from the current state (none for a first answer).
export function nextSchedule(cur: Schedule | null, how: "keep" | "later"): Schedule {
  const ease = Math.min(3, Math.max(1.3, (cur?.ease ?? 2.5) + (how === "keep" ? 0.1 : -0.2)));
  const intervalDays = how === "keep" ? Math.min(365, Math.max(1, (cur?.intervalDays ?? 0) * ease || 1)) : 1;
  return { intervalDays, ease };
}

// Sets or clears when an item comes back. null clears it.
export function reminderStatement(d: D1Database, id: string, dueAt: string | null): D1PreparedStatement {
  if (dueAt === null) return d.prepare(`delete from reminders where item_id = ?`).bind(id);
  return d
    .prepare(
      `insert into reminders (item_id, due_at) select ?1, ?2 where exists (select 1 from items where id = ?1)
       on conflict (item_id) do update set due_at = excluded.due_at, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    )
    .bind(id, new Date(dueAt).toISOString());
}

export type ResurfaceCard = ItemRow & { reason: "reminder" | "on_this_day" };

const today = (t: string) => t.slice(0, 10);

// Today's cards: due reminders first, then things from this day in earlier years.
// Cards answered today stay away until tomorrow. The "this day" pick is the same all day.
export async function resurfaceToday(limit = DAILY_COUNT): Promise<ResurfaceCard[]> {
  const t = now();
  const day = today(t);
  const due = await all<RawItem>(
    `select ${ITEM_COLUMNS} from reminders r join items i on i.id = r.item_id
     where r.due_at <= ? and i.deleted_at is null
       and not exists (select 1 from resurface_log l where l.item_id = i.id and l.day = ?)
     order by r.due_at limit ?`,
    t, day, limit,
  );
  const cards: ResurfaceCard[] = due.map((r) => ({ ...parseItem(r), reason: "reminder" }));
  if (cards.length < limit) {
    const onThisDay = await all<RawItem>(
      `select ${ITEM_COLUMNS} from items i
       where i.deleted_at is null
         and strftime('%m-%d', i.sort_at) = strftime('%m-%d', ?1)
         and strftime('%Y', i.sort_at) < strftime('%Y', ?1)
         and not exists (select 1 from reminders r where r.item_id = i.id)
         and not exists (select 1 from resurface_log l where l.item_id = i.id and l.day = ?2)
       order by (i.rowid * 2654435761 + cast(julianday(?1) as integer)) % 1000003 limit ?3`,
      t, day, limit - cards.length,
    );
    cards.push(...onThisDay.map((r) => ({ ...parseItem(r), reason: "on_this_day" as const })));
  }
  return cards;
}

// How many cards are waiting today, for the menu badge.
export async function countDue(): Promise<number> {
  const t = now();
  const rows = await all<{ n: number }>(
    `select count(*) as n from reminders r join items i on i.id = r.item_id
     where r.due_at <= ? and i.deleted_at is null
       and not exists (select 1 from resurface_log l where l.item_id = i.id and l.day = ?)`,
    t, today(t),
  );
  return rows[0]?.n ?? 0;
}

// Records how a card went and schedules the next time. Returns null when there is no such item.
export async function review(id: string, how: Review): Promise<{ nextAt: string | null } | null> {
  const d = await db();
  const exists = await d.prepare(`select 1 from items where id = ?`).bind(id).first();
  if (!exists) return null;
  const t = now();
  const log = d
    .prepare(`insert into resurface_log (item_id, day, how) values (?, ?, ?) on conflict (item_id, day) do update set how = excluded.how`)
    .bind(id, today(t), how);
  if (how === "done") {
    await d.batch([d.prepare(`delete from reminders where item_id = ?`).bind(id), log]);
    return { nextAt: null };
  }
  const cur = await d
    .prepare(`select interval_days, ease from reminders where item_id = ?`)
    .bind(id)
    .first<{ interval_days: number; ease: number }>();
  const next = nextSchedule(cur ? { intervalDays: cur.interval_days, ease: cur.ease } : null, how);
  const nextAt = new Date(Date.parse(t) + next.intervalDays * DAY).toISOString();
  await d.batch([
    d.prepare(
      `insert into reminders (item_id, due_at, interval_days, ease, reviews) values (?, ?, ?, ?, 1)
       on conflict (item_id) do update set due_at = excluded.due_at, interval_days = excluded.interval_days,
         ease = excluded.ease, reviews = reviews + 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
    ).bind(id, nextAt, next.intervalDays, next.ease),
    log,
  ]);
  return { nextAt };
}
