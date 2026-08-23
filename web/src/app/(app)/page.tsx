import Link from "next/link";
import { cookies } from "next/headers";
import { ItemCard } from "@/components/ItemCard";
import { ItemView } from "@/components/ItemView";
import { ListKeys } from "@/components/ListKeys";
import { listCategories, listItems, listSubtopics } from "@/lib/queries";
import { parseListFilter, type ListFilter } from "@/lib/items/schema";
import { listHref } from "@/lib/links";
import { sourceLabel } from "@/lib/sources";
import { emptyTrash, toggleBlur } from "@/lib/actions";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function ListPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  // The same reader as /api/app/items, so the web and the phone read filters the same way.
  const f: ListFilter = parseListFilter(sp);
  const narrowed = !!(f.q || f.category || f.subtopic || f.tag || f.source || f.media || f.lang || f.sensitive || f.unread);
  const [{ items, total, nextCursor }, categories, subtopics, jar] = await Promise.all([
    listItems(f),
    listCategories(),
    f.category ? listSubtopics(f.category) : Promise.resolve([]),
    cookies(),
  ]);
  const blur = jar.get("blur")?.value !== "off";

  // In the List layout, a card opens in a reading pane beside the list (?open=id).
  const openParam = typeof sp.open === "string" ? sp.open.slice(0, 200) : null;
  const open = f.layout === "list" ? openParam : null;
  const here = listHref(f);
  const withParam = (href: string, k: string, v: string) => `${href}${href.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;
  const openHref = (id: string) => withParam(f.cursor ? withParam(here, "cursor", f.cursor) : here, "open", id);
  const closeHref = open ? (f.cursor ? withParam(here, "cursor", f.cursor) : here) : null;

  const heading =
    f.q ? `Results for “${f.q}”`
    : f.subtopic ?? f.category ?? (f.tag ? `#${f.tag}` : f.source ? sourceLabel(f.source)
    : f.sensitive ? "Sensitive"
    : f.media === "with" && f.view !== "inbox" ? "With media"
    : f.unread && f.view === "inbox" ? "Unread"
    : { inbox: "Inbox", all: "All", archived: "Archive", trash: "Trash" }[f.view]);

  const pill = (label: string, change: Partial<ListFilter>, on: boolean, dir?: "rtl") => (
    <Link href={listHref(f, { ...change, page: 1 })} className={on ? "seg on" : "seg"} dir={dir} aria-current={on ? "true" : undefined}>
      {label}
    </Link>
  );

  return (
    <div className={`list-page ${f.layout}${open ? " with-pane" : ""}`}>
      <ListKeys closeHref={closeHref} />
      <div className="command">
        <form action="/" className="search">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" /><path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input name="q" type="search" defaultValue={f.q ?? ""} placeholder="Search by word, @handle, or topic, in English or Arabic" dir="auto" aria-label="Search" />
        </form>
        <Link href="/add" className="btn">+ Add</Link>
      </div>

      <div className="filters">
        {f.view !== "trash" && f.view !== "archived" && (
          <div className="seg-group" aria-label="Read">
            {pill("All", { unread: undefined }, !f.unread)}
            {pill("Unread only", { unread: true }, !!f.unread)}
          </div>
        )}
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

      {subtopics.length > 1 && (
        <div className="subtopics" aria-label="Sub-topics">
          {pill("Every sub-topic", { subtopic: undefined }, !f.subtopic)}
          {subtopics.map((t) => (
            <Link
              key={t.name}
              href={listHref(f, { subtopic: t.name, page: 1 })}
              className={f.subtopic === t.name ? "seg on" : "seg"}
              aria-current={f.subtopic === t.name ? "true" : undefined}
              dir="auto"
            >
              {t.name} <span className="muted">{t.count}</span>
            </Link>
          ))}
        </div>
      )}

      <header className="page-head">
        <h1 dir="auto">{heading}</h1>
        {total !== null && <span className="muted mono">{total.toLocaleString()} {total === 1 ? "item" : "items"}</span>}
        {f.view === "trash" && (total ?? items.length) > 0 && (
          <form action={emptyTrash}>
            <button className="btn quiet danger">Empty Trash</button>
          </form>
        )}
        {(f.category || f.subtopic || f.tag || f.source || f.sensitive || f.media || f.lang || f.q) && (
          <div className="seg-group">
            {pill("Active", { view: "all" }, f.view === "all")}
            {pill("Archived", { view: "archived" }, f.view === "archived")}
          </div>
        )}
      </header>

      {f.view === "trash" && items.length > 0 && (
        <p className="muted small">Deleted saves wait here until you empty Trash. Open one to restore it or delete it for good.</p>
      )}
      {items.length === 0 ? (
        <p className="empty">
          {f.view === "trash" ? "Trash is empty."
            : f.unread && !f.q ? "Nothing unread here."
            : f.view === "inbox" && !narrowed ? "Your inbox is empty."
            : "Nothing here yet."}
        </p>
      ) : (
        <div className={open ? "split" : undefined}>
          <ul className={blur ? "cards blur" : "cards"}>
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                categories={categories}
                href={f.layout === "list" ? openHref(item.id) : undefined}
                selected={item.id === open}
              />
            ))}
          </ul>
          {open && (
            <aside className="pane" aria-label="Reading pane">
              <Link href={closeHref ?? here} className="pane-close" aria-label="Close reading pane" scroll={false}>×</Link>
              <ItemView id={open} pane />
            </aside>
          )}
        </div>
      )}
      {(f.cursor || nextCursor || f.page > 1) && (
        <nav className="pager" aria-label="Pages">
          {f.cursor || f.page > 1 ? <Link href={listHref(f, { page: 1 })}>Back to newest</Link> : <span />}
          <span className="muted small">
            {f.layout === "list" ? "j and k move, e archives, u marks unread" : "Press / or ⌘K to search or ask"}
          </span>
          {nextCursor ? <Link href={withParam(here, "cursor", nextCursor)}>Older</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
