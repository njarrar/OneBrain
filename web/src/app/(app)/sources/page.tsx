import Link from "next/link";
import { listSources } from "@/lib/queries";
import { shortDate } from "@/lib/links";

const STATUS: Record<string, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "ok" },
  import: { label: "Imported from file", tone: "warn" },
  not_connected: { label: "Not set up", tone: "off" },
  error: { label: "Needs attention", tone: "bad" },
};

const NEXT_STEP: Record<string, string> = {
  x: "Live sync with the X API comes in step 3.",
  youtube: "Playlist and liked video sync comes in step 3.",
  instagram: "Import your Instagram data file in step 5. New saves come from the iPhone share sheet.",
  photos: "The iPhone app reads your Screenshots album in step 4.",
  feedly: "An IFTTT rule sends each Feedly save here, set up in step 5.",
  manual: "Links, notes and photos you add yourself.",
};

export default async function SourcesPage() {
  const sources = await listSources();
  return (
    <div className="narrow">
      <header className="page-head"><h1>Sources</h1></header>
      <ul className="sources">
        {sources.map((s) => {
          const st = STATUS[s.status] ?? STATUS.not_connected;
          return (
            <li key={s.id} className="source-row">
              <div className="source-main">
                <Link href={`/?source=${s.id}`} className="source-name">{s.name}</Link>
                <span className={`pill ${st.tone}`}>{st.label}</span>
              </div>
              <p className="muted small">
                {s.items.toLocaleString()} items
                {s.last_sync_at && ` · last update ${shortDate(s.last_sync_at)}`}
              </p>
              {s.last_error && <p className="error small">{s.last_error}</p>}
              <p className="small">{NEXT_STEP[s.id]}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
