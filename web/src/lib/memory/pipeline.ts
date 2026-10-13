import { embedItems } from "@/lib/memory/embed";
import { readItems } from "@/lib/memory/read";
import { BATCH, sortItems } from "@/lib/sorter";

// What happens to every new save, in order: Brain hears or reads it (voice memo, picture, text),
// the AI sorts it with what was found, then it gets its vector for search by meaning.
// Each step carries on when the one before fails, so one bad step doesn't stop the rest.
export async function readSortEmbed(ids: string[], { sort = true }: { sort?: boolean } = {}) {
  if (!ids.length) return;
  await readItems(ids).catch((err) => console.error("read failed", err));
  if (sort) {
    for (let i = 0; i < ids.length; i += BATCH) {
      await sortItems(ids.slice(i, i + BATCH)).catch((err) => console.error("sort failed", err));
    }
  }
  await embedItems(ids).catch((err) => console.error("embed failed", err));
}
