import Link from "next/link";
import { listSources } from "@/lib/queries";
import { shortDate } from "@/lib/links";
import { sorterReady, unsortedCount } from "@/lib/sorter";
import { hookKey } from "@/lib/settings";
import { env } from "@/lib/db";
import { listPlaylists, pickedPlaylists, youtubeConnected, type Playlist } from "@/lib/youtube";
import { xConnected } from "@/lib/x";
import { disconnectX, disconnectYouTube } from "@/lib/actions";
import { SortPanel } from "@/components/SortPanel";
import { CopyField, InstagramImport, XSync, YouTubePicker, YouTubeSync } from "@/components/SourceTools";

const STATUS: Record<string, { label: string; tone: string }> = {
  connected: { label: "Connected", tone: "ok" },
  import: { label: "Imported from file", tone: "warn" },
  not_connected: { label: "Not set up", tone: "off" },
  error: { label: "Needs attention", tone: "bad" },
};

export default async function SourcesPage() {
  const [sources, ready, unsorted, key, e, ytOn, xOn] = await Promise.all([
    listSources(), sorterReady(), unsortedCount(), hookKey(), env(), youtubeConnected(), xConnected(),
  ]);
  const base = e.BETTER_AUTH_URL ?? "http://localhost:3000";
  const feedlyHook = `${base}/api/ingest/feedly?key=${key}`;
  const googleReady = !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
  const xReady = !!(e.X_CLIENT_ID && e.X_CLIENT_SECRET);

  // Your playlists, for the picker. Until you pick, only liked videos come in.
  const picked = ytOn ? await pickedPlaylists() : null;
  let lists: Playlist[] = [];
  let listsError: string | null = null;
  if (ytOn) {
    try {
      lists = await listPlaylists();
    } catch (err) {
      listsError = err instanceof Error ? err.message : String(err);
    }
  }

  const extra: Record<string, React.ReactNode> = {
    feedly: (
      <details className="how">
        <summary>Set up Feedly</summary>
        <ol>
          <li>Open <a href="https://ifttt.com/create" target="_blank" rel="noreferrer">ifttt.com/create</a> and sign in.</li>
          <li>Click <b>If This</b>, pick <b>Feedly</b>, then <b>New article saved for later</b>. Connect your Feedly account.</li>
          <li>Click <b>Then That</b>, pick <b>Webhooks</b>, then <b>Make a web request</b>.</li>
          <li>URL: paste the link below. Method: <b>POST</b>. Content type: <b>application/json</b>.</li>
          <li>Body: paste the text below, then click <b>Create action</b> and <b>Finish</b>.</li>
        </ol>
        <CopyField label="Feedly link" value={feedlyHook} />
        <CopyField
          label="Body"
          value={'{"url":"{{EntryUrl}}","title":"{{EntryTitle}}","body":"{{EntryContent}}","author":"{{EntryAuthor}}","image":"{{EntryImageUrl}}","feed":"{{FeedTitle}}","published":"{{EntryPublished}}"}'}
        />
        <p className="small muted">Keep this link private. Anyone with it can add items to your Brain. IFTTT may ask for its Pro plan to use Webhooks.</p>
      </details>
    ),
    instagram: (
      <details className="how">
        <summary>Import your saved posts</summary>
        <ol>
          <li>Open <a href="https://accountscenter.instagram.com/info_and_permissions/dyi/" target="_blank" rel="noreferrer">Instagram&apos;s Download your information</a>.</li>
          <li>Click <b>Download or transfer information</b>, pick your account, then <b>Some of your information</b>.</li>
          <li>Tick <b>Saved</b> only, click <b>Next</b>, then <b>Download to device</b>.</li>
          <li>Set Date range to <b>All time</b>, Format to <b>JSON</b>, Media quality to <b>Low</b>, then <b>Create files</b>.</li>
          <li>When Instagram emails you, download the zip and pick it here.</li>
        </ol>
        <InstagramImport />
        <p className="small muted">Instagram gives only the link, the account and the date, not the picture or caption.</p>
      </details>
    ),
    x: xOn ? (
      <div className="inline-actions">
        <XSync />
        <form action={disconnectX}><button className="link-btn">Disconnect</button></form>
      </div>
    ) : xReady ? (
      <a className="btn small" href="/api/x/connect" style={{ alignSelf: "flex-start" }}>Connect X</a>
    ) : (
      <p className="small muted">Needs the X keys first.</p>
    ),
    youtube: ytOn ? (
      <>
        <div className="inline-actions">
          <YouTubeSync />
          <form action={disconnectYouTube}><button className="link-btn">Disconnect</button></form>
        </div>
        <details className="how" open={!picked}>
          <summary>Pick what to bring in</summary>
          {!picked && <p className="small muted">Only liked videos come in until you pick.</p>}
          {listsError && <p className="error small">{listsError}</p>}
          <YouTubePicker lists={lists} picked={picked ?? ["liked"]} />
        </details>
      </>
    ) : googleReady ? (
      <a className="btn small" href="/api/youtube/connect" style={{ alignSelf: "flex-start" }}>Connect YouTube</a>
    ) : (
      <p className="small muted">Needs the Google keys first.</p>
    ),
  };

  const NEXT: Record<string, string> = {
    x: "Brings in your newest bookmarks from X, then checks again every six hours.",
    youtube: "Brings in the lists you pick, then checks again every six hours.",
    instagram: "",
    photos: "The iPhone app will read your Screenshots album.",
    feedly: "Each article you save for later in Feedly arrives here through IFTTT.",
    manual: "Links, notes and photos you add yourself.",
  };

  return (
    <div className="narrow">
      <header className="page-head"><h1>Sources</h1></header>
      <SortPanel ready={ready} remaining={unsorted} />
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
                {s.items.toLocaleString()} {s.items === 1 ? "item" : "items"}
                {s.last_sync_at && ` · last update ${shortDate(s.last_sync_at)}`}
              </p>
              {s.last_error && <p className="error small">{s.last_error}</p>}
              {NEXT[s.id] && <p className="small">{NEXT[s.id]}</p>}
              {extra[s.id]}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
