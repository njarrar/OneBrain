import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireUser } from "@/lib/session";
import { run } from "@/lib/db";
import { connectorFor, redirectUri } from "@/lib/connect";
import { sortItems } from "@/lib/sorter";

// Where Gmail, Outlook and Pinterest send you back. Keeps the token, then starts the first import.
export async function GET(req: Request, { params }: { params: Promise<{ source: string }> }) {
  await requireUser();
  const c = connectorFor((await params).source);
  if (!c) notFound();
  const url = new URL(req.url);
  const jar = await cookies();
  const [expected, verifier] = (jar.get(`connect_${c.id}`)?.value ?? "").split(".");
  jar.delete(`connect_${c.id}`);
  const code = url.searchParams.get("code");
  const fail = async (why: string) => {
    await run(`update sources set status = 'error', last_error = ? where id = ?`, why, c.id);
    redirect("/sources");
  };
  if (!code || !expected || url.searchParams.get("state") !== expected) {
    await fail(url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? `The ${c.name} sign-in did not finish. Try again.`);
  }
  try {
    await c.finish(code!, { redirectUri: await redirectUri(c.id), verifier: verifier ?? "" });
  } catch (err) {
    await fail(err instanceof Error ? err.message : String(err));
  }
  await run(`update sources set status = 'connected', last_error = null where id = ?`, c.id);
  getCloudflareContext().ctx.waitUntil(
    c.sync().then(() => sortItems()).catch((err) => console.error(`${c.id} sync failed`, err)),
  );
  redirect(`/sources?connected=${c.id}`);
}
