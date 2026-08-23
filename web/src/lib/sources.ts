// Every place a save can come from: one list for labels and link detection, used by the web
// pages and the save route. The iPhone app keeps the same ids (see contracts/README.md).
export type SourceId = "x" | "youtube" | "instagram" | "photos" | "feedly" | "manual";

type SourceInfo = { label: string; hosts?: RegExp };

export const SOURCES: Record<SourceId, SourceInfo> = {
  x: { label: "X", hosts: /(^|\.)(x\.com|twitter\.com)$/ },
  youtube: { label: "YouTube", hosts: /(^|\.)(youtube\.com|youtu\.be)$/ },
  instagram: { label: "Instagram", hosts: /(^|\.)instagram\.com$/ },
  photos: { label: "Screenshots" },
  feedly: { label: "Feedly", hosts: /(^|\.)feedly\.com$/ },
  manual: { label: "Added by hand" },
};

export const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(SOURCES).map(([id, s]) => [id, s.label]),
);

export const sourceLabel = (id: string) => SOURCE_LABELS[id] ?? id;

// Which source a shared link belongs to. Anything unknown, or not a real link, counts as added by hand.
export function sourceOfUrl(url: string | null | undefined): SourceId {
  if (!url) return "manual";
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "manual";
  }
  for (const [id, s] of Object.entries(SOURCES) as [SourceId, SourceInfo][]) {
    if (s.hosts?.test(host)) return id;
  }
  return "manual";
}

export function firstUrl(text: string | null | undefined) {
  return text?.match(/https?:\/\/[^\s<>"']+/)?.[0] ?? null;
}

// A link worth saving: http or https with a real host name.
export function isWebLink(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.length > 0 && u.hostname.includes(".");
  } catch {
    return false;
  }
}
