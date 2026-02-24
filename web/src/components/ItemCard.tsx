import Link from "next/link";
import type { ItemRow } from "@/lib/queries";
import { SOURCE_LABELS, hostOf, shortDate } from "@/lib/links";
import { CategoryPicker } from "@/components/CategoryPicker";

export function displayTitle(item: Pick<ItemRow, "title" | "body" | "url" | "author">) {
  if (item.title) return item.title;
  const text = item.body?.trim();
  if (text) return text.length > 140 ? text.slice(0, 140).trimEnd() + "…" : text;
  return item.url ?? "Untitled";
}

const MAX_PICS = 4;

// Every picture on an item: files you added first, then pictures that came with the post.
export function pictures(item: Pick<ItemRow, "images" | "media">) {
  return [...item.images.map((id) => `/files/${id}`), ...item.media];
}

function initials(name: string | null) {
  const s = (name ?? "?").replace(/^@/, "").trim();
  return [...s][0]?.toUpperCase() ?? "?";
}

export function ItemCard({ item, categories }: { item: ItemRow; categories: { name: string; color: string | null }[] }) {
  const pics = pictures(item);
  const shown = pics.slice(0, MAX_PICS);
  const extra = pics.length - shown.length;
  const href = `/item/${item.id}`;
  const text = item.title ?? item.body?.trim() ?? item.url ?? "Untitled";
  const host = item.title && item.url ? hostOf(item.url) : null;
  const rtl = item.lang === "ar";

  return (
    <li className={item.sensitive ? "card sensitive" : "card"} style={{ "--cat": item.category_color ?? "var(--line)" } as React.CSSProperties}>
      <div className="card-head">
        <span className="avatar" aria-hidden="true">{initials(item.author ?? item.author_handle ?? hostOf(item.url))}</span>
        <div className="card-who">
          <span className="who" dir="auto">{item.author ?? host ?? SOURCE_LABELS[item.sources[0]] ?? "Saved"}</span>
          <span className="meta">
            {item.author_handle && <>{item.author_handle} · </>}
            {shortDate(item.posted_at ?? item.created_at)}
          </span>
        </div>
        {item.sources.map((s) => (
          <span key={s} className="src">{SOURCE_LABELS[s] ?? s}</span>
        ))}
      </div>

      {item.subtopic && <span className="topic" dir="auto">{item.subtopic}</span>}

      <Link href={href} className={rtl ? "card-text rtl" : "card-text"} dir="auto">{text}</Link>
      {item.summary && <p className="insight" dir="auto">{item.summary}</p>}

      {shown.length > 0 && (
        <Link href={href} className={`pics n${shown.length}`} aria-label={`${pics.length} ${pics.length === 1 ? "picture" : "pictures"}`}>
          {shown.map((src, i) => (
            <span key={src} className="pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
              {extra > 0 && i === shown.length - 1 && <span className="more">+{extra}</span>}
            </span>
          ))}
        </Link>
      )}

      {item.note && <p className="card-note" dir="auto">{item.note}</p>}

      <div className="card-foot">
        <CategoryPicker id={item.id} current={item.category} color={item.category_color} categories={categories} />
        {item.tags.slice(0, 3).map((t) => (
          <Link key={t} href={`/?view=all&tag=${encodeURIComponent(t)}`} className="chip" dir="auto">{t}</Link>
        ))}
        {item.status === "archived" && <span className="chip muted-chip">Archived</span>}
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" className="open" aria-label="Open original">
            <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 2h5v5M14 2 7 9" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        )}
      </div>
    </li>
  );
}
