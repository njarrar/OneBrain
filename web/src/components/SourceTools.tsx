"use client";

import { useActionState, useState, useTransition } from "react";
import {
  importInstagramFile, pickYouTubePlaylists, syncXNow, syncYouTubeNow,
} from "@/lib/actions";

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className="btn small quiet"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function InstagramImport() {
  const [message, action, pending] = useActionState(importInstagramFile, null);
  return (
    <form action={action} className="inline-form">
      <input type="file" name="file" accept=".json,.zip,application/json,application/zip" aria-label="Instagram data file" />
      <button className="btn small" disabled={pending}>{pending ? "Reading…" : "Import"}</button>
      {message && <p className="small" role="status">{message}</p>}
    </form>
  );
}

function SyncButton({ sync }: { sync: () => Promise<string> }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="inline-actions">
      <button className="btn small" disabled={pending} onClick={() => start(async () => setMessage(await sync()))}>
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {message && <span className="small" role="status">{message}</span>}
    </div>
  );
}

export const YouTubeSync = () => <SyncButton sync={syncYouTubeNow} />;
export const XSync = () => <SyncButton sync={syncXNow} />;

export function YouTubePicker({ lists, picked }: { lists: { id: string; title: string; count: number }[]; picked: string[] }) {
  const [message, action, pending] = useActionState(pickYouTubePlaylists, null);
  const rows = [{ id: "liked", title: "Liked videos", count: null as number | null }, ...lists];
  return (
    <form action={action} className="pick-list">
      {rows.map((l) => (
        <label key={l.id} className="pick">
          <input type="checkbox" name="pick" value={l.id} defaultChecked={picked.includes(l.id)} />
          <span>{l.title}</span>
          {l.count !== null && <span className="muted small">{l.count.toLocaleString()} {l.count === 1 ? "video" : "videos"}</span>}
        </label>
      ))}
      <div className="inline-actions">
        <button className="btn small" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {message && <span className="small" role="status">{message}</span>}
      </div>
    </form>
  );
}

