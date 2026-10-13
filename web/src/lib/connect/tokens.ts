import { decrypt, encrypt } from "@/lib/secrets";
import { getSetting, setSetting } from "@/lib/settings";

// Sign-in tokens and sync progress for the sources that connect with their own sign-in
// (Gmail, Outlook, Pinterest). Tokens are kept encrypted, like the AI keys.

export async function saveToken(name: string, token: string | null) {
  await setSetting(name, token === null ? null : await encrypt(token));
}

// The saved token, or null when there is none or it can't be read after the secret changed.
export async function readToken(name: string): Promise<string | null> {
  const stored = await getSetting(name);
  if (!stored) return null;
  try {
    return await decrypt(stored);
  } catch (err) {
    console.error(`can't read ${name}`, err);
    return null;
  }
}

// For X and YouTube, which kept their tokens as plain text before 0.6.0: reads the encrypted token,
// or moves an old plain one over to the encrypted slot and clears the old one.
export async function loadToken(name: string, legacy: string): Promise<string | null> {
  const token = await readToken(name);
  if (token) return token;
  const plain = await getSetting(legacy);
  if (!plain) return null;
  await saveToken(name, plain);
  await setSetting(legacy, null);
  return plain;
}

// Where an import got to, kept as JSON in settings.
export async function readState<T extends object>(name: string, empty: T): Promise<T> {
  const raw = await getSetting(name);
  if (!raw) return empty;
  try {
    return { ...empty, ...JSON.parse(raw) };
  } catch {
    return empty;
  }
}

export async function saveState(name: string, state: object | null) {
  await setSetting(name, state === null ? null : JSON.stringify(state));
}

// The external ids of these saves that are already here, so a re-run skips them before fetching.
export async function knownIds(d: D1Database, source: string, ids: string[]): Promise<Set<string>> {
  const known = new Set<string>();
  // D1 takes up to 100 bound values a query.
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90);
    const { results } = await d
      .prepare(`select external_id from saves where source_id = ? and external_id in (${chunk.map(() => "?").join(",")})`)
      .bind(source, ...chunk)
      .all<{ external_id: string }>();
    for (const r of results) known.add(r.external_id);
  }
  return known;
}
