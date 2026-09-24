import { authorized } from "@/lib/apptoken";
import { env, first } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(req))) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const file = await first<{ filename: string; mime: string; r2_key: string }>(
    `select filename, mime, r2_key from files where id = ?`,
    id,
  );
  if (!file) return new Response("Not found", { status: 404 });
  // Pictures, sound and video play in the page; any other file downloads, so it can't run as a page on this site.
  const inline = /^(image\/(jpeg|png|gif|webp|heic|heif|avif)|audio\/[\w.+-]+|video\/(mp4|quicktime|webm))$/.test(file.mime);
  // Safari plays audio and video only when it can ask for byte ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  const bucket = (await env()).FILES;
  const head = range ? await bucket.head(file.r2_key) : null;
  let part: R2Range | undefined;
  if (range && head) {
    const size = head.size;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start <= end && start < size) part = { offset: start, length: end - start + 1 };
  }
  const object = await bucket.get(file.r2_key, part ? { range: part } : undefined);
  if (!object) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": inline ? file.mime : "application/octet-stream",
    "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.filename)}"`,
    "x-content-type-options": "nosniff",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
  };
  if (part && "offset" in part && part.offset !== undefined && part.length !== undefined) {
    headers["content-range"] = `bytes ${part.offset}-${part.offset + part.length - 1}/${object.size}`;
    headers["content-length"] = String(part.length);
    return new Response(object.body, { status: 206, headers });
  }
  headers["content-length"] = String(object.size);
  return new Response(object.body, { headers });
}
