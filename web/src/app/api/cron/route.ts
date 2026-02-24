import { env } from "@/lib/db";
import { sameKey } from "@/lib/settings";
import { syncYouTube, youtubeConnected } from "@/lib/youtube";
import { sortItems } from "@/lib/sorter";

// The Worker's timer calls this every few hours (see worker.ts): pull new YouTube saves,
// then sort a few batches of anything still unsorted.
const SORT_BATCHES = 10;

export async function POST(req: Request) {
  const e = await env();
  if (!e.BETTER_AUTH_SECRET || !sameKey(req.headers.get("x-cron-key") ?? "", e.BETTER_AUTH_SECRET)) {
    return new Response("no", { status: 401 });
  }
  const report: Record<string, unknown> = {};
  if (await youtubeConnected()) {
    try {
      report.youtube = await syncYouTube();
    } catch (err) {
      report.youtube = String(err);
    }
  }
  let sorted = 0;
  try {
    for (let i = 0; i < SORT_BATCHES; i++) {
      const n = await sortItems();
      sorted += n;
      if (!n) break;
    }
  } catch (err) {
    report.sortError = String(err);
  }
  report.sorted = sorted;
  return Response.json(report);
}
