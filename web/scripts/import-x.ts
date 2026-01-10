// Imports X bookmarks from JSON files made by the older tools:
//   x-bookmark-manager/bookmarks_export.json  (id, url, name, handle, time, text, media, links)
//   x-bookmarks-review/bookmarks_db.json       (same, plus category, tags, lang, is_sensitive)
// Safe to run again: bookmarks already there only pick up new tags or a missing category.
//
//   npm run import:x -- file.json [more.json ...] [--remote] [--status inbox|read|archived]
//
// Writes the SQL to .import/x.sql, then runs it on the local D1 copy (or the real one with --remote).
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

type Bookmark = {
  id: string;
  url?: string;
  name?: string;
  handle?: string;
  time?: string;
  text?: string;
  media?: string[];
  links?: string[];
  category?: string;
  tags?: string[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  let status = "inbox";
  let remote = false;
  const files: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--status") status = args[++i];
    else if (args[i] === "--remote") remote = true;
    else files.push(args[i]);
  }
  if (!["inbox", "read", "archived"].includes(status)) throw new Error(`bad --status ${status}`);
  if (!files.length) throw new Error("give at least one JSON file");
  return { files, status, remote };
}

const q = (v: string | null | undefined) => (v == null ? "null" : `'${v.replace(/'/g, "''")}'`);

function tweetUrl(b: Bookmark): string {
  const handle = (b.handle ?? "").replace(/^@/, "");
  if (handle) return `https://x.com/${handle}/status/${b.id}`;
  return (b.url ?? `https://x.com/i/status/${b.id}`).replace("twitter.com", "x.com");
}

function postedAt(time?: string): string | null {
  if (!time) return null;
  const d = new Date(time);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function statements(b: Bookmark, status: string): string[] {
  const url = tweetUrl(b);
  const out = [
    `insert into items (id, body, url, kind, status, author, author_handle, posted_at, media)
     values (${q(`x-${b.id}`)}, ${q(b.text?.trim())}, ${q(url)}, 'post', ${q(status)}, ${q(b.name)},
             ${q(b.handle)}, ${q(postedAt(b.time))}, ${q(JSON.stringify(b.media ?? []))})
     on conflict do nothing;`,
    `insert into saves (id, item_id, source_id, external_id, original_url, raw)
     select ${q(`xs-${b.id}`)}, id, 'x', ${q(b.id)}, ${q(b.url ?? url)}, ${q(JSON.stringify(b))}
     from items where url = ${q(url)}
     on conflict do nothing;`,
  ];
  if (b.category) {
    out.push(
      `update items set category = ${q(b.category)}
       where url = ${q(url)} and category is null and exists (select 1 from categories where name = ${q(b.category)});`,
    );
  }
  for (const tag of b.tags ?? []) {
    out.push(
      `insert or ignore into tags (name) values (${q(tag)});`,
      `insert or ignore into item_tags (item_id, tag_id, added_by)
       select i.id, t.id, 'import' from items i, tags t where i.url = ${q(url)} and t.name = ${q(tag)};`,
    );
  }
  return out;
}

function main() {
  const { files, status, remote } = parseArgs();
  const sql: string[] = [];
  let count = 0;
  for (const file of files) {
    const list = JSON.parse(readFileSync(file, "utf8")) as Bookmark[];
    for (const b of list) {
      if (!b.id) continue;
      sql.push(...statements(b, status));
      count++;
    }
    console.log(`${file}: ${list.length} bookmarks read`);
  }
  sql.push(
    `insert into sync_runs (source_id, finished_at, added) values ('x', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ${count});`,
    `update sources set status = case status when 'not_connected' then 'import' else status end,
       last_sync_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = 'x';`,
  );

  mkdirSync(".import", { recursive: true });
  writeFileSync(".import/x.sql", sql.join("\n") + "\n");
  console.log(`wrote .import/x.sql (${count} bookmarks), running it on the ${remote ? "real" : "local"} database`);
  execFileSync(
    "npx",
    ["wrangler", "d1", "execute", "DB", remote ? "--remote" : "--local", "--file", ".import/x.sql", "--yes"],
    { stdio: "inherit" },
  );
}

main();
