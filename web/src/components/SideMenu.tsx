"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/lib/actions";

type Count = { name: string; count: number };

const TOP_TAGS = 25;

export function SideMenu({
  views,
  categories,
  tags,
  userName,
}: {
  views: { inbox: number; all: number; archived: number };
  categories: Count[];
  tags: Count[];
  userName: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [allTags, setAllTags] = useState(false);

  useEffect(() => setOpen(false), [pathname, params]);

  const onList = pathname === "/";
  const view = params.get("view") ?? "inbox";
  const category = params.get("category");
  const tag = params.get("tag");
  const filtered = !!(category || tag || params.get("source") || params.get("q"));
  const isView = (v: string) => onList && !filtered && view === v;
  const shownTags = allTags ? tags : tags.slice(0, TOP_TAGS);

  const row = (href: string, label: string, count: number | null, active: boolean) => (
    <Link href={href} className={active ? "menu-row active" : "menu-row"} aria-current={active ? "page" : undefined}>
      <span dir="auto">{label}</span>
      {count !== null && <span className="count">{count.toLocaleString()}</span>}
    </Link>
  );

  return (
    <>
      <div className="topbar">
        <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/" className="brand">Brain</Link>
        <Link href="/add" className="btn small">Add</Link>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <nav className={open ? "menu open" : "menu"} aria-label="Main">
        <div className="menu-head">
          <Link href="/" className="brand">Brain</Link>
          <Link href="/add" className="btn small">Add</Link>
        </div>
        <form action="/" className="menu-search">
          <input id="menu-q" name="q" type="search" placeholder="Search" defaultValue={params.get("q") ?? ""} dir="auto" />
        </form>

        <div className="menu-group">
          {row("/", "Inbox", views.inbox, isView("inbox"))}
          {row("/?view=all", "All", views.all, isView("all"))}
          {row("/?view=archived", "Archive", views.archived, isView("archived"))}
        </div>

        <div className="menu-group">
          <div className="menu-label">Categories</div>
          {categories.map((c) =>
            row(`/?view=all&category=${encodeURIComponent(c.name)}`, c.name, c.count, onList && category === c.name),
          )}
        </div>

        <div className="menu-group">
          <div className="menu-label">Tags</div>
          {tags.length === 0 && <p className="menu-empty">No tags yet.</p>}
          {shownTags.map((t) =>
            row(`/?view=all&tag=${encodeURIComponent(t.name)}`, t.name, t.count, onList && tag?.toLowerCase() === t.name.toLowerCase()),
          )}
          {tags.length > TOP_TAGS && (
            <button className="link-btn" onClick={() => setAllTags(!allTags)}>
              {allTags ? "Show fewer" : `Show all ${tags.length} tags`}
            </button>
          )}
        </div>

        <div className="menu-group">
          {row("/sources", "Sources", null, pathname === "/sources")}
          <form action={logout}>
            <button className="menu-row as-button" type="submit">
              <span>Sign out</span>
              <span className="count" dir="auto">{userName}</span>
            </button>
          </form>
        </div>
      </nav>
    </>
  );
}
