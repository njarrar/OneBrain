import { all } from "@/lib/db";

// The topic map: one circle per category, sized by how much was saved in it (not when), with
// lines between categories whose saves share tags. Positions are worked out here, so the web
// page and the phones draw the same map. x, y and r are on a 1000 by 1000 square.

export type MapNode = { name: string; color: string | null; count: number; x: number; y: number; r: number; subtopics: { name: string; count: number }[] };
export type MapLink = { a: string; b: string; shared: number };
export type TopicMap = { nodes: MapNode[]; links: MapLink[]; total: number };

const SIZE = 1000;
const MIN_R = 34;
const MAX_R = 120;
// Only the strongest links, so the map stays readable.
const MAX_LINKS = 14;

// Biggest in the middle, the rest on two rings around it, biggest first, so the shape stays the
// same from one visit to the next.
export function layout(counts: { name: string; count: number }[]): Map<string, { x: number; y: number; r: number }> {
  const out = new Map<string, { x: number; y: number; r: number }>();
  const sorted = [...counts].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const max = Math.max(1, sorted[0]?.count ?? 1);
  const radius = (n: number) => MIN_R + (MAX_R - MIN_R) * Math.sqrt(n / max);
  const c = SIZE / 2;
  sorted.forEach((n, i) => {
    if (i === 0) return out.set(n.name, { x: c, y: c, r: radius(n.count) });
    // Ring 1 holds the next 7, ring 2 the rest (up to 16).
    const inner = i <= 7;
    const start = inner ? 1 : 8;
    const slots = inner ? Math.min(7, sorted.length - 1) : sorted.length - 8;
    const dist = inner ? 250 : 420;
    const angle = -Math.PI / 2 + ((i - start) / Math.max(1, slots)) * 2 * Math.PI + (inner ? 0 : Math.PI / slots);
    const r = Math.min(radius(n.count), inner ? 100 : 60);
    out.set(n.name, { x: c + dist * Math.cos(angle), y: c + dist * Math.sin(angle), r });
  });
  return fit(out);
}

// Grows and centres the circles so they fill the square, with room under each for its name.
function fit(pos: Map<string, { x: number; y: number; r: number }>) {
  const all = [...pos.values()];
  if (!all.length) return pos;
  const LABEL = 30;
  const minX = Math.min(...all.map((p) => p.x - p.r));
  const maxX = Math.max(...all.map((p) => p.x + p.r));
  const minY = Math.min(...all.map((p) => p.y - p.r));
  const maxY = Math.max(...all.map((p) => p.y + p.r + LABEL));
  const k = Math.min(1.8, SIZE / Math.max(1, maxX - minX), SIZE / Math.max(1, maxY - minY));
  const dx = (SIZE - (maxX - minX) * k) / 2 - minX * k;
  const dy = (SIZE - (maxY - minY) * k) / 2 - minY * k;
  const out = new Map<string, { x: number; y: number; r: number }>();
  for (const [name, p] of pos) out.set(name, { x: Math.round(p.x * k + dx), y: Math.round(p.y * k + dy), r: Math.round(p.r * k) });
  return out;
}

export async function topicMap(): Promise<TopicMap> {
  const cats = await all<{ name: string; color: string | null; count: number }>(
    `select i.category as name, (select color from categories c where c.name = i.category) as color, count(*) as count
     from items i where i.deleted_at is null and i.kind <> 'email' and i.category is not null
     group by i.category order by count desc limit 24`,
  );
  if (!cats.length) return { nodes: [], links: [], total: 0 };
  const subs = await all<{ category: string; name: string; count: number }>(
    `select category, subtopic as name, count(*) as count from items
     where deleted_at is null and kind <> 'email' and category is not null and subtopic is not null and subtopic <> ''
     group by category, subtopic order by count desc`,
  );
  const links = await all<{ a: string; b: string; shared: number }>(
    `with ct as (
       select distinct i.category as c, it.tag_id as t from items i join item_tags it on it.item_id = i.id
       where i.deleted_at is null and i.kind <> 'email' and i.category is not null)
     select x.c as a, y.c as b, count(*) as shared from ct x join ct y on x.t = y.t and x.c < y.c
     group by x.c, y.c having shared >= 2 order by shared desc limit ?`,
    MAX_LINKS,
  );
  const pos = layout(cats);
  const names = new Set(cats.map((c) => c.name));
  const nodes = cats.map((c) => ({
    ...c,
    ...pos.get(c.name)!,
    subtopics: subs.filter((s) => s.category === c.name).slice(0, 5).map((s) => ({ name: s.name, count: s.count })),
  }));
  return {
    nodes,
    links: links.filter((l) => names.has(l.a) && names.has(l.b)),
    total: cats.reduce((n, c) => n + c.count, 0),
  };
}
