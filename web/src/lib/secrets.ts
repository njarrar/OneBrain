import { env } from "@/lib/db";
import { getSetting, setSetting } from "@/lib/settings";

// Secrets typed on the web (like the Claude key) are kept in the settings table, encrypted with
// AES-GCM under a key made from the BETTER_AUTH_SECRET Worker secret. Stored as base64 of iv + ciphertext.

const ANTHROPIC = "anthropic_api_key";

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

// The key saved on the web, or null if none is saved (or it can't be read after the secret changed).
async function savedAnthropicKey(): Promise<string | null> {
  const stored = await getSetting(ANTHROPIC);
  if (!stored) return null;
  try {
    return await decrypt(stored);
  } catch (err) {
    console.error("can't read the saved Claude key", err);
    return null;
  }
}

// The Claude key to use: the one saved on the web, else the ANTHROPIC_API_KEY Worker secret.
export async function getAnthropicKey(): Promise<string | null> {
  return (await savedAnthropicKey()) ?? (await env()).ANTHROPIC_API_KEY ?? null;
}

// What the Sources page shows. Never the key itself.
export async function anthropicKeyStatus(): Promise<{ last4: string | null; fromEnv: boolean }> {
  const saved = await savedAnthropicKey();
  return { last4: saved ? saved.slice(-4) : null, fromEnv: !saved && !!(await env()).ANTHROPIC_API_KEY };
}

export async function setAnthropicKey(key: string | null) {
  await setSetting(ANTHROPIC, key === null ? null : await encrypt(key));
}
