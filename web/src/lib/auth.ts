import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { env } from "@/lib/db";

// This is a personal archive, so not everyone who finds the URL may make an account.
// ALLOWED_EMAILS (comma separated) lists who may. Without it, only the first account
// can be created, and sign up closes after that.
async function mayCreateAccount(e: CloudflareEnv, email: string): Promise<boolean> {
  const allowed = (e.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length) return allowed.includes(email.toLowerCase());
  const row = await e.DB.prepare(`select count(*) as n from "user"`).first<{ n: number }>();
  return (row?.n ?? 0) === 0;
}

function build(e: CloudflareEnv) {
  const google =
    e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
      ? { google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } }
      : {};
  const apple =
    e.APPLE_CLIENT_ID && e.APPLE_CLIENT_SECRET
      ? { apple: { clientId: e.APPLE_CLIENT_ID, clientSecret: e.APPLE_CLIENT_SECRET, appBundleIdentifier: e.APPLE_APP_BUNDLE_ID } }
      : {};

  return betterAuth({
    database: e.DB,
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.BETTER_AUTH_URL,
    trustedOrigins: ["https://appleid.apple.com"],
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    socialProviders: { ...google, ...apple },
    session: { expiresIn: 60 * 60 * 24 * 90, updateAge: 60 * 60 * 24 },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!(await mayCreateAccount(e, user.email))) {
              throw new APIError("FORBIDDEN", { message: "This archive is private. Sign up is closed." });
            }
          },
        },
      },
    },
    plugins: [username(), nextCookies()],
  });
}

export type Auth = ReturnType<typeof build>;

let cached: { db: D1Database; auth: Auth } | undefined;

export async function getAuth(): Promise<Auth> {
  const e = await env();
  if (!cached || cached.db !== e.DB) cached = { db: e.DB, auth: build(e) };
  return cached.auth;
}

export async function enabledProviders(): Promise<{ google: boolean; apple: boolean }> {
  const e = await env();
  return {
    google: !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
    apple: !!(e.APPLE_CLIENT_ID && e.APPLE_CLIENT_SECRET),
  };
}
