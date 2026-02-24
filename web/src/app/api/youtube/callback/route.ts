import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireUser } from "@/lib/session";
import { finishConnect, syncYouTube } from "@/lib/youtube";
import { run } from "@/lib/db";
import { sortItems } from "@/lib/sorter";

export async function GET(req: Request) {
  await requireUser();
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("yt_state")?.value;
  jar.delete("yt_state");
  const code = url.searchParams.get("code");
  if (!code || !expected || url.searchParams.get("state") !== expected) {
    const why = url.searchParams.get("error") ?? "The YouTube sign-in did not finish. Try again.";
    await run(`update sources set status = 'error', last_error = ? where id = 'youtube'`, why);
    redirect("/sources");
  }
  try {
    await finishConnect(code);
  } catch (err) {
    await run(`update sources set status = 'error', last_error = ? where id = 'youtube'`, err instanceof Error ? err.message : String(err));
    redirect("/sources");
  }
  await run(`update sources set status = 'connected', last_error = null where id = 'youtube'`);
  getCloudflareContext().ctx.waitUntil(
    syncYouTube().then(() => sortItems()).catch((err) => console.error("youtube sync failed", err)),
  );
  redirect("/sources?youtube=connected");
}
