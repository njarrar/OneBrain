import { env } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";

// Secrets typed in Settings (the AI keys) are kept in the settings table, encrypted with
// AES-GCM under a key made from the BETTER_AUTH_SECRET Worker secret. Stored as base64 of iv + ciphertext.


async function cryptoKey() {
  const secret = (await env()).BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: new TextEncoder().encode("brain-settings-v1") },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(), new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return btoa(String.fromCharCode(...out));
}

export async function decrypt(stored: string): Promise<string> {
  const bytes = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.subarray(0, 12) }, await cryptoKey(), bytes.subarray(12));
  return new TextDecoder().decode(plain);
}

type KeyFor = "claude" | "openai" | "gemini";

// Where each provider's key is kept, and the Worker secret used when none is saved.
const SLOTS: Record<KeyFor, { setting: string; env: "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GEMINI_API_KEY" }> = {
  claude: { setting: "anthropic_api_key", env: "ANTHROPIC_API_KEY" },
  openai: { setting: "openai_api_key", env: "OPENAI_API_KEY" },
  gemini: { setting: "gemini_api_key", env: "GEMINI_API_KEY" },
};

// The key saved on the web, or null if none is saved (or it can't be read after the secret changed).
async function savedKey(p: KeyFor): Promise<string | null> {
  const stored = await getSetting(SLOTS[p].setting);
  if (!stored) return null;
  try {
    return await decrypt(stored);
  } catch (err) {
    console.error(`can't read the saved ${p} key`, err);
    return null;
  }
}

// The key to use: the one saved in Settings, else the Worker secret.
export async function getApiKey(p: KeyFor): Promise<string | null> {
  return (await savedKey(p)) ?? (await env())[SLOTS[p].env] ?? null;
}

// What Settings shows. Never the key itself.
export async function keyStatus(p: KeyFor): Promise<{ last4: string | null; fromEnv: boolean }> {
  const saved = await savedKey(p);
  return { last4: saved ? saved.slice(-4) : null, fromEnv: !saved && !!(await env())[SLOTS[p].env] };
}

export async function setApiKey(p: KeyFor, key: string | null) {
  await setSetting(SLOTS[p].setting, key === null ? null : await encrypt(key));
}

// Quick checks on a pasted key, so a mix-up is caught before it's saved.
export function keyProblem(p: KeyFor, key: string): string | null {
  if (key.length < 20 || /\s/.test(key)) return "That doesn't look like a whole key.";
  if (p === "claude" && !key.startsWith("sk-ant-")) return "Claude keys start with sk-ant-";
  if (p === "openai" && (!key.startsWith("sk-") || key.startsWith("sk-ant-"))) return "ChatGPT keys start with sk-";
  if (p === "gemini" && !key.startsWith("AIza")) return "Gemini keys start with AIza";
  return null;
}
