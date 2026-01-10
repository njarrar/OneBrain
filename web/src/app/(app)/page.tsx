import Link from "next/link";
import { ItemCard } from "@/components/ItemCard";
import { listItems, PAGE_SIZE, type ListFilter, type View } from "@/lib/queries";
import { SOURCE_LABELS, listHref } from "@/lib/links";

type Params = Promise<Record<string, string | string[] | undefined>>;

function one(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
}

export default async function ListPage({ searchParams }: { searchParams: Params }) {
  const sp = await searchParams;
  const view = (["inbox", "all", "archived"].includes(one(sp.view) ?? "") ? one(sp.view) : undefined) as View | undefined;
  const f: ListFilter = {
    view: view ?? (one(sp.q) || one(sp.category) || one(sp.tag) || one(sp.source) ? "all" : "inbox"),
    category: one(sp.category),
    tag: one(sp.tag),
    source: one(sp.source),
    q: one(sp.q),
    page: Math.max(1, Number(one(sp.page)) || 1),
  };
  const { items, total } = await listItems(f);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const heading =
    f.q ? `Results for “${f.q}”`
    : f.category ?? (f.tag ? `#${f.tag}` : f.source ? SOURCE_LABELS[f.source] ?? f.source
    : { inbox: "Inbox", all: "All", archived: "Archive" }[f.view]);

  return (
    <div className="list-page">
      <header className="page-head">
        <h1 dir="auto">{heading}</h1>
        <span className="muted mono">{total.toLocaleString()} {total === 1 ? "item" : "items"}</span>
      </header>
      {(f.category || f.tag || f.source) && (
        <div className="viewing">
          <Link href={listHref(f, { view: "all", page: 1 })} className={f.view === "all" ? "seg on" : "seg"}>Active</Link>
          <Link href={listHref(f, { view: "archived", page: 1 })} className={f.view === "archived" ? "seg on" : "seg"}>Archived</Link>
        </div>
      )}
      {items.length === 0 ? (
        <p className="empty">
          {f.view === "inbox" && !f.q ? "Your inbox is empty." : "Nothing here yet."}
        </p>
      ) : (
        <ul className="cards">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
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
