import { appRoute } from "@/lib/http";
import { getItem } from "@/lib/items/service";
import { embedItems } from "@/lib/memory/embed";
import { rereadItem } from "@/lib/memory/read";
import { sortItems } from "@/lib/sorter";

// "Read again": hears or reads the item from the start (voice memo, picture or note), sorts and
// embeds it with what it found, then returns it.
export const POST = appRoute<{ id: string }>(async (_req, { id }) => {
  await rereadItem(id);
  await sortItems([id]).catch(() => 0);
  await embedItems([id]).catch(() => 0);
  return getItem(id);
});
