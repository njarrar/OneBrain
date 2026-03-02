import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireUser } from "@/lib/session";
import { finishConnect, syncX } from "@/lib/x";
import { run } from "@/lib/db";
import { sortItems } from "@/lib/sorter";

export async function GET(req: Request) {
  await requireUser();
  const url = new URL(req.url);
  const jar = await cookies();
  let saved: { state?: string; verifier?: string } = {};
  try {
    saved = JSON.parse(jar.get("x_oauth")?.value ?? "{}");
  } catch {
    // A mangled cookie is treated like a missing one.
  }
  jar.delete("x_oauth");
  const code = url.searchParams.get("code");
  if (!code || !saved.state || !saved.verifier || url.searchParams.get("state") !== saved.state) {
    const why = url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "The X sign-in did not finish. Try again.";
    await run(`update sources set status = 'error', last_error = ? where id = 'x'`, why);
    redirect("/sources");
  }
  try {
    await finishConnect(code, saved.verifier);
  } catch (err) {
    await run(`update sources set status = 'error', last_error = ? where id = 'x'`, err instanceof Error ? err.message : String(err));
    redirect("/sources");
  }
  await run(`update sources set status = 'connected', last_error = null where id = 'x'`);
  getCloudflareContext().ctx.waitUntil(
    syncX().then(() => sortItems()).catch((err) => console.error("x sync failed", err)),
  );
  redirect("/sources?x=connected");
}
