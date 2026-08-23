import { appRoute } from "@/lib/http";
import { relatedItems } from "@/lib/memory/embed";

// Items about the same thing as this one, closest first. Empty until the item has a vector.
export const GET = appRoute<{ id: string }>(async (_req, { id }) => ({ items: await relatedItems(id) }));
