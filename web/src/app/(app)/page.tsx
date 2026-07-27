import Link from "next/link";
import { cookies } from "next/headers";
import { ItemCard } from "@/components/ItemCard";
import { listCategories, listItems, PAGE_SIZE, type Lang, type Layout, type ListFilter, type MediaFilter, type View } from "@/lib/queries";
import { SOURCE_LABELS, listHref } from "@/lib/links";
import { toggleBlur } from "@/lib/actions";

type Params = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}

function pick<T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined {
  return allowed.includes(v as T) ? (v as T) : undefined;
}

export default async function ListPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const view = pick<View>(one(sp.view), ["inbox", "all", "archived"]);
  const narrowed = one(sp.q) || one(sp.category) || one(sp.tag) || one(sp.source) || one(sp.media) || one(sp.lang) || one(sp.sensitive);
  const f: ListFilter = {
    view: view ?? (narrowed ? "all" : "inbox"),
    category: one(sp.category),
    tag: one(sp.tag),
    source: one(sp.source),
    q: one(sp.q),
    media: pick<MediaFilter>(one(sp.media), ["with", "without"]),
    lang: pick<Lang>(one(sp.lang), ["en", "ar"]),
    sensitive: one(sp.sensitive) === "1",
    layout: pick<Layout>(one(sp.layout), ["grid", "list"]) ?? "grid",
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
  const [{ items, total }, categories, jar] = await Promise.all([listItems(f), listCategories(), cookies()]);
  const blur = jar.get("blur")?.value !== "off";
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const heading =
    f.q ? `Results for “${f.q}”`
    : f.category ?? (f.tag ? `#${f.tag}` : f.source ? SOURCE_LABELS[f.source] ?? f.source
    : f.sensitive ? "Sensitive"
    : f.media === "with" && f.view !== "inbox" ? "With media"
    : { inbox: "Inbox", all: "All", archived: "Archive", trash: "Trash" }[f.view]);

  const pill = (label: string, change: Partial<ListFilter>, on: boolean, dir?: "rtl") => (
    <Link href={listHref(f, { ...change, page: 1 })} className={on ? "seg on" : "seg"} dir={dir} aria-current={on ? "true" : undefined}>
      {label}
    </Link>
  );

  return (
    <div className={`list-page ${f.layout}`}>
      <div className="command">
        <form action="/" className="search">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" /><path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input name="q" type="search" defaultValue={f.q ?? ""} placeholder="Search by word, @handle, or topic, in English or Arabic" dir="auto" aria-label="Search" />
        </form>
        <Link href="/add" className="btn">+ Add</Link>
      </div>

      <div className="filters">
        <div className="seg-group" aria-label="Language">
          {pill("All", { lang: undefined }, !f.lang)}
          {pill("English", { lang: "en" }, f.lang === "en")}
          {pill("العربية", { lang: "ar" }, f.lang === "ar", "rtl")}
        </div>
        <div className="seg-group" aria-label="Media">
          {pill("Any", { media: undefined }, !f.media)}
          {pill("With media", { media: "with" }, f.media === "with")}
          {pill("Text only", { media: "without" }, f.media === "without")}
        </div>
        <div className="seg-group" aria-label="Layout">
          {pill("Grid", { layout: "grid" }, f.layout === "grid")}
          {pill("List", { layout: "list" }, f.layout === "list")}
        </div>
        <form action={toggleBlur} className="blur-toggle">
          <button type="submit" role="switch" aria-checked={blur}>
            <span>Blur sensitive</span>
            <span className="switch" aria-hidden="true"><span /></span>
          </button>
        </form>
      </div>

      <header className="page-head">
        <h1 dir="auto">{heading}</h1>
        <span className="muted mono">{total.toLocaleString()} {total === 1 ? "item" : "items"}</span>
        {(f.category || f.tag || f.source || f.sensitive || f.media || f.lang || f.q) && (
          <div className="seg-group">
            {pill("Active", { view: "all" }, f.view === "all")}
            {pill("Archived", { view: "archived" }, f.view === "archived")}
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <p className="empty">{f.view === "inbox" && !narrowed ? "Your inbox is empty." : "Nothing here yet."}</p>
      ) : (
        <ul className={blur ? "cards blur" : "cards"}>
          {items.map((item) => (
            <ItemCard key={item.id} item={item} categories={categories} />
          ))}
        </ul>
      )}
      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {f.page > 1 ? <Link href={listHref(f, { page: f.page - 1 })}>Newer</Link> : <span />}
          <span className="muted mono">Page {f.page} of {pages}</span>
          {f.page < pages ? <Link href={listHref(f, { page: f.page + 1 })}>Older</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
