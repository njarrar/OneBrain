import { appRoute, jsonError } from "@/lib/http";
import { isWebLink } from "@/lib/sources";
import { unfurl } from "@/lib/unfurl";

// A link's title, description and picture, for the preview in the Add sheet.
export const GET = appRoute(async (req) => {
  const url = new URL(req.url).searchParams.get("url")?.trim().slice(0, 2000) ?? "";
  if (!isWebLink(url)) return jsonError("Bad link");
  return unfurl(url);
});
