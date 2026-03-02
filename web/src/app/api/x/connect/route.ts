import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { authUrl, pkce } from "@/lib/x";

export async function GET() {
  await requireUser();
  const state = crypto.randomUUID();
  const { verifier, challenge } = await pkce();
  (await cookies()).set("x_oauth", JSON.stringify({ state, verifier }), {
    path: "/api/x", maxAge: 600, httpOnly: true, secure: true, sameSite: "lax",
  });
  redirect(await authUrl(state, challenge));
}
