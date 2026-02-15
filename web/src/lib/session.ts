import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

// Returns the signed in user, or sends the visitor to the sign in page.
export async function requireUser() {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session.user;
}
