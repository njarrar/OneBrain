import type { ListFilter } from "@/lib/items/schema";

// Builds a list URL, keeping the current filter and changing only what is passed.
export function listHref(base: Partial<ListFilter>, change: Partial<ListFilter> = {}) {
  const f = { ...base, ...change };
  const p = new URLSearchParams();
  if (f.view && f.view !== "inbox") p.set("view", f.view);
  if (f.category) p.set("category", f.category);
  if (f.subtopic) p.set("subtopic", f.subtopic);
  if (f.tag) p.set("tag", f.tag);
  if (f.source) p.set("source", f.source);
  if (f.q) p.set("q", f.q);
  if (f.media) p.set("media", f.media);
  if (f.lang) p.set("lang", f.lang);
  if (f.sensitive) p.set("sensitive", "1");
  if (f.unread) p.set("unread", "1");
  if (f.layout === "list") p.set("layout", "list");
  if (f.page && f.page > 1) p.set("page", String(f.page));
  const s = p.toString();
  return s ? `/?${s}` : "/";
}

// Source names live in lib/sources.ts; re-exported here for older imports.
export { SOURCE_LABELS } from "@/lib/sources";

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
