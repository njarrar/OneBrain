import { appRoute, issues, jsonError } from "@/lib/http";
import { SaveJson, tagList } from "@/lib/items/schema";
import { captureItem, type CaptureInput } from "@/lib/items/service";

// The share sheet, the Add sheet and the Screenshots album post here.
//   JSON { url?, text?, title?, sort?, tags?, remindAt? }         a link or a note from any app
//   form { file, text?, externalId?, takenAt?, sort?, tags? }     a screenshot or a shared picture
// sort: false skips Claude's sorting. tags: a list, or one comma-separated string.
export const POST = appRoute(async (req) => {
  let input: CaptureInput;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof File) || !file.size) return jsonError("No file");
    const str = (k: string, max = 20000) => String(form.get(k) ?? "").trim().slice(0, max) || null;
    const takenAt = str("takenAt", 64);
    input = {
      file,
      text: str("text"),
      externalId: str("externalId", 500),
      takenAt: takenAt && !isNaN(Date.parse(takenAt)) ? new Date(takenAt).toISOString() : null,
      sort: form.get("sort") !== "0",
      tags: tagList(form.get("tags")),
    };
  } else {
    const json = await req.json().catch(() => jsonError);
    if (json === jsonError) return jsonError("Send a JSON body.");
    const parsed = SaveJson.safeParse(json);
    if (!parsed.success) return jsonError(issues(parsed.error));
    const b = parsed.data;
    input = { url: b.url, text: b.text, title: b.title, sort: b.sort, tags: tagList(b.tags), remindAt: b.remindAt };
  }
  const { id, existed } = await captureItem(input);
  return { ok: true, id, existed };
});
