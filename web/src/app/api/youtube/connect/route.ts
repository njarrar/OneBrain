import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { authUrl } from "@/lib/youtube";

export async function GET() {
  await requireUser();
  const state = crypto.randomUUID();
  (await cookies()).set("yt_state", state, { path: "/api/youtube", maxAge: 600, httpOnly: true, secure: true, sameSite: "lax" });
  redirect(await authUrl(state));
}
