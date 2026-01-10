// One person uses this app, so sign in is a single password from APP_PASSWORD.
// The session cookie holds an HMAC of a fixed message, keyed by SESSION_SECRET.
// Uses Web Crypto so it also runs in middleware.

export const SESSION_COOKIE = "brain_session";

async function hmac(message: string): Promise<string> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function sessionToken(): Promise<string> {
  return hmac("brain-session-v1");
}

export async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await sessionToken();
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export async function passwordMatches(input: string): Promise<boolean> {
  const real = process.env.APP_PASSWORD;
  if (!real) return false;
  // Compare HMACs so the check takes the same time whatever the input.
  return (await hmac("pw:" + input)) === (await hmac("pw:" + real));
}
