import { first, run } from "@/lib/db";

export async function getSetting(key: string): Promise<string | null> {
  return (await first<{ value: string }>(`select value from settings where key = ?`, key))?.value ?? null;
}

export async function setSetting(key: string, value: string | null) {
  if (value === null) await run(`delete from settings where key = ?`, key);
  else
    await run(
      `insert into settings (key, value) values (?, ?)
       on conflict (key) do update set value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      key,
      value,
    );
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" })[c]!);
}

// The secret part of the link that Feedly (through IFTTT) and other tools post new saves to.
export async function hookKey(): Promise<string> {
  const existing = await getSetting("hook_key");
  if (existing) return existing;
  const key = randomKey();
  await run(`insert or ignore into settings (key, value) values ('hook_key', ?)`, key);
  return (await getSetting("hook_key"))!;
}

// Compares without leaking timing.
export function sameKey(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
