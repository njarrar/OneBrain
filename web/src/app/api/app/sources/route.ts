import { allowed, denied } from "@/lib/apptoken";
import { env } from "@/lib/db";
import { listSources } from "@/lib/queries";
import { sorterReady } from "@/lib/sorter";
import { xConnected } from "@/lib/x";
import { youtubeConnected } from "@/lib/youtube";

// What the Sources page shows, for the app. Connecting and setting keys happen on the web page.
export async function GET(req: Request) {
  if (!(await allowed(req))) return denied();
  const [sources, x, youtube, claude, e] = await Promise.all([
    listSources(), xConnected(), youtubeConnected(), sorterReady(), env(),
  ]);
  return Response.json({
    sources: sources.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      lastSyncAt: s.last_sync_at,
      lastError: s.last_error,
      items: s.items,
    })),
    connected: { x, youtube, claude },
    sourcesUrl: `${e.BETTER_AUTH_URL ?? new URL(req.url).origin}/sources`,
  });
}
