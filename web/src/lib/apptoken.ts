import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { first, run } from "@/lib/db";

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
  if (!m) return false;
  const row = await first<{ id: string; last_used_at: string | null }>(
    `select id, last_used_at from app_tokens where token_hash = ?`,
    await hash(m[1]),
  );
  if (!row) return false;
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

