import { appRoute } from "@/lib/http";
import { env } from "@/lib/db";
import { listSources } from "@/lib/queries";
import { aiName, aiReady } from "@/lib/ai";
import { xConnected } from "@/lib/x";
import { youtubeConnected } from "@/lib/youtube";
import { connectorStatus } from "@/lib/connect";

// What the Sources page shows, for the app. Connecting and setting keys happen on the web page.
export const GET = appRoute(async (req) => {
  const [sources, x, youtube, ready, e, linked] = await Promise.all([
    listSources(), xConnected(), youtubeConnected(), aiReady(), env(), connectorStatus(),
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
    // claude stays for older phone builds; it means the chosen AI has a key.
    connected: {
      x, youtube, claude: ready, ai: ready,
      gmail: linked.gmail.connected, outlook: linked.outlook.connected, pinterest: linked.pinterest.connected,
    },
    ai: await aiName(),
    sourcesUrl: `${e.BETTER_AUTH_URL ?? new URL(req.url).origin}/sources`,
  });
});
