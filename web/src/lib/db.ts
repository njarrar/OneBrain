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
