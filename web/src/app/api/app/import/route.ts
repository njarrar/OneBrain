import { getCloudflareContext } from "@opennextjs/cloudflare";
import { allowed, denied } from "@/lib/apptoken";
import { all, db, now } from "@/lib/db";
import { saveStatements } from "@/lib/ingest";
import { BATCH, sortItems } from "@/lib/sorter";

// The iPhone app uploads what it saved on the phone, up to 200 items at a time.
// An item with the same key (see lib/canonical.ts) wins, then the same id, then the same link. Items already here keep what they have:
// the phone only fills blanks, moves an item out of the inbox, and adds tags.
const MAX_ITEMS = 200;
const CHUNK = 40;
const STATUSES = ["inbox", "read", "archived"];

type PhoneItem = {
  id?: string;
  source?: string;
  externalId?: string | null;
  url?: string | null;
  title?: string | null;
  body?: string | null;
  note?: string | null;
  author?: string | null;
  authorHandle?: string | null;
  media?: string[];
  kind?: string;
  postedAt?: string | null;
  savedAt?: string | null;
  createdAt?: string | null;
  status?: string;
  category?: string | null;
  subtopic?: string | null;
  summary?: string | null;
  lang?: string | null;
  sensitive?: boolean;
  tags?: string[];
};

const text = (v: unknown, max = 20000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

function isoOrNull(v: unknown) {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function POST(req: Request) {
  if (!(await allowed(req))) return denied();
  const b = (await req.json().catch(() => null)) as { items?: PhoneItem[] } | null;
  if (!b || !Array.isArray(b.items)) return Response.json({ error: "Send {items: [...]}" }, { status: 400 });
  if (b.items.length > MAX_ITEMS) return Response.json({ error: `At most ${MAX_ITEMS} items at a time` }, { status: 413 });

  const d = await db();
  const [sources, categories] = await Promise.all([
    all<{ id: string }>(`select id from sources`),
    all<{ name: string }>(`select name from categories`),
  ]);
  const knownSources = new Set(sources.map((s) => s.id));
  const knownCategories = new Set(categories.map((c) => c.name));

  const items = b.items.filter((x) => x && typeof x === "object");
  // Where each id, key and link already lives, so a copy under another id or spelling lands on it.
  const byId = new Map<string, string>();
  const byKey = new Map<string, string>();
  const byUrl = new Map<string, string>();
  let added = 0;
  let updated = 0;
  const toSort: string[] = [];

  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    const planned = await Promise.all(
      chunk.map((x) => {
        const phoneId = text(x.id, 100);
        const ownId = phoneId && /^[\w-]+$/.test(phoneId) ? phoneId : undefined;
        const source = x.source && knownSources.has(x.source) ? x.source : "manual";
        return saveStatements({
          source,
          id: ownId,
          externalId: text(x.externalId, 500),
          url: text(x.url, 2000),
          title: text(x.title, 500),
          body: text(x.body),
          author: text(x.author, 200),
          authorHandle: text(x.authorHandle, 200),
          media: Array.isArray(x.media) ? x.media.filter((m) => typeof m === "string") : [],
          kind: text(x.kind, 20) ?? undefined,
          postedAt: isoOrNull(x.postedAt),
          savedAt: isoOrNull(x.savedAt),
          raw: { from: "iphone", id: phoneId },
        });
      }),
    );
    const ids = planned.map((p) => p.id);
    const keys = planned.map((p) => p.key).filter((v): v is string => !!v);
    const urls = chunk.map((x) => text(x.url, 2000)).filter((v): v is string => !!v);
    const marks = (n: number) => Array(n).fill("?").join(",") || "null";
    const found = await all<{ id: string; canon: string | null; url: string | null }>(
      `select id, canon, url from items where id in (${marks(ids.length)}) or canon in (${marks(keys.length)})
       or url in (${marks(urls.length)}) order by created_at`,
      ...ids,
      ...keys,
      ...urls,
    );
    for (const r of found) {
      if (!byId.has(r.id)) byId.set(r.id, r.id);
      if (r.canon && !byKey.has(r.canon)) byKey.set(r.canon, r.id);
      if (r.url && !byUrl.has(r.url)) byUrl.set(r.url, r.id);
    }

    const stmts: D1PreparedStatement[] = [];
    for (const [n, x] of chunk.entries()) {
      const save = planned[n];
      const url = text(x.url, 2000);
      // Same order as the database uses: key, then id, then link.
      const existing = (save.key && byKey.get(save.key)) || byId.get(save.id) || (url && byUrl.get(url)) || null;
      const id = existing ?? save.id;
      byId.set(id, id);
      if (save.key && !byKey.has(save.key)) byKey.set(save.key, id);
      if (url && !byUrl.has(url)) byUrl.set(url, id);
      stmts.push(...save.stmts);

      const category = x.category && knownCategories.has(x.category) ? x.category : null;
      const status = x.status && STATUSES.includes(x.status) ? x.status : null;
      const lang = x.lang && ["en", "ar", "other"].includes(x.lang) ? x.lang : null;
      stmts.push(
        d.prepare(
          `update items set category = coalesce(category, ?), subtopic = coalesce(subtopic, ?), summary = coalesce(summary, ?),
             note = coalesce(note, ?), lang = coalesce(lang, ?), sensitive = max(sensitive, ?),
             status = case when status = 'inbox' and ? is not null then ? else status end, updated_at = ?
           where id = ?`,
        ).bind(
          category, text(x.subtopic, 200), text(x.summary, 500), text(x.note), lang, x.sensitive ? 1 : 0,
          status, status, now(), id,
        ),
      );
      const createdAt = isoOrNull(x.createdAt);
      // The older date wins, so a copy never makes an item look new.
      if (createdAt) stmts.push(d.prepare(`update items set created_at = min(created_at, ?) where id = ?`).bind(createdAt, id));

      const tags = Array.isArray(x.tags) ? x.tags.filter((t) => typeof t === "string") : [];
      for (const name of new Set(tags.map((t) => t.trim().slice(0, 60)).filter(Boolean))) {
        stmts.push(
          d.prepare(`insert or ignore into tags (name) values (?)`).bind(name),
          d.prepare(
            `insert into item_tags (item_id, tag_id, added_by) select ?, id, 'user' from tags where name = ?
             on conflict (item_id, tag_id) do update set added_by = 'user'`,
          ).bind(id, name),
        );
      }

      if (existing) updated++;
      else {
        added++;
        if (!category) toSort.push(id);
      }
    }
    if (stmts.length) await d.batch(stmts);
  }

  // Claude sorts the new unsorted items in the background, a batch at a time.
  if (toSort.length) {
    getCloudflareContext().ctx.waitUntil(
      (async () => {
        for (let i = 0; i < toSort.length; i += BATCH) await sortItems(toSort.slice(i, i + BATCH));
      })().catch((err) => console.error("sort failed", err)),
    );
  }
  return Response.json({ added, updated });
}
