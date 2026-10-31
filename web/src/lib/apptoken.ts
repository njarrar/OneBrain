import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { all, first, run } from "@/lib/db";

// The iPhone app signs in once through the web page /connect-app and then sends
// "Authorization: Bearer <key>" with every request.

async function hash(token: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createAppToken(name: string): Promise<string> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const token = "brn_" + [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
  await run(`insert into app_tokens (id, token_hash, name) values (?, ?, ?)`, crypto.randomUUID(), await hash(token), name.slice(0, 80));
  return token;
}

// last_used_at only says whether a key is still in use, so it is written at most once an hour
// instead of on every request.
const TOUCH_EVERY_MS = 60 * 60 * 1000;

export async function tokenOk(req: Request): Promise<boolean> {
  const m = req.headers.get("authorization")?.match(/^Bearer\s+(brn_[0-9a-f]{64})$/);
  return m ? keyOk(m[1], "app") : false;
}

// Checks one key. A connector key (the link another AI connects with) opens only the read-only
// connector, never the app's routes, which can change and delete things.
export async function keyOk(token: string, use: "app" | "connector"): Promise<boolean> {
  if (!/^brn_[0-9a-f]{64}$/.test(token)) return false;
  const row = await first<{ id: string; name: string; last_used_at: string | null }>(
    `select id, name, last_used_at from app_tokens where token_hash = ?`,
    await hash(token),
  );
  if (!row) return false;
  if (use === "app" && row.name.startsWith(CONNECTOR_PREFIX)) return false;
  const last = row.last_used_at ? Date.parse(row.last_used_at) : 0;
  if (!(Date.now() - last < TOUCH_EVERY_MS)) {
    await run(`update app_tokens set last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?`, row.id);
  }
  return true;
}

// Either the app's key or a signed-in browser.
export async function authorized(req: Request): Promise<boolean> {
  if (await tokenOk(req)) return true;
  return !!(await (await getAuth()).api.getSession({ headers: await headers() }));
}


// Keys made for other AIs (the connector link). Named "AI connector · <name>".
export const CONNECTOR_PREFIX = "AI connector";

export async function listConnectorKeys() {
  return all<{ id: string; name: string; created_at: string; last_used_at: string | null }>(
    `select id, name, created_at, last_used_at from app_tokens where name like ? order by created_at desc`,
    `${CONNECTOR_PREFIX}%`,
  );
}

export async function removeConnectorKey(id: string) {
  await run(`delete from app_tokens where id = ? and name like ?`, id, `${CONNECTOR_PREFIX}%`);
}
