import { z } from "zod";
import { appRoute, jsonError } from "@/lib/http";
import { PROVIDERS, PROVIDER_INFO, aiSettings, saveAiSettings } from "@/lib/ai";
import { keyProblem, keyStatus, setApiKey } from "@/lib/secrets";

// Which AI does Brain's work, shared by the web and the phone. Keys are never sent back, only
// their last four characters.
//   GET  { provider, providers: [{ id, name, model, defaultModel, last4, fromEnv, keyHint, keyUrl }] }
//   PUT  { provider?, model?: { provider, name|null }, key?: { provider, value|null } }  (null removes)
async function state() {
  const [ai, keys] = await Promise.all([aiSettings(), Promise.all(PROVIDERS.map((p) => keyStatus(p)))]);
  return {
    provider: ai.provider,
    providers: PROVIDERS.map((id, i) => ({
      id,
      name: PROVIDER_INFO[id].name,
      model: ai.models[id],
      defaultModel: PROVIDER_INFO[id].model,
      keyHint: PROVIDER_INFO[id].keyHint,
      keyUrl: PROVIDER_INFO[id].keyUrl,
      ...keys[i],
    })),
  };
}

export const GET = appRoute(async () => state());

const Change = z.strictObject({
  provider: z.enum(PROVIDERS).optional(),
  model: z.strictObject({ provider: z.enum(PROVIDERS), name: z.string().max(100).regex(/^[\w.:/-]*$/).nullable() }).optional(),
  key: z.strictObject({ provider: z.enum(PROVIDERS), value: z.string().max(500).nullable() }).optional(),
});

export const PUT = appRoute(Change, async (c) => {
  if (c.key) {
    const value = c.key.value?.trim() || null;
    const problem = value ? keyProblem(c.key.provider, value) : null;
    if (problem) return jsonError(problem);
    await setApiKey(c.key.provider, value);
  }
  await saveAiSettings({ provider: c.provider, model: c.model ?? undefined });
  return state();
});
