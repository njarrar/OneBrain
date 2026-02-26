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

export async function tokenOk(req: Request): Promise<boolean> {
  const m = req.headers.get("authorization")?.match(/^Bearer\s+(brn_[0-9a-f]{64})$/);
  if (!m) return false;
  const h = await hash(m[1]);
  const row = await first<{ id: string }>(`select id from app_tokens where token_hash = ?`, h);
  if (!row) return false;
  await run(`update app_tokens set last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?`, row.id);
  return true;
}

// Either the app's key or a signed-in browser.
export async function allowed(req: Request): Promise<boolean> {
  if (await tokenOk(req)) return true;
  return !!(await (await getAuth()).api.getSession({ headers: await headers() }));
}

export const denied = () => Response.json({ error: "Sign in again" }, { status: 401 });
