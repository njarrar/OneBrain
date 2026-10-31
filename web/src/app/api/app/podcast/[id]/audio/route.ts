import { authorized } from "@/lib/apptoken";
import { env } from "@/lib/db";
import { podcastFile } from "@/lib/memory/podcast";

// One podcast episode's sound. Answers byte ranges, which Safari and the phones need to play and seek.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(req))) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const file = await podcastFile(id);
  if (!file) return new Response("Not found", { status: 404 });
  const size = file.size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  let part: { offset: number; length: number } | undefined;
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response("Range not satisfiable", { status: 416, headers: { "content-range": `bytes */${size}` } });
    part = { offset: start, length: end - start + 1 };
  }
  const object = await (await env()).FILES.get(file.r2_key, part ? { range: part } : undefined);
  if (!object) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = {
    "content-type": "audio/mpeg",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
  };
  if (part) {
    headers["content-range"] = `bytes ${part.offset}-${part.offset + part.length - 1}/${size}`;
    headers["content-length"] = String(part.length);
    return new Response(object.body, { status: 206, headers });
  }
  headers["content-length"] = String(size);
  return new Response(object.body, { headers });
}
