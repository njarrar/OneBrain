import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/settings";
import { getApiKey } from "@/lib/secrets";

// One way to ask an AI model, whichever one the owner picks in Settings: Claude, ChatGPT or Gemini.
// Sorting, reading voice memos and pictures, Ask Brain and the weekly digest all come through
// here. Search by meaning and transcription stay on Workers AI, so switching never means
// building the search index again.

export const PROVIDERS = ["claude", "openai", "gemini"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const isProvider = (v: unknown): v is Provider => typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);

export const PROVIDER_INFO: Record<Provider, { name: string; model: string; keyHint: string; keyUrl: string }> = {
  claude: { name: "Claude", model: "claude-haiku-4-5", keyHint: "sk-ant-…", keyUrl: "https://console.anthropic.com/settings/keys" },
  openai: { name: "ChatGPT", model: "gpt-5.4-mini", keyHint: "sk-…", keyUrl: "https://platform.openai.com/api-keys" },
  gemini: { name: "Gemini", model: "gemini-flash-latest", keyHint: "AIza…", keyUrl: "https://aistudio.google.com/app/apikey" },
};

export type Part = { type: "text"; text: string } | { type: "image"; mime: string; data: string };

export type AiSettings = { provider: Provider; models: Record<Provider, string> };

export async function aiSettings(): Promise<AiSettings> {
  const [p, ...models] = await Promise.all([
    getSetting("ai_provider"),
    ...PROVIDERS.map((id) => getSetting(`ai_model_${id}`)),
  ]);
  return {
    provider: isProvider(p) ? p : "claude",
    models: Object.fromEntries(PROVIDERS.map((id, i) => [id, models[i]?.trim() || PROVIDER_INFO[id].model])) as Record<Provider, string>,
  };
}

export async function saveAiSettings(next: { provider?: Provider; model?: { provider: Provider; name: string | null } }) {
  if (next.provider) await setSetting("ai_provider", next.provider);
  if (next.model) {
    const name = next.model.name?.trim() || null;
    await setSetting(`ai_model_${next.model.provider}`, name === PROVIDER_INFO[next.model.provider].model ? null : name);
  }
}

type Chosen = { provider: Provider; model: string; key: string };

// The provider picked in Settings with its key and model, or null when it has no key yet.
async function chosen(provider?: Provider): Promise<Chosen | null> {
  const s = await aiSettings();
  const p = provider ?? s.provider;
  const key = await getApiKey(p);
  return key ? { provider: p, model: s.models[p], key } : null;
}

// Whether the AI work (sorting, labels, Ask Brain) can run now.
export async function aiReady(): Promise<boolean> {
  return !!(await chosen());
}

export async function aiName(): Promise<string> {
  return PROVIDER_INFO[(await aiSettings()).provider].name;
}

type Ask = { system: string; parts: Part[]; maxTokens: number };

// The JSON Schema for a zod shape, as OpenAI and Gemini want it.
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { $schema, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

async function failure(res: Response, who: string): Promise<Error> {
  const body = await res.text().catch(() => "");
  let msg = body.slice(0, 300);
  try {
    const j = JSON.parse(body);
    msg = j.error?.message ?? j.message ?? msg;
  } catch {
    // Not JSON; keep the start of the text.
  }
  if (res.status === 401 || res.status === 403) return new Error(`${who} didn't accept the key: ${msg}`);
  return new Error(`${who} said: ${msg || res.status}`);
}

// ─── Claude ───

function claudeContent(parts: Part[]): Anthropic.ContentBlockParam[] {
  return parts.map((p) =>
    p.type === "text"
      ? { type: "text", text: p.text }
      : { type: "image", source: { type: "base64", media_type: p.mime as "image/jpeg", data: p.data } },
  );
}

async function claudeJson<T>(c: Chosen, a: Ask, schema: z.ZodType<T>): Promise<T | null> {
  const client = new Anthropic({ apiKey: c.key });
  const res = await client.messages.parse({
    model: c.model,
    max_tokens: a.maxTokens,
    system: a.system,
    messages: [{ role: "user", content: claudeContent(a.parts) }],
    output_config: { format: zodOutputFormat(schema as z.ZodType<T> & z.ZodObject) },
  });
  return (res.parsed_output as T | null) ?? null;
}

async function claudeText(c: Chosen, a: Ask): Promise<string> {
  const client = new Anthropic({ apiKey: c.key });
  const res = await client.messages.create({
    model: c.model,
    max_tokens: a.maxTokens,
    system: a.system,
    messages: [{ role: "user", content: claudeContent(a.parts) }],
  });
  return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
}

// ─── ChatGPT (OpenAI Chat Completions) ───

async function openai(c: Chosen, a: Ask, format?: { name: string; schema: Record<string, unknown> }): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${c.key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: c.model,
      max_completion_tokens: a.maxTokens,
      messages: [
        { role: "system", content: a.system },
        {
          role: "user",
          content: a.parts.map((p) =>
            p.type === "text"
              ? { type: "text", text: p.text }
              : { type: "image_url", image_url: { url: `data:${p.mime};base64,${p.data}` } },
          ),
        },
      ],
      ...(format ? { response_format: { type: "json_schema", json_schema: { name: format.name, schema: format.schema, strict: true } } } : {}),
    }),
  });
  if (!res.ok) throw await failure(res, "ChatGPT");
  const j = (await res.json()) as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] };
  const m = j.choices?.[0]?.message;
  if (m?.refusal) throw new Error(`ChatGPT refused: ${m.refusal}`);
  return (m?.content ?? "").trim();
}

// ─── Gemini (Google AI Studio key) ───

async function gemini(c: Chosen, a: Ask, schema?: Record<string, unknown>): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(c.model)}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": c.key, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: a.system }] },
      contents: [{
        role: "user",
        parts: a.parts.map((p) => (p.type === "text" ? { text: p.text } : { inlineData: { mimeType: p.mime, data: p.data } })),
      }],
      generationConfig: {
        maxOutputTokens: a.maxTokens,
        ...(schema ? { responseMimeType: "application/json", responseJsonSchema: schema } : {}),
      },
    }),
  });
  if (!res.ok) throw await failure(res, "Gemini");
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  return (j.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("").trim();
}

// ─── The two calls the app makes ───

// An answer shaped like `schema`, or null when the chosen provider has no key.
export async function askJson<T>(a: Ask & { schema: z.ZodType<T>; name: string; provider?: Provider }): Promise<T | null> {
  const c = await chosen(a.provider);
  if (!c) return null;
  if (c.provider === "claude") return claudeJson(c, a, a.schema);
  const raw = c.provider === "openai"
    ? await openai(c, a, { name: a.name, schema: jsonSchema(a.schema) })
    : await gemini(c, a, jsonSchema(a.schema));
  // Some models wrap JSON in a code fence; take what's inside.
  const text = raw.replace(/^```(?:json)?\s*|\s*```$/g, "");
  const parsed = a.schema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error(`${PROVIDER_INFO[c.provider].name} sent an answer in the wrong shape.`);
  return parsed.data;
}

// Plain text, or null when the chosen provider has no key.
export async function askText(a: Ask & { provider?: Provider }): Promise<string | null> {
  const c = await chosen(a.provider);
  if (!c) return null;
  const out = c.provider === "claude" ? await claudeText(c, a) : c.provider === "openai" ? await openai(c, a) : await gemini(c, a);
  return out || null;
}

// The Test button: one tiny call, so you know the key and model work.
export async function testProvider(provider: Provider): Promise<{ ok: boolean; message: string }> {
  const name = PROVIDER_INFO[provider].name;
  try {
    const out = await askJson({
      provider,
      name: "test",
      system: "Reply with the JSON asked for.",
      parts: [{ type: "text", text: 'Give {"ok": true}.' }],
      schema: z.object({ ok: z.boolean() }),
      maxTokens: 1000,
    });
    if (out === null) return { ok: false, message: `Add a ${name} key first.` };
    const model = (await aiSettings()).models[provider];
    return { ok: true, message: `${name} works (${model}).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// For the unit tests: the request each provider gets, checked without a network.
export const forTests = { openai, gemini, jsonSchema };
