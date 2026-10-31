import Link from "next/link";
import { PodcastButton } from "@/components/PodcastButton";
import { displayTitle } from "@/components/ItemCard";
import { HOSTS, listPodcasts } from "@/lib/memory/podcast";
import { removePodcast } from "@/lib/actions";
import { shortDate } from "@/lib/links";

export const metadata = { title: "Podcast · Brain" };

const length = (s: number | null) => (s ? `about ${Math.max(1, Math.round(s / 60))} min` : "");

// Two hosts talk through the last thirty days of what you kept, and push back on each other.
export default async function PodcastPage() {
  const episodes = await listPodcasts(6);
  return (
    <div className="narrow digest-page podcast-page">
      <header className="page-head">
        <h1>Podcast</h1>
        <PodcastButton label={episodes.length ? "Make a new one" : "Make"} />
      </header>
      <p className="muted small">
        {HOSTS.A.name} and {HOSTS.B.name} talk through the last thirty days of what you saved and kept, and push back on each other.
        Your AI writes it; the voices come from Workers AI.
      </p>
      {episodes.length === 0 && <p className="empty">No episode yet. Press Make and wait about a minute.</p>}
      {episodes.map((p, n) => (
        <section key={p.id} className="panel digest">
          <h2 dir="auto">
            {p.title} <span className="muted">· {shortDate(p.from_day)} to {shortDate(p.to_day)} {length(p.seconds) && `· ${length(p.seconds)}`}</span>
          </h2>
          <audio controls preload={n === 0 ? "metadata" : "none"} src={`/api/app/podcast/${p.id}/audio`} className="podcast-audio" />
          <details>
            <summary className="small">Read the script</summary>
            {p.lines.map((l, i) => (
              <p key={i} dir="auto"><b>{l.host === "A" ? HOSTS.A.name : HOSTS.B.name}:</b> {l.text}</p>
            ))}
          </details>
          {p.items.length > 0 && (
            <details>
              <summary className="small">The {p.items.length} saves it covers</summary>
              <ul className="podcast-items">
                {p.items.map((i) => <li key={i.id}><Link href={`/item/${i.id}`} dir="auto">{displayTitle(i)}</Link></li>)}
              </ul>
            </details>
          )}
          <form action={removePodcast.bind(null, p.id)}>
            <button className="btn quiet small danger">Delete</button>
          </form>
        </section>
      ))}
    </div>
  );
}
