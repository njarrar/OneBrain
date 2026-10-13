"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/lib/actions";
import { PaletteButton } from "@/components/CommandPalette";
import { AskButton } from "@/components/AskBox";

type Count = { name: string; count: number };
type CategoryCount = Count & { color: string | null };

const TOP_TAGS = 25;

export function SideMenu({
  views,
  categories,
  tags,
  userName,
}: {
  views: { inbox: number; all: number; archived: number; media: number; sensitive: number; trash: number; unread: number; resurface: number };
  categories: CategoryCount[];
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
  const media = params.get("media");
  const sensitive = params.get("sensitive") === "1";
  const unread = params.get("unread") === "1";
  const filtered = !!(category || tag || media || sensitive || unread || params.get("subtopic") || params.get("lang") || params.get("source") || params.get("q"));
  const only = (key: string) => onList && [...params.keys()].every((k) => k === key || k === "view" || k === "layout");
  const isView = (v: string) => onList && !filtered && view === v;
  const shownTags = allTags ? tags : tags.slice(0, TOP_TAGS);

  const row = (href: string, label: string, count: number | null, active: boolean, color?: string | null) => (
    <Link key={href} href={href} className={active ? "menu-row active" : "menu-row"} aria-current={active ? "page" : undefined}>
      <span dir="auto">
        {color !== undefined && <i className="dot" style={{ background: color ?? "var(--soft)" }} aria-hidden="true" />}
        {label}
      </span>
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
        <div className="inline-actions">
          <AskButton />
          <Link href="/add" className="btn small">Add</Link>
        </div>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <nav className={open ? "menu open" : "menu"} aria-label="Main">
        <div className="menu-head">
          <Link href="/" className="brand">Brain</Link>
          <div className="inline-actions">
            <AskButton />
            <Link href="/add" className="btn small">Add</Link>
          </div>
        </div>
        <div className="menu-search">
          <PaletteButton />
        </div>

        <div className="menu-group">
          <Link href="/ask" className={pathname === "/ask" ? "menu-row resurface active" : "menu-row resurface"} aria-current={pathname === "/ask" ? "page" : undefined}>
            <span>✦ Ask Brain</span>
          </Link>
          <Link href="/resurface" className={pathname === "/resurface" ? "menu-row resurface active" : "menu-row resurface"} aria-current={pathname === "/resurface" ? "page" : undefined}>
            <span>✦ Resurface</span>
            {views.resurface > 0 && <span className="memory-count">{views.resurface}</span>}
          </Link>
          {row("/digest", "Weekly digest", null, pathname === "/digest")}
        </div>

        <div className="menu-group">
          {row("/", "Inbox", views.inbox, isView("inbox"))}
          {row("/?unread=1", "Unread", views.unread, only("unread") && unread && view === "inbox")}
          {row("/?view=all", "All", views.all, isView("all"))}
          {row("/?view=archived", "Archive", views.archived, isView("archived"))}
          {row("/?view=all&media=with", "With media", views.media, only("media") && media === "with")}
          {row("/?view=all&sensitive=1", "Sensitive", views.sensitive, only("sensitive") && sensitive)}
          {row("/?view=trash", "Trash", views.trash, isView("trash"))}
        </div>

        <div className="menu-group">
          <div className="menu-label">Categories</div>
          {categories.map((c) =>
            row(`/?view=all&category=${encodeURIComponent(c.name)}`, c.name, c.count, onList && category === c.name, c.color),
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
          {row("/settings", "Settings", null, pathname === "/settings")}
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
