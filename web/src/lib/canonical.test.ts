import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, identityKey, idForKey, noteKey, sha256Hex, urlKey } from "./canonical";

const same = (urls: string[], key?: string) => {
  const keys = urls.map(urlKey);
  for (const k of keys) assert.equal(k, keys[0], `${urls.join(" / ")} -> ${keys.join(" / ")}`);
  if (key) assert.equal(keys[0], key);
};

test("X and Twitter links collapse to the tweet id", () => {
  same(
    [
      "https://x.com/jack/status/20",
      "http://twitter.com/jack/status/20",
      "https://mobile.twitter.com/jack/status/20?s=20&t=abc",
      "https://www.twitter.com/Jack/status/20/photo/1",
      "https://x.com/i/status/20",
      "https://x.com/i/web/status/20/",
      "https://twitter.com/jack/statuses/20#reply",
      "x.com/other_name/status/20?ref_src=twsrc",
      "https://fxtwitter.com/jack/status/20",
    ],
    "x:20",
  );
  assert.equal(canonicalUrl("https://twitter.com/jack/status/20?s=46"), "https://x.com/i/status/20");
  assert.equal(urlKey("https://x.com/jack"), "url:https://x.com/jack");
});

test("YouTube links collapse to the video id", () => {
  same(
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ?si=abcdef",
      "https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share&t=42",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ?start=3",
      "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD",
      "http://youtube.com/watch?feature=youtu.be&v=dQw4w9WgXcQ",
      "https://www.youtube.com/live/dQw4w9WgXcQ?si=x",
    ],
    "yt:dQw4w9WgXcQ",
  );
  // A playlist is not a video and keeps its list.
  assert.equal(canonicalUrl("https://www.youtube.com/playlist?list=PL123&si=zz"), "https://youtube.com/playlist?list=PL123");
});

test("Instagram posts and reels collapse to the shortcode", () => {
  same(
    [
      "https://www.instagram.com/p/C1a2B3c4D5e/",
      "https://instagram.com/reel/C1a2B3c4D5e/?igsh=MWQ1ZGUxMzBkMA==",
      "https://www.instagram.com/reels/C1a2B3c4D5e",
      "https://www.instagram.com/someone/p/C1a2B3c4D5e/?img_index=2",
      "http://instagram.com/tv/C1a2B3c4D5e?igshid=abc",
    ],
    "ig:C1a2B3c4D5e",
  );
  assert.equal(urlKey("https://www.instagram.com/someone/"), "url:https://instagram.com/someone");
});

test("other links lose tracking, www, trailing slash and fragments", () => {
  same([
    "https://example.com/a/b",
    "http://www.example.com/a/b/",
    "https://EXAMPLE.com/a/b?utm_source=feedly&utm_medium=rss",
    "https://example.com/a/b?fbclid=123#section",
    "https://example.com:443/a/b?gclid=1&mc_cid=2",
  ]);
  assert.equal(canonicalUrl("https://www.example.com/?b=2&a=1&utm_campaign=x"), "https://example.com?a=1&b=2");
  assert.equal(canonicalUrl("https://example.com/post?id=7&ref_src=x"), "https://example.com/post?id=7");
  // Case in the path matters on many sites.
  assert.notEqual(urlKey("https://example.com/A"), urlKey("https://example.com/a"));
  // Query values that mean something stay.
  assert.notEqual(urlKey("https://example.com/p?id=1"), urlKey("https://example.com/p?id=2"));
  // si and s are only dropped on sites where they are tracking.
  assert.equal(canonicalUrl("https://example.com/search?s=cats"), "https://example.com/search?s=cats");
  assert.equal(canonicalUrl("https://open.spotify.com/track/abc?si=123"), "https://open.spotify.com/track/abc");
  assert.equal(canonicalUrl("https://app.example.com/#!/page"), "https://app.example.com#!/page");
});

test("bad input does not throw", () => {
  assert.equal(urlKey(""), null);
  assert.equal(urlKey("mailto:a@b.c"), null);
  assert.equal(canonicalUrl("not a url at all"), "not a url at all");
});

test("identity keys for items without links", () => {
  assert.equal(identityKey({ source: "x", externalId: "123" }), "x:123");
  assert.equal(identityKey({ source: "youtube", externalId: "liked-dQw4w9WgXcQ", itemKey: "dQw4w9WgXcQ" }), "yt:dQw4w9WgXcQ");
  assert.equal(identityKey({ source: "instagram", externalId: "C1a2B3c4D5e" }), "ig:C1a2B3c4D5e");
  assert.equal(identityKey({ source: "photos", externalId: "ABC/L0/001", imageHash: "AB12" }), "img:ab12");
  assert.equal(identityKey({ source: "manual" }), null);
  // The link wins over anything else.
  assert.equal(identityKey({ source: "manual", url: "https://youtu.be/dQw4w9WgXcQ", imageHash: "ff" }), "yt:dQw4w9WgXcQ");
});

test("ids match the ones the imports use", () => {
  assert.equal(idForKey("x:20"), "x-20");
  assert.equal(idForKey("yt:dQw4w9WgXcQ"), "youtube-dQw4w9WgXcQ");
  assert.equal(idForKey("ig:C1a2B3c4D5e"), "instagram-C1a2B3c4D5e");
  assert.equal(idForKey("url:https://example.com"), null);
  assert.equal(idForKey(null), null);
});

test("hashes", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(await noteKey("  Hello\n  world "), await noteKey("hello world"));
  assert.equal(await noteKey("   "), null);
});
