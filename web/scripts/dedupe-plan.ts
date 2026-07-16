// Works out which items are copies of each other and the SQL that merges them. No I/O here,
// so it can be tested; scripts/dedupe.ts reads the database and runs the result.
import { idForKey, identityKey, noteKey, STATUS_RANK } from "../src/lib/canonical";

export type ItemRow = {
  id: string;
  url: string | null;
  canon: string | null;
  kind: string;
  status: string;
  title: string | null;
  body: string | null;
  note: string | null;
  summary: string | null;
  category: string | null;
  subtopic: string | null;
  author: string | null;
  author_handle: string | null;
  posted_at: string | null;
  lang: string | null;
  sensitive: number;
  media: string;
  created_at: string;
};
export type SaveRow = { item_id: string; source_id: string; external_id: string | null };
export type FileRow = { id: string; item_id: string; sha256: string | null; r2_key: string; created_at: string };

export type Group = { key: string; keeper: ItemRow; extras: ItemRow[] };
export type Plan = {
  groups: Group[];
  rekeyed: number;
  duplicateFiles: FileRow[];
  sql: string[];
};

const q = (v: string | number | null | undefined) =>
  v == null ? "null" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;

// The key for an item already in the database, by the same rules new saves use.
export async function keyOf(item: ItemRow, saves: SaveRow[], files: FileRow[]): Promise<string | null> {
  if (item.url) {
    const k = identityKey({ url: item.url });
    if (k) return k;
  }
  // Ids the imports made: x-<tweet id>, youtube-<video id>, instagram-<shortcode>.
  const m = item.id.match(/^(x|youtube|instagram)-(.+)$/);
  if (m && !(m[2].length === 20 && /^[0-9a-f]+$/.test(m[2]))) {
    const k = identityKey({ source: m[1], externalId: m[2] });
    if (k) return k;
  }
  for (const s of saves) {
    const k = s.external_id ? identityKey({ source: s.source_id, externalId: s.external_id }) : null;
    if (k) return k;
  }
  const hash = files.filter((f) => f.sha256).sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.sha256;
  if (hash && item.kind === "image") return `img:${hash}`;
  if (item.kind === "note") {
    const words = item.body ?? item.note ?? item.title;
    return words ? noteKey(words) : null;
  }
  // Whatever key a new save already gave it (a picture or note hashed on the way in).
  return item.canon;
}

// Notes: keep the longest, and add any other note it does not already contain.
export function mergeNotes(notes: (string | null)[]): string | null {
  const list = [...new Set(notes.map((n) => n?.trim()).filter((n): n is string => !!n))].sort((a, b) => b.length - a.length);
  const kept: string[] = [];
  for (const n of list) if (!kept.some((k) => k.includes(n))) kept.push(n);
  return kept.length ? kept.join("\n\n") : null;
}

function pickKeeper(key: string, items: ItemRow[]): ItemRow {
  const preferred = idForKey(key);
  return [...items].sort(
    (a, b) =>
      a.created_at.localeCompare(b.created_at) ||
      Number(b.id === preferred) - Number(a.id === preferred) ||
      a.id.localeCompare(b.id),
  )[0];
}

export async function plan(items: ItemRow[], saves: SaveRow[], files: FileRow[]): Promise<Plan> {
  const savesBy = new Map<string, SaveRow[]>();
  for (const s of saves) savesBy.set(s.item_id, [...(savesBy.get(s.item_id) ?? []), s]);
  const filesBy = new Map<string, FileRow[]>();
  for (const f of files) filesBy.set(f.item_id, [...(filesBy.get(f.item_id) ?? []), f]);

  const byKey = new Map<string, ItemRow[]>();
  const keyFor = new Map<string, string | null>();
  for (const item of items) {
    const key = await keyOf(item, savesBy.get(item.id) ?? [], filesBy.get(item.id) ?? []);
    keyFor.set(item.id, key);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }

  const groups: Group[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    const keeper = pickKeeper(key, list);
    groups.push({ key, keeper, extras: list.filter((i) => i !== keeper) });
  }
  groups.sort((a, b) => b.extras.length - a.extras.length || a.key.localeCompare(b.key));

  const merge: string[] = [];
  const keepers = new Set<string>();
  for (const { key, keeper, extras } of groups) {
    keepers.add(keeper.id);
    const all = [keeper, ...extras];
    const ids = extras.map((e) => q(e.id)).join(", ");
    // Saves and files move; tags are copied (a tag you added stays yours), then the copies go.
    merge.push(
      `update saves set item_id = ${q(keeper.id)} where item_id in (${ids});`,
      `update files set item_id = ${q(keeper.id)} where item_id in (${ids});`,
      `insert into item_tags (item_id, tag_id, added_by, added_at)
         select ${q(keeper.id)}, tag_id, added_by, added_at from item_tags where item_id in (${ids})
         order by added_by = 'user' desc
         on conflict (item_id, tag_id) do update set added_by = case when excluded.added_by = 'user' then 'user' else item_tags.added_by end;`,
      `delete from items where id in (${ids});`,
    );
    const status = all.map((i) => i.status).sort((a, b) => (STATUS_RANK[b] ?? 0) - (STATUS_RANK[a] ?? 0))[0];
    const fill = (f: keyof ItemRow) => all.map((i) => i[f]).find((v) => v != null && v !== "") ?? null;
    const media = all.map((i) => i.media).find((m) => m && m !== "[]") ?? "[]";
    const created = all.map((i) => i.created_at).sort()[0];
    merge.push(
      `update items set status = ${q(status)}, note = ${q(mergeNotes(all.map((i) => i.note)))},
         title = ${q(fill("title") as string | null)}, body = ${q(fill("body") as string | null)},
         summary = ${q(fill("summary") as string | null)}, category = ${q(fill("category") as string | null)},
         subtopic = ${q(fill("subtopic") as string | null)}, author = ${q(fill("author") as string | null)},
         author_handle = ${q(fill("author_handle") as string | null)}, posted_at = ${q(fill("posted_at") as string | null)},
         lang = ${q(fill("lang") as string | null)}, url = ${q(fill("url") as string | null)},
         sensitive = ${Math.max(...all.map((i) => i.sensitive ?? 0))}, media = ${q(media)}, created_at = ${q(created)},
         canon = ${q(key)}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       where id = ${q(keeper.id)};`,
    );
  }

  // Every other item gets its key written, clearing any stale one first so no two items clash on the way.
  const survivors = items.filter((i) => !groups.some((g) => g.extras.includes(i)));
  const rekey = survivors.filter((i) => !keepers.has(i.id) && keyFor.get(i.id) && keyFor.get(i.id) !== i.canon);
  const clear = survivors.filter((i) => i.canon && keyFor.get(i.id) !== i.canon);
  const sql: string[] = [];
  if (clear.length) sql.push(`update items set canon = null where id in (${clear.map((i) => q(i.id)).join(", ")});`);
  sql.push(...merge);
  for (const i of rekey) sql.push(`update items set canon = ${q(keyFor.get(i.id)!)} where id = ${q(i.id)};`);

  // The same picture twice on one item (two copies merged) keeps the oldest file row.
  const keeperOf = new Map<string, string>();
  for (const g of groups) for (const e of g.extras) keeperOf.set(e.id, g.keeper.id);
  const seen = new Set<string>();
  const duplicateFiles: FileRow[] = [];
  for (const f of [...files].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!f.sha256) continue;
    const k = `${keeperOf.get(f.item_id) ?? f.item_id}|${f.sha256}`;
    if (seen.has(k)) duplicateFiles.push(f);
    else seen.add(k);
  }
  if (duplicateFiles.length) sql.push(`delete from files where id in (${duplicateFiles.map((f) => q(f.id)).join(", ")});`);

  return { groups, rekeyed: rekey.length, duplicateFiles, sql };
}
