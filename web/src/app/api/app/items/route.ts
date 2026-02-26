import { allowed, denied } from "@/lib/apptoken";
import { listItems, PAGE_SIZE, type Lang, type ListFilter, type MediaFilter, type View } from "@/lib/queries";

// The item list for the iPhone app. Takes the same filters as the web list.
export async function GET(req: Request) {
  if (!(await allowed(req))) return denied();
  const q = new URL(req.url).searchParams;
  const one = (k: string) => q.get(k)?.trim() || undefined;
  const pick = <T extends string>(v: string | undefined, ok: readonly T[]) => (ok.includes(v as T) ? (v as T) : undefined);
  const f: ListFilter = {
    view: pick<View>(one("view"), ["inbox", "all", "archived"]) ?? "inbox",
    category: one("category"),
    tag: one("tag"),
    source: one("source"),
    q: one("q"),
    media: pick<MediaFilter>(one("media"), ["with", "without"]),
    lang: pick<Lang>(one("lang"), ["en", "ar"]),
    sensitive: one("sensitive") === "1",
    page: Math.max(1, Number(one("page")) || 1),
  };
  const { items, total } = await listItems(f);
  return Response.json({ items, total, page: f.page, pageSize: PAGE_SIZE });
}
