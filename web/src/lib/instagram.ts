import { unzipSync, strFromU8 } from "fflate";
import { db } from "@/lib/db";
import { markSynced, saveStatements, type Incoming } from "@/lib/ingest";

// Reads Instagram's "Download your information" export: saved_posts.json and saved_collections.json,
// or the whole .zip. Instagram only gives the link, the account and the time, not the picture.
const POST_LINK = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/([\w-]+)/i;

type Found = { href: string; code: string; author: string | null; at: number | null; collection: string | null };

function walk(node: unknown, author: string | null, collection: string | null, out: Map<string, Found>) {
  if (Array.isArray(node)) {
    for (const n of node) walk(n, author, collection, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  // Collections look like { title: "Collection name", ... } with the saves under them;
  // saves look like { title: "username", string_map_data: { "Saved on": { href, timestamp } } }.
  const title = typeof o.title === "string" ? o.title : null;
  const href = typeof o.href === "string" ? o.href : null;
  const m = href?.match(POST_LINK);
  if (m && !out.has(m[3])) {
    out.set(m[3], { href: href!, code: m[3], author, at: typeof o.timestamp === "number" ? o.timestamp : null, collection });
  }
  const isCollection = o.string_map_data && typeof o.string_map_data === "object" && "Creation Time" in (o.string_map_data as object);
  for (const [k, v] of Object.entries(o)) {
    if (k === "title") continue;
    walk(v, title && !isCollection ? title : author, isCollection ? title : collection, out);
  }
}

function jsonFiles(name: string, bytes: Uint8Array): unknown[] {
  if (!/\.zip$/i.test(name)) return [JSON.parse(new TextDecoder().decode(bytes))];
  const files = unzipSync(bytes, { filter: (f) => /saved_(posts|collections)\.json$/i.test(f.name) });
  const docs = Object.values(files).map((f) => JSON.parse(strFromU8(f)));
  if (!docs.length) throw new Error("No saved_posts.json in that zip. Pick JSON as the format when you ask Instagram for your data.");
  return docs;
}

export async function importInstagram(name: string, bytes: Uint8Array): Promise<{ found: number; added: number }> {
  const found = new Map<string, Found>();
  for (const doc of jsonFiles(name, bytes)) walk(doc, null, null, found);
  if (!found.size) throw new Error("No saved Instagram posts in that file.");

  const d = await db();
  const before = (await d.prepare(`select count(*) as n from saves where source_id = 'instagram'`).first<{ n: number }>())?.n ?? 0;
  const incoming: Incoming[] = [...found.values()].map((f) => ({
    source: "instagram",
    externalId: f.code,
    url: `https://www.instagram.com/${f.href.match(/\/(reels?|tv)\//i) ? "reel" : "p"}/${f.code}/`,
    title: f.author ? `Post by @${f.author}` : "Instagram post",
    authorHandle: f.author ? `@${f.author}` : null,
    author: f.author,
    kind: "post",
    savedAt: f.at ? new Date(f.at * 1000).toISOString() : null,
    raw: f,
  }));
  for (let i = 0; i < incoming.length; i += 40) {
    const stmts = (await Promise.all(incoming.slice(i, i + 40).map((x) => saveStatements(x)))).flatMap((s) => s.stmts);
    await d.batch(stmts);
  }
  const after = (await d.prepare(`select count(*) as n from saves where source_id = 'instagram'`).first<{ n: number }>())?.n ?? 0;
  await markSynced("instagram", after - before, null, "import");
  return { found: found.size, added: after - before };
}
