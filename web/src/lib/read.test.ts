import { test } from "node:test";
import assert from "node:assert/strict";
import { base64, dayLabel, factsText, isAudioFile, parseFacts } from "./memory/read";

test("dates read as plain days, with or without a year", () => {
  assert.equal(dayLabel("03-14"), "14 March");
  assert.equal(dayLabel("1990-11-02"), "2 November 1990");
  assert.equal(dayLabel("13-40"), "13-40");
});

test("facts turn into lines Ask Brain and search can use", () => {
  const f = parseFacts(JSON.stringify({
    people: [{ name: "Sara", about: "colleague" }],
    dates: [{ date: "03-14", what: "Birthday", person: "Sara", yearly: true }],
  }));
  assert.equal(factsText(f), "Sara: Birthday, 14 March (every year)\nSara: colleague");
  assert.equal(parseFacts("not json"), null);
  assert.equal(parseFacts(null), null);
  assert.equal(factsText(null), "");
});

test("voice memos and videos count as audio, pictures don't", () => {
  assert.equal(isAudioFile("audio/x-m4a", "New Recording.m4a"), true);
  assert.equal(isAudioFile("application/octet-stream", "memo.m4a"), true);
  assert.equal(isAudioFile("video/quicktime", "clip.mov"), true);
  assert.equal(isAudioFile("image/jpeg", "shot.jpg"), false);
});

test("base64 matches Node's, for big files too", () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 256);
  assert.equal(base64(bytes), Buffer.from(bytes).toString("base64"));
});
