import { test } from "node:test";
import assert from "node:assert/strict";
import { ItemChange, PileCall } from "./items/schema";
import { layout } from "./memory/map";
import { handleRpc } from "./mcp";

test("a pile call takes one decision or one reason, nothing else", () => {
  assert.equal(PileCall.safeParse({ id: "a", how: "done" }).success, true);
  assert.equal(PileCall.safeParse({ id: "a", how: "undo" }).success, true);
  assert.equal(PileCall.safeParse({ id: "a", how: "keep" }).success, false);
  assert.equal(PileCall.safeParse({ id: "a", why: "learn" }).success, true);
  assert.equal(PileCall.safeParse({ id: "a", why: null }).success, true);
  assert.equal(PileCall.safeParse({ id: "a", why: "fun" }).success, false);
  assert.equal(PileCall.safeParse({ id: "a", how: "done", why: "use" }).success, false);
  assert.equal(ItemChange.safeParse({ keptWhy: "buy" }).success, true);
  assert.equal(ItemChange.safeParse({ keptWhy: "nope" }).success, false);
});

test("the topic map puts the biggest topic in the middle and keeps circles apart", () => {
  const counts = Array.from({ length: 24 }, (_, i) => ({ name: `t${i}`, count: 500 - i * 20 }));
  const pos = layout(counts);
  const all = [...pos.values()];
  const mid = pos.get("t0")!;
  // The biggest sits nearest the middle.
  for (const p of all) assert.ok(Math.hypot(p.x - 500, p.y - 500) >= Math.hypot(mid.x - 500, mid.y - 500));
  for (const p of all) assert.ok(p.x - p.r >= -1 && p.x + p.r <= 1001 && p.y - p.r >= -1 && p.y + p.r <= 1001, "inside the square");
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const d = Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y);
      assert.ok(d + 2 >= all[i].r + all[j].r, `circles ${i} and ${j} overlap`);
    }
  }
  // Few topics still fill the square.
  const few = [...layout([{ name: "a", count: 9 }, { name: "b", count: 3 }]).values()];
  assert.ok(Math.max(...few.map((p) => p.x + p.r)) - Math.min(...few.map((p) => p.x - p.r)) > 900 || Math.max(...few.map((p) => p.y + p.r)) - Math.min(...few.map((p) => p.y - p.r)) > 800);
  // The same counts give the same map.
  assert.deepEqual([...layout(counts).entries()], [...pos.entries()]);
});

test("the connector answers MCP start-up, the tool list and notifications", async () => {
  const init = (await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } })) as { result: { protocolVersion: string; capabilities: object } };
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.ok("tools" in init.result.capabilities);
  const list = (await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })) as { result: { tools: { name: string }[] } };
  assert.deepEqual(list.result.tools.map((t) => t.name), ["search_saves", "get_save", "recent_saves", "topics", "ask_brain"]);
  assert.equal(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
  const unknown = (await handleRpc({ jsonrpc: "2.0", id: 3, method: "nope" })) as { error: { code: number } };
  assert.equal(unknown.error.code, -32601);
  const bad = (await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "search_saves", arguments: {} } })) as { result: { isError: boolean } };
  assert.equal(bad.result.isError, true);
});
