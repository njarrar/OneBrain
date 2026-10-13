// Finds items that are copies of each other (the same post, video, link or picture saved twice or
// from two places) and merges each group into its oldest item: saves, files and tags move over, the most
// advanced status wins (archived > read > inbox), notes are kept and joined, blanks are filled, the copies go.
// Also writes every item's key (items.canon), which new saves use to avoid copies. Safe to run again.
//
//   npm run dedupe                         dry run on the local database: prints the groups, changes nothing
//   npm run dedupe -- --remote             dry run on the real database
//   npm run dedupe -- --remote --apply     merge for real (take a backup first: wrangler d1 export DB --remote)
//   --hash-files                           also download pictures that have no hash yet and hash them,
//                                          so the same screenshot uploaded twice is found (slow)
//
// Needs migration 0008_item_keys.sql applied first. The SQL it would run is written to .dedupe/merge.sql.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256Hex } from "../src/lib/canonical";
import { plan, type FileRow, type ItemRow, type SaveRow } from "./dedupe-plan";

const BUCKET = "digital-brain-files";
const args = new Set(process.argv.slice(2));
const where = args.has("--remote") ? "--remote" : "--local";
const apply = args.has("--apply");

function wrangler(extra: string[], capture = true) {
  return execFileSync("npx", ["wrangler", ...extra], {
    encoding: capture ? "utf8" : undefined,
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    maxBuffer: 1 << 30,
  });
}

function select<T>(sql: string): T[] {
  const out = wrangler(["d1", "execute", "DB", where, "--json", "--command", sql]) as string;
  const parsed = JSON.parse(out) as { results: T[] }[];
  return parsed.flatMap((r) => r.results ?? []);
}

// Pages through a table, so a large one does not hit the response limit.
function selectAll<T>(sql: string, order: string, size = 2000): T[] {
  const rows: T[] = [];
  for (let offset = 0; ; offset += size) {
    const page = select<T>(`${sql} order by ${order} limit ${size} offset ${offset}`);
    rows.push(...page);
    if (page.length < size) return rows;
  }
}

function runFile(path: string) {
  wrangler(["d1", "execute", "DB", where, "--file", path, "--yes"], false);
}

async function hashFiles(files: FileRow[]): Promise<string[]> {
  const missing = files.filter((f) => !f.sha256);
  if (!missing.length) return [];
  console.log(`hashing ${missing.length} pictures from ${BUCKET}...`);
  const dir = mkdtempSync(join(tmpdir(), "dedupe-"));
  const sql: string[] = [];
  try {
    for (const f of missing) {
      const path = join(dir, "obj");
      try {
        wrangler(["r2", "object", "get", `${BUCKET}/${f.r2_key}`, where, "--file", path], false);
        f.sha256 = await sha256Hex(new Uint8Array(readFileSync(path)));
        sql.push(`update files set sha256 = '${f.sha256}' where id = '${f.id.replace(/'/g, "''")}';`);
      } catch (err) {
        console.warn(`  could not read ${f.r2_key}: ${(err as Error).message}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return sql;
}

async function main() {
  console.log(`${apply ? "MERGING" : "Dry run"} on the ${where === "--remote" ? "real" : "local"} database`);
  const items = selectAll<ItemRow>(
    `select id, url, canon, kind, status, title, body, note, summary, category, subtopic, author, author_handle,
       posted_at, lang, sensitive, media, created_at, transcript, facts, text_at from items`,
    "created_at, id",
    500,
  );
  const saves = selectAll<SaveRow>(`select item_id, source_id, external_id from saves`, "id");
  const files = selectAll<FileRow>(`select id, item_id, sha256, r2_key, created_at from files`, "id");
  console.log(`${items.length} items, ${saves.length} saves, ${files.length} files`);

  const hashSql = args.has("--hash-files") ? await hashFiles(files) : [];
  const p = await plan(items, saves, files);

  const sourcesOf = (id: string) => [...new Set(saves.filter((s) => s.item_id === id).map((s) => s.source_id))].join("+") || "-";
  for (const g of p.groups) {
    console.log(`\n${g.key}  (${g.extras.length + 1} copies)`);
    console.log(`  keep    ${g.keeper.id}  ${g.keeper.created_at}  ${g.keeper.status}  [${sourcesOf(g.keeper.id)}]  ${g.keeper.url ?? ""}`);
    for (const e of g.extras) console.log(`  merge   ${e.id}  ${e.created_at}  ${e.status}  [${sourcesOf(e.id)}]  ${e.url ?? ""}`);
  }
  const extras = p.groups.reduce((n, g) => n + g.extras.length, 0);
  console.log(
    `\n${p.groups.length} duplicate groups, ${extras} extra items to merge, ${p.rekeyed} items to key, ` +
      `${p.duplicateFiles.length} duplicate file rows` + (hashSql.length ? `, ${hashSql.length} pictures hashed` : ""),
  );
  if (p.duplicateFiles.length) {
    console.log("R2 objects no longer used after the merge (not deleted):");
    for (const f of p.duplicateFiles) console.log(`  ${f.r2_key}`);
  }

  const sql = [...hashSql, ...p.sql];
  mkdirSync(".dedupe", { recursive: true });
  writeFileSync(".dedupe/merge.sql", sql.join("\n") + "\n");
  if (!sql.length) return console.log("Nothing to do.");
  if (!apply) return console.log(`Wrote .dedupe/merge.sql (${sql.length} statements). Run again with --apply to merge.`);
  runFile(".dedupe/merge.sql");
  console.log("Done. Run again without --apply to check: it should find 0 groups.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
