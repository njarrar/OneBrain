import { test } from "node:test";
import assert from "node:assert/strict";
import { forTests } from "@/lib/instagram";

const { walk, POST_LINK } = forTests;

test("post links with the account in the path are found", () => {
  assert.equal("https://www.instagram.com/someone.here/p/C1a2B3c4D5e/".match(POST_LINK)?.[2], "C1a2B3c4D5e");
  assert.equal("https://instagram.com/reel/XyZ_123/".match(POST_LINK)?.[2], "XyZ_123");
  assert.equal("https://www.instagram.com/someone/".match(POST_LINK), null);
});

test("a post in saved posts and a collection keeps both the author and the collection", () => {
  const out = new Map();
  const posts = { saved_saved_media: [{ title: "someone", string_map_data: { "Saved on": { href: "https://www.instagram.com/someone/p/ABC123/", timestamp: 100 } } }] };
  const collections = {
    saved_saved_collections: [
      { title: "Recipes", string_map_data: { "Creation Time": { timestamp: 1 } } },
      { string_map_data: { Name: { href: "https://www.instagram.com/p/ABC123/" } } },
    ],
  };
  walk(posts, null, null, out);
  walk(collections, null, null, out);
  const found = out.get("ABC123");
  assert.equal(found.author, "someone");
  assert.equal(found.at, 100);
});
