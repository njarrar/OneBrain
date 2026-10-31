import { appRoute } from "@/lib/http";
import { PileCall } from "@/lib/items/schema";
import { decide, pileNext, setWhy } from "@/lib/memory/pile";

// Clear the pile, for the app.
//   GET ?limit=30&skip=id,id   the next inbox saves, oldest first, and how many are left
//   POST { id, how }           how = done | letgo | snooze | undo; returns { left }
//   POST { id, why }           why = use | learn | buy | someone | idea, or null to clear it
export const GET = appRoute(async (req) => {
  const q = new URL(req.url).searchParams;
  const limit = Math.floor(Number(q.get("limit"))) || 30;
  const skip = (q.get("skip") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return pileNext(limit, skip);
});

export const POST = appRoute(PileCall, async (body) => {
  if ("how" in body) return decide(body.id, body.how);
  return (await setWhy(body.id, body.why)) ? { ok: true } : null;
});
