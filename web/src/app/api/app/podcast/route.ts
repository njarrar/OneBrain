import { appRoute } from "@/lib/http";
import { listPodcasts, makePodcast } from "@/lib/memory/podcast";

// The podcast, for the app.
//   GET    the latest episodes; each one's sound is at /api/app/podcast/<id>/audio
//   POST   makes a new episode from the last thirty days (takes about a minute)
export const GET = appRoute(async () => ({
  podcasts: (await listPodcasts(6)).map((p) => ({
    id: p.id, title: p.title, fromDay: p.from_day, toDay: p.to_day, seconds: p.seconds, createdAt: p.created_at,
    audio: `/api/app/podcast/${p.id}/audio`,
    lines: p.lines.map((l) => ({ host: l.host === "A" ? "Maya" : "Sam", text: l.text })),
    items: p.items.map((i) => ({ id: i.id, title: i.title ?? i.body?.slice(0, 120) ?? i.url ?? "Untitled", category: i.category })),
  })),
}));

export const POST = appRoute(async () => makePodcast());
