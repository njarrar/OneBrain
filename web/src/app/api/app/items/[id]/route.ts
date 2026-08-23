import { appRoute, jsonError } from "@/lib/http";
import { ItemChange } from "@/lib/items/schema";
import { getItem, purgeItems, updateItem } from "@/lib/items/service";

type P = { id: string };

export const GET = appRoute<P>(async (_req, { id }) => getItem(id));

// Changes one item: status, read, Trash, category, note, tags, reminder. Send only what changes.
export const PATCH = appRoute(ItemChange, async (change, { id }: P) => updateItem(id, change));

// Deletes an item for good. It must be in Trash first.
export const DELETE = appRoute<P>(async (_req, { id }) => {
  const n = await purgeItems([id]);
  return n ? { deleted: n } : jsonError("Move it to Trash first", 409);
});
