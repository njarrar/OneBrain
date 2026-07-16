// Runs the real migrations, the save statements and the cleanup against an in-memory SQLite database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { saveStatements, type Incoming } from "../src/lib/ingest";
import { plan, type FileRow, type ItemRow, type SaveRow } from "./dedupe-plan";

type Stmt = { sql: string; args: unknown[] };

function fakeD1(sqlite: DatabaseSync) {
  const norm = (v: unknown) => (v === undefined ? null : v) as null | string | number;
  const make = (sql: string, args: unknown[] = []): Stmt & Record<string, unknown> => ({
    sql,
    args,
    bind: (...a: unknown[]) => make(sql, a),
    first: async () => sqlite.prepare(sql).get(...args.map(norm)) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args.map(norm)) }),
    run: async () => sqlite.prepare(sql).run(...args.map(norm)),
  });
  return {
    prepare: (sql: string) => make(sql),
    batch: async (stmts: Stmt[]) => {
      sqlite.exec("begin");
      try {
        for (const s of stmts) sqlite.prepare(s.sql).run(...s.args.map(norm));
        sqlite.exec("commit");
      } catch (err) {
        sqlite.exec("rollback");
        throw err;
      }
    },
  } as unknown as D1Database;
}

function freshDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("pragma foreign_keys = on");
  const dir = join(import.meta.dirname, "../../db/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) sqlite.exec(readFileSync(join(dir, f), "utf8"));
  return { sqlite, d: fakeD1(sqlite) };
}

async function save(d: D1Database, x: Incoming) {
  const p = await saveStatements(x, d);
  await d.batch(p.stmts);
}

const count = (s: DatabaseSync, sql: string) => (s.prepare(sql).get() as { n: number }).n;

test("the same post from the sync, the share sheet and a retry is one item", async () => {
  const { sqlite, d } = freshDb();
  await save(d, { source: "x", externalId: "20", itemKey: "20", url: "https://x.com/jack/status/20", kind: "post", body: "hello" });
  sqlite.prepare(`update items set note = 'mine', status = 'read' where id = 'x-20'`).run();
  const share: Incoming = { source: "x", externalId: "x:20", key: null, url: "https://twitter.com/jack/status/20/photo/1?s=46", title: "Jack on X" };
  await save(d, share);
  await save(d, share);
  await save(d, { source: "x", externalId: "20", itemKey: "20", url: "https://x.com/jack/status/20", kind: "post" });
  assert.equal(count(sqlite, `select count(*) n from items`), 1);
  assert.equal(count(sqlite, `select count(*) n from saves`), 2);
  const row = sqlite.prepare(`select note, status, title, canon from items`).get() as Record<string, string>;
  assert.deepEqual({ ...row }, { note: "mine", status: "read", title: "Jack on X", canon: "x:20" });
});

test("YouTube liked, in a playlist and shared as youtu.be is one item", async () => {
  const { sqlite, d } = freshDb();
  await save(d, { source: "manual", externalId: "https://youtu.be/dQw4w9WgXcQ?si=1", url: "https://youtu.be/dQw4w9WgXcQ?si=1" });
  await save(d, { source: "youtube", externalId: "liked-dQw4w9WgXcQ", itemKey: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", kind: "video", title: "Song" });
  await save(d, { source: "youtube", externalId: "PL1-dQw4w9WgXcQ", itemKey: "dQw4w9WgXcQ", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", kind: "video" });
  assert.equal(count(sqlite, `select count(*) n from items`), 1);
  assert.equal(count(sqlite, `select count(*) n from saves`), 3);
  const row = sqlite.prepare(`select kind, title from items`).get() as Record<string, string>;
  assert.deepEqual({ ...row }, { kind: "video", title: "Song" });
});

test("an item from before keys existed is still found by its link", async () => {
  const { sqlite, d } = freshDb();
  sqlite.prepare(`insert into items (id, url) values ('old', 'https://example.com/a?utm_source=x')`).run();
  await save(d, { source: "feedly", externalId: "https://example.com/a?utm_source=x", url: "https://example.com/a?utm_source=x" });
  await save(d, { source: "manual", externalId: "u", url: "https://www.example.com/a/" });
  assert.equal(count(sqlite, `select count(*) n from items`), 1);
  assert.equal(count(sqlite, `select count(*) n from saves where item_id = 'old'`), 2);
});

test("the cleanup merges old copies into the oldest and is safe to run again", async () => {
  const { sqlite } = freshDb();
  const ins = sqlite.prepare(`insert into items (id, url, kind, status, note, created_at, category) values (?, ?, ?, ?, ?, ?, ?)`);
  ins.run("x-20", "https://x.com/jack/status/20", "post", "inbox", "first note", "2026-01-01T00:00:00Z", null);
  ins.run("x-abc", "https://twitter.com/jack/status/20?s=20", "link", "archived", "second note", "2026-02-01T00:00:00Z", "AI, Code & Dev Tools");
  ins.run("m-1", "https://mobile.twitter.com/i/status/20", "link", "read", "first note", "2026-03-01T00:00:00Z", null);
  ins.run("img-1", null, "image", "inbox", null, "2026-01-05T00:00:00Z", null);
  ins.run("img-2", null, "image", "inbox", null, "2026-01-06T00:00:00Z", null);
  ins.run("solo", "https://example.com/post/", "link", "inbox", null, "2026-01-07T00:00:00Z", null);
  sqlite.exec(`insert into saves (id, item_id, source_id, external_id) values ('s1', 'x-20', 'x', '20'), ('s2', 'x-abc', 'manual', 'u1'), ('s3', 'm-1', 'x', 'x:20')`);
  sqlite.exec(`insert into tags (name) values ('keep'), ('also')`);
  sqlite.exec(`insert into item_tags (item_id, tag_id, added_by) values ('x-20', 1, 'claude'), ('x-abc', 1, 'user'), ('m-1', 2, 'import')`);
  sqlite.exec(`insert into files (id, item_id, filename, mime, size, r2_key, sha256, created_at) values
    ('f1', 'img-1', 'a.png', 'image/png', 1, 'files/f1', 'aa', '2026-01-05T00:00:00Z'),
    ('f2', 'img-2', 'a.png', 'image/png', 1, 'files/f2', 'aa', '2026-01-06T00:00:00Z')`);

  const read = () => ({
    items: sqlite.prepare(`select * from items`).all() as ItemRow[],
    saves: sqlite.prepare(`select item_id, source_id, external_id from saves`).all() as SaveRow[],
    files: sqlite.prepare(`select id, item_id, sha256, r2_key, created_at from files`).all() as FileRow[],
  });
  let r = read();
  const p = await plan(r.items, r.saves, r.files);
  assert.deepEqual(p.groups.map((g) => [g.key, g.keeper.id, g.extras.map((e) => e.id).sort()]), [
    ["x:20", "x-20", ["m-1", "x-abc"]],
    ["img:aa", "img-1", ["img-2"]],
  ]);
  sqlite.exec(p.sql.join("\n"));

  const x = sqlite.prepare(`select * from items where id = 'x-20'`).get() as ItemRow;
  assert.equal(x.status, "archived");
  assert.equal(x.note, "second note\n\nfirst note");
  assert.equal(x.category, "AI, Code & Dev Tools");
  assert.equal(x.created_at, "2026-01-01T00:00:00Z");
  assert.equal(x.canon, "x:20");
  assert.equal(count(sqlite, `select count(*) n from items`), 3);
  assert.equal(count(sqlite, `select count(*) n from saves where item_id = 'x-20'`), 3);
  assert.equal(count(sqlite, `select count(*) n from item_tags where item_id = 'x-20'`), 2);
  assert.equal(count(sqlite, `select count(*) n from item_tags where item_id = 'x-20' and added_by = 'user'`), 1);
  assert.equal(count(sqlite, `select count(*) n from files`), 1);
  assert.equal((sqlite.prepare(`select canon from items where id = 'solo'`).get() as { canon: string }).canon, "url:https://example.com/post");
  // Search still finds the merged item, and only once.
  assert.equal(count(sqlite, `select count(*) n from items_fts where items_fts match 'second'`), 1);

  r = read();
  const again = await plan(r.items, r.saves, r.files);
  assert.equal(again.groups.length, 0);
  assert.equal(again.sql.length, 0);
});
