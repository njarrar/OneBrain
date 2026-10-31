import Link from "next/link";
import { topicMap } from "@/lib/memory/map";

export const metadata = { title: "Topic map · Brain" };

const href = (name: string) => `/?view=all&category=${encodeURIComponent(name)}`;

// What you keep, by topic: each circle is a category, sized by how much you saved in it. Lines
// join categories whose saves share tags; a thicker line means more shared tags.
export default async function MapPage() {
  const map = await topicMap();
  const byName = new Map(map.nodes.map((n) => [n.name, n]));
  const most = Math.max(1, ...map.links.map((l) => l.shared));
  return (
    <div className="narrow map-page">
      <header className="page-head">
        <h1>Topic map</h1>
        <span className="muted">{map.total.toLocaleString()} saves. Bigger circles hold more. Lines join topics that share tags.</span>
      </header>
      {map.nodes.length === 0 ? (
        <p className="empty">Nothing is sorted yet. Once the AI sorts your saves, the map fills in.</p>
      ) : (
        <>
          <svg viewBox="-20 -20 1040 1060" className="topic-map" role="img" aria-label="Map of your topics">
            {map.links.map((l) => {
              const a = byName.get(l.a)!;
              const b = byName.get(l.b)!;
              return (
                <line key={`${l.a}|${l.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="map-link"
                  strokeWidth={1.5 + 5 * (l.shared / most)} opacity={0.25 + 0.55 * (l.shared / most)}>
                  <title>{`${l.a} and ${l.b}: ${l.shared} shared tags`}</title>
                </line>
              );
            })}
            {map.nodes.map((n) => (
              <a key={n.name} href={href(n.name)} className="map-node">
                <title>{`${n.name}: ${n.count.toLocaleString()} saves`}</title>
                <circle cx={n.x} cy={n.y} r={n.r} style={{ ["--c" as string]: n.color ?? "var(--accent)" }} />
                <text x={n.x} y={n.y + n.r + 22} textAnchor="middle" className="map-name">{n.name}</text>
                <text x={n.x} y={n.y + 9} textAnchor="middle" className="map-count">{n.count.toLocaleString()}</text>
              </a>
            ))}
          </svg>
          <div className="map-list">
            {map.nodes.map((n) => (
              <section key={n.name} className="panel">
                <h2>
                  <Link href={href(n.name)}><i className="dot" style={{ background: n.color ?? "var(--soft)" }} /> {n.name}</Link>
                  <span className="muted"> · {n.count.toLocaleString()}</span>
                </h2>
                {n.subtopics.length > 0 && (
                  <div className="chips">
                    {n.subtopics.map((s) => (
                      <Link key={s.name} className="chip" href={`${href(n.name)}&subtopic=${encodeURIComponent(s.name)}`} dir="auto">
                        {s.name} <span className="muted">{s.count}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
