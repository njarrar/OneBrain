import type { ListFilter } from "@/lib/queries";

// Builds a list URL, keeping the current filter and changing only what is passed.
export function listHref(base: Partial<ListFilter>, change: Partial<ListFilter> = {}) {
  const f = { ...base, ...change };
  const p = new URLSearchParams();
  if (f.view && f.view !== "inbox") p.set("view", f.view);
  if (f.category) p.set("category", f.category);
  if (f.tag) p.set("tag", f.tag);
  if (f.source) p.set("source", f.source);
  if (f.q) p.set("q", f.q);
  if (f.media) p.set("media", f.media);
  if (f.lang) p.set("lang", f.lang);
  if (f.sensitive) p.set("sensitive", "1");
  if (f.layout === "list") p.set("layout", "list");
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

export const SOURCE_LABELS: Record<string, string> = {
  x: "X",
  youtube: "YouTube",
  instagram: "Instagram",
  photos: "Screenshots",
  feedly: "Feedly",
  manual: "Added by hand",
};

export function hostOf(url: string | null) {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function shortDate(d: string | Date | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
