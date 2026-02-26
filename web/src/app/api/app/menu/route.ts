import { allowed, denied } from "@/lib/apptoken";
import { listSources, menuCounts } from "@/lib/queries";

// Everything the app's side menu shows.
export async function GET(req: Request) {
  if (!(await allowed(req))) return denied();
  const [counts, sources] = await Promise.all([menuCounts(), listSources()]);
  return Response.json({ ...counts, sources });
}
