import { appRoute } from "@/lib/http";
import { Review } from "@/lib/items/schema";
import { DAILY_COUNT, resurfaceToday, review } from "@/lib/memory/reminders";

// Resurface, for the app.
//   GET ?limit=5            today's cards: due reminders, then things from this day in past years
//   POST { id, how }        how = keep | later | done; returns when the card comes back next
export const GET = appRoute(async (req) => {
  const limit = Math.min(20, Math.max(1, Math.floor(Number(new URL(req.url).searchParams.get("limit"))) || DAILY_COUNT));
  return { cards: await resurfaceToday(limit) };
});

export const POST = appRoute(Review, async ({ id, how }) => review(id, how));
