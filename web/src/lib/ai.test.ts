import { test } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { forTests, isProvider } from "./ai";
import { keyProblem } from "./secrets";

const ask = {
  system: "Be brief.",
  parts: [{ type: "text" as const, text: "Hi" }, { type: "image" as const, mime: "image/png", data: "AAAA" }],
  maxTokens: 100,
};

// Swaps fetch for one call, keeping what was sent.
function fakeFetch(reply: unknown, status = 200) {
  const sent: { url: string; init: RequestInit }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    return new Response(JSON.stringify(reply), { status });
  }) as typeof fetch;
  return { sent, restore: () => { globalThis.fetch = real; } };
}

test("ChatGPT gets the system line, the picture as a data URL and a strict JSON schema", async () => {
  const f = fakeFetch({ choices: [{ message: { content: '{"ok":true}' } }] });
  try {
    const out = await forTests.openai({ provider: "openai", model: "m", key: "sk-x" }, ask, {
      name: "t", schema: forTests.jsonSchema(z.object({ ok: z.boolean() })),
    });
    assert.equal(out, '{"ok":true}');
    const body = JSON.parse(String(f.sent[0].init.body));
    assert.equal(f.sent[0].url, "https://api.openai.com/v1/chat/completions");
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[1].content[1].image_url.url, "data:image/png;base64,AAAA");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.equal(body.response_format.json_schema.schema.$schema, undefined);
    assert.equal((f.sent[0].init.headers as Record<string, string>).authorization, "Bearer sk-x");
  } finally {
    f.restore();
  }
});

test("Gemini gets inline picture data and the schema, and thinking parts are left out", async () => {
  const f = fakeFetch({ candidates: [{ content: { parts: [{ text: "thinking", thought: true }, { text: '{"ok":true}' }] } }] });
  try {
    const out = await forTests.gemini({ provider: "gemini", model: "gemini-flash-latest", key: "AIzaX" }, ask, { type: "object" });
    assert.equal(out, '{"ok":true}');
    const body = JSON.parse(String(f.sent[0].init.body));
    assert.match(f.sent[0].url, /models\/gemini-flash-latest:generateContent$/);
    assert.equal(body.contents[0].parts[1].inlineData.mimeType, "image/png");
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.equal(body.systemInstruction.parts[0].text, "Be brief.");
  } finally {
    f.restore();
  }
});

test("a refused key comes back as a plain message", async () => {
  const f = fakeFetch({ error: { message: "Incorrect API key" } }, 401);
  try {
    await assert.rejects(forTests.openai({ provider: "openai", model: "m", key: "sk-x" }, ask), /didn't accept the key: Incorrect API key/);
  } finally {
    f.restore();
  }
});

test("keys are checked against the provider they're saved for", () => {
  assert.equal(keyProblem("claude", "sk-ant-api03-aaaaaaaaaaaaaaaaaaaa"), null);
  assert.match(keyProblem("openai", "sk-ant-api03-aaaaaaaaaaaaaaaaaaaa") ?? "", /ChatGPT/);
  assert.equal(keyProblem("openai", "sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa"), null);
  assert.match(keyProblem("gemini", "sk-proj-aaaaaaaaaaaaaaaaaaaaaaaa") ?? "", /AIza/);
  assert.match(keyProblem("gemini", "AIza short") ?? "", /whole key/);
  assert.equal(isProvider("gemini"), true);
  assert.equal(isProvider("grok"), false);
});
