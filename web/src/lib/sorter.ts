import { z } from "zod";
import { aiReady, askJson, type Part } from "@/lib/ai";
import { all, db, env, first, now } from "@/lib/db";
import { base64 } from "@/lib/memory/read";

// The chosen AI (Claude, ChatGPT or Gemini) sorts items the way x-bookmarks-review did: one of the categories, a sub-topic,
// a one-line summary, a few tags, the language, and whether it is sensitive.

export const BATCH = 20;
// New categories the AI may add, so the list stays short enough to scan.
const MAX_CATEGORIES = 24;
// Colors for categories the AI adds, in turn.
const NEW_COLORS = ["#0ea5e9", "#f97316", "#14b8a6", "#e11d48", "#84cc16", "#8b5cf6", "#f59e0b", "#06b6d4"];
const MAX_TEXT = 1500;

type Pending = {
  id: string;
  title: string | null;
  body: string | null;
  url: string | null;
  author: string | null;
  author_handle: string | null;
  media: string;
  kind: string;
  transcript: string | null;
};

const MAX_IMAGE = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

// Screenshots and photos have no text, so Claude looks at the picture itself.
async function pictureBlock(itemId: string): Promise<Part | null> {
  const f = await first<{ mime: string; size: number; r2_key: string }>(
    `select mime, size, r2_key from files where item_id = ? and mime like 'image/%' order by created_at limit 1`,
    itemId,
  );
  if (!f || f.size > MAX_IMAGE || !IMAGE_TYPES.has(f.mime)) return null;
  const obj = await (await env()).FILES.get(f.r2_key);
  if (!obj) return null;
  const data = base64(new Uint8Array(await obj.arrayBuffer()));
  return { type: "image", mime: f.mime, data };
}

export async function sorterReady() {
  return aiReady();
}

export async function unsortedCount() {
  return (await first<{ n: number }>(`select count(*) as n from items where category is null and deleted_at is null`))?.n ?? 0;
}

async function taxonomy() {
  const cats = await all<{ name: string; description: string | null }>(`select name, description from categories order by name`);
  const subs = await all<{ category: string; subtopic: string }>(
    `select category, subtopic from items where subtopic is not null and category is not null
     group by category, subtopic order by category, count(*) desc`,
  );
  const lines = cats.map((c) => {
    const known = subs.filter((s) => s.category === c.name).map((s) => s.subtopic);
    return `- ${c.name}: ${c.description ?? ""}${known.length ? `\n  Sub-topics in use: ${known.join("; ")}` : ""}`;
  });
  return { names: cats.map((c) => c.name), text: lines.join("\n") };
}

function describe(p: Pending) {
  const text = [p.title, p.body, p.transcript && `Heard or read in it: ${p.transcript}`].filter(Boolean).join("\n").slice(0, MAX_TEXT);
  const pics = JSON.parse(p.media || "[]").length;
  return [
    `<item id="${p.id}">`,
    p.author || p.author_handle ? `Author: ${[p.author, p.author_handle].filter(Boolean).join(" ")}` : null,
    p.url ? `Link: ${p.url}` : null,
    pics ? `Pictures: ${pics}` : null,
    text || "(no text)",
    `</item>`,
  ].filter(Boolean).join("\n");
}

async function contentFor(pending: Pending[]): Promise<Part[]> {
  const blocks: Part[] = [];
  for (const p of pending) {
    blocks.push({ type: "text", text: describe(p) });
    if (p.kind === "image") {
      const pic = await pictureBlock(p.id);
      if (pic) blocks.push({ type: "text", text: `Picture for item ${p.id}:` }, pic);
    }
  }
  return blocks;
}

// Sorts the given items, or the next batch of unsorted ones. Returns how many it sorted.
export async function sortItems(ids?: string[]): Promise<number> {
  if (!(await aiReady())) return 0;

  const pending = ids?.length
    ? await all<Pending>(
        `select id, title, body, url, author, author_handle, media, kind, transcript from items where id in (${ids.map(() => "?").join(",")})`,
        ...ids,
      )
    : await all<Pending>(
        `select id, title, body, url, author, author_handle, media, kind, transcript from items where category is null and deleted_at is null
         order by coalesce(posted_at, created_at) desc limit ?`,
        BATCH,
      );
  if (!pending.length) return 0;

  const { names, text } = await taxonomy();
  const Result = z.object({
    items: z.array(
      z.object({
        id: z.string(),
        category: z.string(),
        // Only when category is a new one: a short line on what belongs in it. Empty otherwise.
        new_category_about: z.string(),
        subtopic: z.string(),
        summary: z.string(),
        tags: z.array(z.string()),
        lang: z.enum(["en", "ar", "other"]),
        sensitive: z.boolean(),
      }),
    ),
  });

  const response = await askJson({
    name: "sorted_items",
    maxTokens: 8000,
    system: `You sort one person's saved items (bookmarks, posts, emails, Pinterest pins, notes, screenshots and voice memos), in English or Arabic.

Categories:
${text}

For every item give:
- category: the best fit, written exactly as it appears in the list. The list isn't fixed: when nothing fits well, make a new broad category (1 to 3 words, Title Case, like "Family", "Bills & Receipts", "Work Email") that other items could share too. Reuse a new category you made earlier in this batch rather than making near-copies.${names.length >= MAX_CATEGORIES ? " The list is full, so pick the closest existing category." : ""}
- new_category_about: for a new category only, one short line saying what belongs in it. Empty for an existing one.
- subtopic: reuse a sub-topic already in use for that category when one fits; otherwise write a short new one in the same style.
- summary: one plain English line (under 20 words) saying what the item is about, even when the item is in Arabic.
- tags: 2 to 4 short English tags in Title Case.
- lang: "ar" if the text is mainly Arabic, "en" if mainly English, otherwise "other".
- sensitive: true for adult, explicit or NSFW content.`,
    parts: await contentFor(pending),
    schema: Result,
  });
  const out = response?.items ?? [];

  const d = await db();
  const known = new Set(pending.map((p) => p.id));
  const valid = new Map(names.map((n) => [n.toLowerCase(), n]));
  const stmts: D1PreparedStatement[] = [];
  let sorted = 0;
  for (const r of out) {
    if (!known.has(r.id)) continue;
    const asked = r.category.trim().replace(/\s+/g, " ");
    let category = valid.get(asked.toLowerCase());
    // A new category, when there's room and the name looks like one.
    if (!category && valid.size < MAX_CATEGORIES && /^[\p{L}\p{N}][\p{L}\p{N} &',-]{1,38}$/u.test(asked)) {
      category = asked;
      stmts.push(
        d.prepare(`insert or ignore into categories (name, description, color) values (?, ?, ?)`)
          .bind(category, r.new_category_about.trim().slice(0, 200), NEW_COLORS[valid.size % NEW_COLORS.length]),
      );
      valid.set(asked.toLowerCase(), category);
    }
    if (!category) continue;
    sorted++;
    r.category = category;
    stmts.push(
      d.prepare(
        `update items set category = coalesce(category, ?), subtopic = coalesce(subtopic, ?), summary = coalesce(summary, ?),
           lang = ?, sensitive = max(sensitive, ?), embedded_at = null, updated_at = ? where id = ?`,
      ).bind(r.category, r.subtopic.trim(), r.summary.trim(), r.lang, r.sensitive ? 1 : 0, now(), r.id),
    );
    for (const tag of [...new Set(r.tags.map((t) => t.trim()).filter(Boolean))].slice(0, 4)) {
      stmts.push(
        d.prepare(`insert or ignore into tags (name) values (?)`).bind(tag),
        d.prepare(
          `insert or ignore into item_tags (item_id, tag_id, added_by) select ?, id, 'claude' from tags where name = ?`,
        ).bind(r.id, tag),
      );
    }
  }
  if (stmts.length) await d.batch(stmts);
  return sorted;
}
