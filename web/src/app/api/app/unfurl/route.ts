import { allowed, denied } from "@/lib/apptoken";
import { unfurl } from "@/lib/unfurl";

// A link's title, description and picture, for the preview in the Add sheet.
export async function GET(req: Request) {
  if (!(await allowed(req))) return denied();
  const url = new URL(req.url).searchParams.get("url")?.trim() ?? "";
  if (!/^https?:\/\//i.test(url)) return Response.json({ error: "Bad link" }, { status: 400 });
  return Response.json(await unfurl(url));
}
