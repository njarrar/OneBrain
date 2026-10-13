import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { env } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { pkce } from "@/lib/x";
import { connectorFor, redirectUri } from "@/lib/connect";

// Starts the sign-in for Gmail, Outlook or Pinterest. The state and PKCE verifier wait in a
// short-lived cookie for the callback.
export async function GET(_: Request, { params }: { params: Promise<{ source: string }> }) {
  await requireUser();
  const c = connectorFor((await params).source);
  if (!c) notFound();
  const e = await env();
  if (!c.keysSet(e)) redirect("/sources");
  const state = crypto.randomUUID();
  const { verifier, challenge } = await pkce();
  (await cookies()).set(`connect_${c.id}`, `${state}.${verifier}`, {
    path: `/api/connect/${c.id}`, maxAge: 600, httpOnly: true, secure: true, sameSite: "lax",
  });
  redirect(c.authUrl(e, { state, redirectUri: await redirectUri(c.id), challenge }));
}
