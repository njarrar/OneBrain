import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { env, first } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await (await getAuth()).api.getSession({ headers: await headers() }))) {
    return new Response("Sign in first", { status: 401 });
  }
  const { id } = await params;
  const file = await first<{ filename: string; mime: string; r2_key: string }>(
    `select filename, mime, r2_key from files where id = ?`,
    id,
  );
  const object = file && (await (await env()).FILES.get(file.r2_key));
  if (!file || !object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": file.mime,
      "content-disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
