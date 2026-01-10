import Link from "next/link";
import type { ItemRow } from "@/lib/queries";
import { SOURCE_LABELS, shortDate } from "@/lib/links";

export function displayTitle(item: Pick<ItemRow, "title" | "body" | "url" | "author">) {
  if (item.title) return item.title;
  const text = item.body?.trim();
  if (text) return text.length > 140 ? text.slice(0, 140).trimEnd() + "…" : text;
  return item.url ?? "Untitled";
}

export function ItemCard({ item }: { item: ItemRow }) {
  return (
    <li className="card">
      <Link href={`/item/${item.id}`} className="card-link">
        <div className="card-top">
          {item.author && (
            <span className="who" dir="auto">
              {item.author} {item.author_handle && <span className="muted">{item.author_handle}</span>}
            </span>
          )}
          <span className="muted mono small">{shortDate(item.posted_at ?? item.created_at)}</span>
        </div>
        <p className="card-title" dir="auto">{displayTitle(item)}</p>
        {item.note && <p className="card-note" dir="auto">{item.note}</p>}
        <div className="chips">
          {item.sources.map((s) => (
            <span key={s} className="chip source">{SOURCE_LABELS[s] ?? s}</span>
          ))}
          {item.category && <span className="chip cat" dir="auto">{item.category}</span>}
          {item.tags.slice(0, 4).map((t) => (
            <span key={t} className="chip" dir="auto">{t}</span>
          ))}
          {item.status === "archived" && <span className="chip muted-chip">Archived</span>}
        </div>
      </Link>
    </li>
  );
}
