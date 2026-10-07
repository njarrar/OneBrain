import { z } from "zod";

// The data contract between the web app, the iPhone app and the share extension.
// ios/Shared/Models.swift and ios/Shared/API.swift mirror these shapes; change both together
// (see contracts/README.md).

export const ItemStatus = z.enum(["inbox", "read", "archived"]);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const View = z.enum(["inbox", "all", "archived", "trash"]);
export type View = z.infer<typeof View>;

export const MediaFilter = z.enum(["with", "without"]);
export type MediaFilter = z.infer<typeof MediaFilter>;

export const Lang = z.enum(["en", "ar"]);
export type Lang = z.infer<typeof Lang>;

export type Layout = "grid" | "list";

export const TagName = z.string().trim().min(1).max(60).transform((t) => t.replace(/^#/, "")).pipe(z.string().min(1));
const TagList = z.array(TagName).max(20);

// A date with a zone, such as 2026-09-29T09:00:00.000Z.
export const IsoDate = z.iso.datetime({ offset: true });

// One change to one item. Send only the fields that change. Unknown fields are refused.
export const ItemChange = z
  .object({
    status: ItemStatus.optional(),
    // true marks the item read, false unread.
    read: z.boolean().optional(),
    // true moves the item to Trash, false brings it back.
    trash: z.boolean().optional(),
    // "" or null clears the category.
    category: z.string().trim().max(120).nullable().optional(),
    // "" or null clears the note.
    note: z.string().max(20000).nullable().optional(),
    addTags: TagList.optional(),
    removeTags: z.array(z.string().max(60)).max(20).optional(),
    // When the item should come back in Resurface. null clears the reminder.
    remindAt: IsoDate.nullable().optional(),
  })
  .strict();
export type ItemChange = z.infer<typeof ItemChange>;

// A link or a note from the share sheet or the Add sheet.
export const SaveJson = z.object({
  url: z.string().trim().max(2000).optional(),
  text: z.string().max(20000).optional(),
  title: z.string().trim().max(500).optional(),
  // false skips the AI's sorting.
  sort: z.boolean().optional(),
  tags: z.union([TagList, z.string().max(2000)]).optional(),
  remindAt: IsoDate.optional(),
});
export type SaveJson = z.infer<typeof SaveJson>;

export const Review = z.object({ id: z.string().min(1).max(200), how: z.enum(["keep", "later", "done"]) });
export const Question = z.object({ q: z.string().trim().min(1).max(500) });

// Tags sent as a list or as one comma-separated string (a form field). Bad names are dropped.
export function tagList(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  const out = new Set<string>();
  for (const raw of list) {
    const r = TagName.safeParse(String(raw));
    if (r.success) out.add(r.data);
  }
  return [...out].slice(0, 20);
}

// Filters for the item list, from a URL query (web page and /api/app/items).
export type ListFilter = {
  view: View;
  category?: string;
  subtopic?: string;
  tag?: string;
  source?: string;
  q?: string;
  media?: MediaFilter;
  lang?: Lang;
  sensitive?: boolean;
  unread?: boolean;
  layout?: Layout;
  // Keyset paging: pass nextCursor from the page before. page still works for older app builds.
  cursor?: string;
  page: number;
};

type Query = URLSearchParams | Record<string, string | string[] | undefined>;

// Reads filters the same way for the web page and the app API. A narrowed list with no
// view looks across everything, not only the inbox.
export function parseListFilter(q: Query): ListFilter {
  const get = (k: string) => {
    const v = q instanceof URLSearchParams ? q.get(k) : q[k];
    return (Array.isArray(v) ? v[0] : v)?.trim().slice(0, 500) || undefined;
  };
  const pick = <T,>(schema: z.ZodType<T>, k: string): T | undefined => {
    const r = schema.safeParse(get(k));
    return r.success ? r.data : undefined;
  };
  const media = pick(MediaFilter, "media");
  const lang = pick(Lang, "lang");
  const sensitive = get("sensitive") === "1";
  // Only filters that parsed count, so ?lang=fr alone still shows the inbox.
  const narrowed = ["q", "category", "subtopic", "tag", "source"].some((k) => get(k)) || !!media || !!lang || sensitive;
  return {
    view: pick(View, "view") ?? (narrowed ? "all" : "inbox"),
    category: get("category"),
    subtopic: get("subtopic"),
    tag: get("tag"),
    source: get("source"),
    q: get("q"),
    media,
    lang,
    sensitive,
    unread: get("unread") === "1",
    layout: get("layout") === "list" ? "list" : "grid",
    cursor: get("cursor"),
    page: Math.min(10000, Math.max(1, Math.floor(Number(get("page"))) || 1)),
  };
}
