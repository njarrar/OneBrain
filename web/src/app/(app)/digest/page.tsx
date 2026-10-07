import Link from "next/link";
import { Fragment } from "react";
import { DigestButton } from "@/components/DigestButton";
import { displayTitle } from "@/components/ItemCard";
import { listDigests, weekStart, type Digest } from "@/lib/memory/digest";
import { shortDate } from "@/lib/links";

export const metadata = { title: "Weekly digest · Brain" };

// Turns "[2]" marks into links to the items they cite.
function Cited({ text, items }: { text: string; items: Digest["items"] }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[(\d+)\]$/);
        const item = m ? items[Number(m[1]) - 1] : null;
        if (!m) return <Fragment key={i}>{p}</Fragment>;
        if (!item || item.deleted_at === "gone") return <sup key={i} className="muted">{p}</sup>;
        return (
          <Link key={i} href={`/item/${item.id}`} className="cite" title={displayTitle(item)}>
            {m[1]}
          </Link>
        );
      })}
    </>
  );
}

// One short write-up per week of what was saved, made by the chosen AI on Sunday evenings.
export default async function DigestPage() {
  const digests = await listDigests(8);
  const thisWeek = weekStart();
  const hasThisWeek = digests.some((d) => d.week_start === thisWeek);
  return (
    <div className="narrow digest-page">
      <header className="page-head">
        <h1>Weekly digest</h1>
        <DigestButton label={hasThisWeek ? "Write this week's again" : "Write this week's now"} />
      </header>
      <p className="muted small">Your AI writes one every Sunday evening from what you saved that week.</p>
      {digests.length === 0 && <p className="empty">No digest yet. The first one comes on Sunday evening.</p>}
      {digests.map((d) => (
        <section key={d.week_start} className="panel digest">
          <h2>
            Week of {shortDate(d.week_start)} <span className="muted">· {d.saved.toLocaleString()} saved</span>
          </h2>
          {d.body.split(/\n+/).filter((l) => l.trim()).map((line, i) => (
            <p key={i} dir="auto">
              <Cited text={line} items={d.items} />
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
