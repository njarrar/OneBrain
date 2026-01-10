// Reads a page's title, description and preview image so links added by hand
// show something useful before Claude sorts them.
export type Unfurled = { title?: string; description?: string; image?: string };

function meta(html: string, key: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`,
    "i",
  );
  const m = html.match(re);
  return decode(m?.[1] ?? m?.[2]);
}

function decode(s?: string) {
  if (!s) return undefined;
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim() || undefined;
}

export async function unfurl(url: string): Promise<Unfurled> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; DigitalBrain/1.0)" },
      redirect: "follow",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return {};
    const html = (await res.text()).slice(0, 300_000);
    const title = meta(html, "og:title") ?? decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]);
    return {
      title,
      description: meta(html, "og:description") ?? meta(html, "description"),
      image: meta(html, "og:image"),
    };
  } catch {
    return {};
  }
}
