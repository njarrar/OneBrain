import { appRoute } from "@/lib/http";
import { listSources, menuCounts } from "@/lib/queries";

// Everything the app's menu shows. views.resurface counts today's waiting cards.
export const GET = appRoute(async () => {
  const [counts, sources] = await Promise.all([menuCounts(), listSources()]);
  return { ...counts, sources };
});
