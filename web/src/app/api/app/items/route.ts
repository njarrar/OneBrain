import { appRoute, jsonError } from "@/lib/http";
import { parseListFilter } from "@/lib/items/schema";
import { listItems, purgeItems } from "@/lib/items/service";

// The item list for the iPhone app. Takes the same filters as the web list.
// Page with ?cursor=<nextCursor>; ?page=N still works for older app builds.
export const GET = appRoute(async (req) => listItems(parseListFilter(new URL(req.url).searchParams)));

// Empties Trash: DELETE /api/app/items?view=trash. Nothing else can be deleted in bulk.
export const DELETE = appRoute(async (req) => {
  if (new URL(req.url).searchParams.get("view") !== "trash") return jsonError("Only Trash can be emptied");
  return { deleted: await purgeItems() };
});
