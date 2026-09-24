import { appRoute } from "@/lib/http";
import { getItem } from "@/lib/items/service";
import { embedItems } from "@/lib/memory/embed";
import { rereadItem } from "@/lib/memory/read";

// "Read again": hears or reads the item from the start (voice memo, picture or note), then returns it.
export const POST = appRoute<{ id: string }>(async (_req, { id }) => {
  await rereadItem(id);
  await embedItems([id]).catch(() => 0);
  return getItem(id);
});
