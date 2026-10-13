import { getCloudflareContext } from "@opennextjs/cloudflare";
import { saveOne } from "@/lib/ingest";
import { hookKey, sameKey } from "@/lib/settings";
import { readSortEmbed } from "@/lib/memory/pipeline";
import { run } from "@/lib/db";

// Tools such as IFTTT post new saves here: /api/ingest/feedly?key=...
// Body (JSON): url, title, body or content, author, image, published, saved.
const SOURCES = new Set(["feedly", "instagram", "youtube", "manual", "x"]);

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

// IFTTT sends HTML in article bodies. Keep the words only.
function plain(html: string | null) {
  if (!html) return null;
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// IFTTT drops article text into the JSON body without escaping quotes or new lines, which
// breaks JSON. When that happens, split the body on the known keys instead.
const KEYS = ["url", "title", "body", "author", "image", "feed", "published", "saved", "content", "id"];

function parseBody(raw: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    const marks = [...raw.matchAll(new RegExp(`"(${KEYS.join("|")})"\\s*:\\s*"`, "g"))];
    if (!marks.length) return null;
    const out: Record<string, unknown> = {};
    marks.forEach((m, i) => {
      const start = m.index! + m[0].length;
      const end = i + 1 < marks.length ? marks[i + 1].index! : raw.lastIndexOf("}");
      out[m[1]] = raw.slice(start, end).replace(/"\s*,?\s*$/, "");
    });
    return out;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ source: string }> }) {
  const { source } = await params;
  const given = new URL(req.url).searchParams.get("key") ?? req.headers.get("x-brain-key") ?? "";
  if (!sameKey(given, await hookKey())) return Response.json({ error: "wrong key" }, { status: 401 });
  if (!SOURCES.has(source)) return Response.json({ error: "unknown source" }, { status: 404 });

  const raw = await req.text();
  const data = parseBody(raw);
  if (!data) return Response.json({ error: "send JSON" }, { status: 400 });
  const url = text(data.url);
  if (!url || !/^https?:\/\//i.test(url)) return Response.json({ error: "url is required" }, { status: 400 });

  const image = text(data.image);
  const id = await saveOne({
    source,
    externalId: text(data.id) ?? url,
    url,
    title: text(data.title),
    body: plain(text(data.body) ?? text(data.content)),
    author: text(data.author) ?? text(data.feed),
    media: image && /^https?:\/\//.test(image) ? [image] : [],
    postedAt: text(data.published),
    savedAt: text(data.saved) ?? new Date().toISOString(),
    raw: data,
  });
  await run(
    `update sources set status = 'connected', last_sync_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = null where id = ?`,
    source,
  );
  getCloudflareContext().ctx.waitUntil(readSortEmbed([id]));
  return Response.json({ ok: true, id });
}
