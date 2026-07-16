import { getCloudflareContext } from "@opennextjs/cloudflare";
import { allowed, denied } from "@/lib/apptoken";
import { db, env, run } from "@/lib/db";
import { noteKey, sha256Hex, urlKey } from "@/lib/canonical";
import { saveOne } from "@/lib/ingest";
import { sortItems } from "@/lib/sorter";
import { unfurl } from "@/lib/unfurl";

// The share sheet and the Screenshots album post here.
//   JSON { url?, text?, title? }             a link or a note from any app
//   form { file, externalId?, takenAt? }     a screenshot or a shared picture
const MAX_FILE = 20 * 1024 * 1024;

function sourceOf(url: string | null) {
  if (!url) return "manual";
  const host = new URL(url).hostname.replace(/^www\./, "");
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return "youtube";
  if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return "x";
  if (/(^|\.)feedly\.com$/.test(host)) return "feedly";
  return "manual";
}

function firstUrl(text: string | null) {
  return text?.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? null;
}

async function saveFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX_FILE) return Response.json({ error: "File over 20 MB" }, { status: 413 });
  const external = String(form.get("externalId") ?? "") || null;
  const source = external ? "photos" : "manual";
  const takenAt = String(form.get("takenAt") ?? "") || null;
  const note = String(form.get("text") ?? "").trim() || null;

  // The same picture sent twice (a retry, or the same screenshot shared again) is one item.
  const bytes = await file.arrayBuffer();
  const hash = await sha256Hex(bytes);
  const id = await saveOne({
    source, externalId: external ?? `img:${hash}`, imageHash: hash, kind: "image", title: note,
    postedAt: takenAt, savedAt: takenAt, raw: { filename: file.name },
  });
  const d = await db();
  const has = await d.prepare(`select 1 from files where item_id = ?`).bind(id).first();
  if (!has) {
    const fileId = crypto.randomUUID();
    const key = `files/${fileId}`;
    const mime = file.type || "image/jpeg";
    await (await env()).FILES.put(key, bytes, { httpMetadata: { contentType: mime } });
    await run(
      `insert into files (id, item_id, filename, mime, size, r2_key, sha256) select ?, ?, ?, ?, ?, ?, ?
       where not exists (select 1 from files where item_id = ? and sha256 = ?)`,
      fileId, id, file.name || "photo.jpg", mime, file.size, key, hash, id, hash,
    );
  }
  if (source === "photos") {
    await run(`update sources set status = 'connected', last_sync_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = 'photos'`);
  }
  return Response.json({ ok: true, id, existed: !!has });
}

export async function POST(req: Request) {
  if (!(await allowed(req))) return denied();
  let res: Response;
  let id: string | null = null;
  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    res = await saveFile(await req.formData());
    if (res.ok) id = ((await res.clone().json()) as { id: string }).id;
  } else {
    const b = (await req.json()) as { url?: string; text?: string; title?: string };
    const text = b.text?.trim() || null;
    const url = (b.url?.trim() || firstUrl(text)) ?? null;
    if (url && !/^https?:\/\//i.test(url)) return Response.json({ error: "Bad link" }, { status: 400 });
    if (!url && !text) return Response.json({ error: "Nothing to save" }, { status: 400 });
    const found = url ? await unfurl(url) : {};
    const note = text && text !== url ? text.replace(url ?? "", "").trim() || null : null;
    // One key per link however it is spelled, or per note by its words, so a retried share adds nothing.
    const key = url ? urlKey(url) : await noteKey(text ?? "");
    id = await saveOne({
      source: sourceOf(url),
      externalId: key ?? url ?? null,
      key,
      url,
      title: b.title?.trim() || found.title || (!url ? note?.split("\n")[0].slice(0, 120) : null),
      body: found.description ?? (url ? null : note),
      media: found.image ? [found.image] : [],
      kind: url ? "link" : "note",
      savedAt: new Date().toISOString(),
      raw: b,
    });
    if (url && note) await run(`update items set note = coalesce(note, ?) where id = ?`, note, id);
    res = Response.json({ ok: true, id });
  }
  if (id) getCloudflareContext().ctx.waitUntil(sortItems([id]).catch((err) => console.error("sort failed", err)));
  return res;
}
