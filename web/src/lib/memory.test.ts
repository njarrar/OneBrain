import { test } from "node:test";
import assert from "node:assert/strict";
import { ItemChange, SaveJson, parseListFilter, tagList } from "./items/schema";
import { decodeCursor, encodeCursor } from "./items/sql";
import { nextSchedule } from "./memory/reminders";
import { digestDue, weekEnd, weekStart } from "./memory/digest";
import { firstUrl, isWebLink, sourceOfUrl } from "./sources";

test("an item change refuses unknown fields and bad values", () => {
  assert.equal(ItemChange.safeParse({ status: "archived" }).success, true);
  assert.equal(ItemChange.safeParse({ status: "gone" }).success, false);
  assert.equal(ItemChange.safeParse({ deleted_at: "x" }).success, false);
  assert.equal(ItemChange.safeParse({ read: "yes" }).success, false);
  assert.equal(ItemChange.safeParse({ addTags: Array(21).fill("a") }).success, false);
  assert.equal(ItemChange.safeParse({ remindAt: "tomorrow" }).success, false);
  assert.equal(ItemChange.safeParse({ remindAt: null }).success, true);
  assert.equal(ItemChange.safeParse({ remindAt: "2026-10-01T09:00:00.000Z" }).success, true);
  assert.equal(ItemChange.safeParse({ note: "x".repeat(20001) }).success, false);
});

test("a save takes tags as a list or a string, and caps sizes", () => {
  assert.equal(SaveJson.safeParse({ url: "https://a.com", tags: ["a", "b"] }).success, true);
  assert.equal(SaveJson.safeParse({ text: "hi", tags: "a, b" }).success, true);
  assert.equal(SaveJson.safeParse({ url: "x".repeat(2001) }).success, false);
  assert.equal(SaveJson.safeParse({ sort: "no" }).success, false);
});

test("tag lists drop blanks, strip # and remove repeats", () => {
  assert.deepEqual(tagList(" #ai, ai ,, design "), ["ai", "design"]);
  assert.deepEqual(tagList(["x", "", "#", "y"]), ["x", "y"]);
  assert.deepEqual(tagList(42), []);
  assert.equal(tagList(Array.from({ length: 50 }, (_, i) => `t${i}`)).length, 20);
});

test("list filters read the same from a URL or a page's params", () => {
  const a = parseListFilter(new URLSearchParams("view=bogus&lang=fr&page=-3&unread=1"));
  assert.equal(a.view, "inbox");
  assert.equal(a.lang, undefined);
  assert.equal(a.page, 1);
  assert.equal(a.unread, true);
  const b = parseListFilter({ q: "claude", page: "99999999" });
  assert.equal(b.view, "all");
  assert.equal(b.page, 10000);
  assert.equal(parseListFilter({ q: "x".repeat(900) }).q?.length, 500);
});

test("cursors round-trip and bad ones start from the top", () => {
  const key = { kind: "key" as const, sortAt: "2026-09-28T10:00:00.000Z", id: "x|1934" };
  assert.deepEqual(decodeCursor(encodeCursor(key)), key);
  assert.deepEqual(decodeCursor(encodeCursor({ kind: "offset", offset: 150 })), { kind: "offset", offset: 150 });
  assert.equal(encodeCursor(key).match(/[+/=]/), null);
  for (const bad of [undefined, "", "!!!", btoa("o:-4"), btoa("k:|"), btoa("z:1"), "a".repeat(2000)]) {
    assert.equal(decodeCursor(bad), null, String(bad));
  }
});

test("keep grows the gap, later brings it back tomorrow", () => {
  let s = nextSchedule(null, "keep");
  assert.equal(s.intervalDays, 1);
  const gaps = [s.intervalDays];
  for (let i = 0; i < 4; i++) {
    s = nextSchedule(s, "keep");
    gaps.push(s.intervalDays);
  }
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] > gaps[i - 1], gaps.join(","));
  const later = nextSchedule(s, "later");
  assert.equal(later.intervalDays, 1);
  assert.ok(later.ease < s.ease);
  let low = { intervalDays: 1, ease: 1.3 };
  for (let i = 0; i < 5; i++) low = nextSchedule(low, "later");
  assert.equal(low.ease, 1.3);
  let high = { intervalDays: 300, ease: 3 };
  high = nextSchedule(high, "keep");
  assert.equal(high.intervalDays, 365);
});

test("weeks start on Monday and the digest runs Sunday evening", () => {
  assert.equal(weekStart(new Date("2026-09-28T12:00:00Z")), "2026-09-28"); // Monday
  assert.equal(weekStart(new Date("2026-10-04T23:59:00Z")), "2026-09-28"); // Sunday
  assert.equal(weekEnd("2026-09-28"), "2026-10-05");
  assert.equal(digestDue(new Date("2026-10-04T18:00:00Z")), true);
  assert.equal(digestDue(new Date("2026-10-04T12:00:00Z")), false);
  assert.equal(digestDue(new Date("2026-10-03T18:00:00Z")), false);
});

test("links: only real web links count, and sources come from the host", () => {
  assert.equal(isWebLink("https://example.com/a"), true);
  assert.equal(isWebLink("http://"), false);
  assert.equal(isWebLink("javascript:alert(1)"), false);
  assert.equal(isWebLink("https://localhost"), false);
  assert.equal(sourceOfUrl("https://www.youtube.com/watch?v=1"), "youtube");
  assert.equal(sourceOfUrl("https://x.com/a/status/1"), "x");
  assert.equal(sourceOfUrl("not a link"), "manual");
  assert.equal(firstUrl("see https://a.com/x, ok"), "https://a.com/x,");
});

test("questions search by their subject words, any of them", async () => {
  const { questionFtsQuery } = await import("./db");
  assert.equal(questionFtsQuery("What did I save about Amman?"), '"amman"*');
  assert.equal(questionFtsQuery("ماذا حفظت عن عمّان"), '"حفظت"* OR "عمّان"*');
  assert.equal(questionFtsQuery("what is it?"), null);
  assert.equal(questionFtsQuery('"xy" OR (zz)*'), '"xy"* OR "zz"*');
});
