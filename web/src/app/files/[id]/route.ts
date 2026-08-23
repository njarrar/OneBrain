import { authorized } from "@/lib/apptoken";
import { env, first } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await authorized(req))) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const file = await first<{ filename: string; mime: string; r2_key: string }>(
    `select filename, mime, r2_key from files where id = ?`,
    id,
  );
  const object = file && (await (await env()).FILES.get(file.r2_key));
  if (!file || !object) return new Response("Not found", { status: 404 });
  // Pictures show in the page; any other file downloads, so it can't run as a page on this site.
  const inline = /^image\/(jpeg|png|gif|webp|heic|heif|avif)$/.test(file.mime);
  return new Response(object.body, {
    headers: {
      "content-type": inline ? file.mime : "application/octet-stream",
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.filename)}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
