import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function env(): Promise<CloudflareEnv> {
  return (await getCloudflareContext({ async: true })).env;
}

export async function db(): Promise<D1Database> {
  return (await env()).DB;
}

export async function all<T>(query: string, ...params: unknown[]): Promise<T[]> {
  const { results } = await (await db()).prepare(query).bind(...params).all<T>();
  return results;
}

export async function first<T>(query: string, ...params: unknown[]): Promise<T | null> {
  return (await db()).prepare(query).bind(...params).first<T>();
}

export async function run(query: string, ...params: unknown[]) {
  return (await db()).prepare(query).bind(...params).run();
}

export const now = () => new Date().toISOString();

// Turns what a person types into an FTS5 query: every word must match, as a prefix.
export function ftsQuery(input: string): string | null {
  const words = input
    .split(/\s+/)
    .map((w) => w.replace(/["*^():]/g, "").trim())
    .filter(Boolean);
  return words.length ? words.map((w) => `"${w}"*`).join(" ") : null;
}

// Small words that say nothing about a question's subject, in English and Arabic.
const STOP = new Set(
  ("a an and are about any did do does for from have how i in is it me my of on or save saved say said show that the " +
    "this to was what when where which who why with you your ما ماذا عن في من على هل الذي التي كيف لماذا متى أين").split(" "),
);

// For a question in plain words: any subject word may match, and the best matches rank first.
export function questionFtsQuery(input: string): string | null {
  const words = [...new Set(
    input
      .toLowerCase()
      .split(/[^\p{L}\p{M}\p{N}_@#-]+/u)
      .map((w) => w.replace(/^[#@-]+|-+$/g, ""))
      .filter((w) => w.length > 1 && !STOP.has(w)),
  )].slice(0, 12);
  return words.length ? words.map((w) => `"${w}"*`).join(" OR ") : null;
}
