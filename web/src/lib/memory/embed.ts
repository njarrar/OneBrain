import { all, db, env, now } from "@/lib/db";
import { ITEM_COLUMNS, parseItem, type ItemRow, type RawItem } from "@/lib/items/sql";
import { factsText, parseFacts } from "@/lib/memory/read";

// Meaning search: every item's text becomes a vector in Vectorize, so Brain can find things by
// what they are about, not only by their words (and across English and Arabic). Used by Related
// on the item page, the ⌘K box and Ask.

const MODEL = "@cf/baai/bge-m3";
const MAX_CHARS = 2000;
const EMBED_BATCH = 50; // texts per Workers AI call
const UPSERT_BATCH = 100;

type Source = {
  id: string;
  title: string | null;
  body: string | null;
  summary: string | null;
  note: string | null;
  subtopic: string | null;
  category: string | null;
  author: string | null;
  url: string | null;
  transcript: string | null;
  facts: string | null;
};

async function bindings(): Promise<{ ai: Ai; index: Vectorize } | null> {
  const e = await env();
  return e.AI && e.VECTORS ? { ai: e.AI, index: e.VECTORS } : null;
}

// Whether this deployment has the AI and Vectorize bindings (local runs may not).
export async function memoryReady(): Promise<boolean> {
  return !!(await bindings());
}

// The text that stands for an item: what it is about first, then its own words.
export function textOf(s: Source): string {
  return [s.title, s.summary, factsText(parseFacts(s.facts)), s.subtopic, s.category, s.note, s.transcript, s.body, s.author, s.url]
    .filter((x): x is string => !!x?.trim())
    .join("\n")
    .slice(0, MAX_CHARS);
}

async function embed(ai: Ai, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = (await ai.run(MODEL, { text: batch })) as { data?: number[][]; response?: number[][] };
    const vectors = res.data ?? res.response;
    if (!vectors || vectors.length !== batch.length) throw new Error("Workers AI returned no vectors");
    out.push(...vectors);
  }
  return out;
}

// Makes vectors for the given items, or for the next batch still missing one. Returns how many.
export async function embedItems(ids?: string[], limit = 200): Promise<number> {
  const b = await bindings();
  if (!b) return 0;
  const cols = `id, title, body, summary, note, subtopic, category, author, url, transcript, facts`;
  const rows = ids?.length
    ? await all<Source>(`select ${cols} from items where deleted_at is null and id in (${ids.map(() => "?").join(",")})`, ...ids)
    : await all<Source>(
        `select ${cols} from items where embedded_at is null and deleted_at is null order by created_at desc limit ?`,
        limit,
      );
  const usable = rows.filter((r) => textOf(r));
  if (!usable.length) return 0;

  const vectors = await embed(b.ai, usable.map(textOf));
  for (let i = 0; i < usable.length; i += UPSERT_BATCH) {
    await b.index.upsert(
      usable.slice(i, i + UPSERT_BATCH).map((r, j) => ({ id: r.id, values: vectors[i + j], metadata: { category: r.category ?? "" } })),
    );
  }
  const d = await db();
  const stamp = now();
  await d.batch(usable.map((r) => d.prepare(`update items set embedded_at = ? where id = ?`).bind(stamp, r.id)));
  return usable.length;
}

// Removes vectors for items deleted for good.
export async function forgetItems(ids: string[]) {
  const b = await bindings();
  if (!ids.length || !b) return;
  for (let i = 0; i < ids.length; i += 1000) await b.index.deleteByIds(ids.slice(i, i + 1000));
}

export type Scored = ItemRow & { score: number };

// Loads matches in score order, leaving out anything in Trash or gone.
async function hydrate(matches: { id: string; score: number }[], skip?: string): Promise<Scored[]> {
  const wanted = matches.filter((m) => m.id !== skip);
  if (!wanted.length) return [];
  const rows = await all<RawItem>(
    `select ${ITEM_COLUMNS} from items i where i.deleted_at is null and i.id in (${wanted.map(() => "?").join(",")})`,
    ...wanted.map((m) => m.id),
  );
  const byId = new Map(rows.map((r) => [r.id, parseItem(r)]));
  return wanted.flatMap((m) => {
    const item = byId.get(m.id);
    return item ? [{ ...item, score: m.score }] : [];
  });
}

// Below these scores, matches are mostly noise.
const MIN_RELATED = 0.55;
const MIN_SEARCH = 0.45;

// Items about the same thing as this one. Empty until the item has a vector.
export async function relatedItems(id: string, k = 6): Promise<Scored[]> {
  const b = await bindings();
  if (!b) return [];
  try {
    const res = await b.index.queryById(id, { topK: k + 1 });
    return hydrate(res.matches.filter((m) => m.score >= MIN_RELATED), id);
  } catch {
    return []; // not embedded yet
  }
}

// Items that match a question or phrase by meaning.
export async function searchByMeaning(q: string, k = 8): Promise<Scored[]> {
  const text = q.trim().slice(0, MAX_CHARS);
  const b = await bindings();
  if (!text || !b) return [];
  const [vector] = await embed(b.ai, [text]);
  const res = await b.index.query(vector, { topK: k });
  return hydrate(res.matches.filter((m) => m.score >= MIN_SEARCH));
}
