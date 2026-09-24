"use client";

import { useState } from "react";
import { readNext } from "@/lib/actions";

// Hears voice memos and reads pictures and notes not read yet, one batch at a time.
export function ReadPanel({ ready, remaining: start }: { ready: boolean; remaining: number }) {
  const [remaining, setRemaining] = useState(start);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      for (;;) {
        const r = await readNext();
        setRemaining(r.remaining);
        setDone((n) => n + r.read);
        if (r.error) { setError(r.error); break; }
        if (r.read === 0 || r.remaining === 0) break;
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="source-row">
      <div className="source-main">
        <span className="source-name">Voice memos, pictures and notes</span>
        <span className={`pill ${!ready ? "off" : remaining ? "warn" : "ok"}`}>
          {!ready ? "Needs API key" : remaining ? `${remaining.toLocaleString()} to read` : "All read"}
        </span>
      </div>
      <p className="small muted">
        Brain writes out what was said in voice memos and videos and the text in screenshots, then Claude picks out the people,
        dates and events, so Ask Brain can answer things like &ldquo;when is Sara&apos;s birthday?&rdquo;. New saves are read as they arrive.
      </p>
      {ready && remaining > 0 && (
        <button className="btn small" onClick={run} disabled={running} style={{ alignSelf: "flex-start" }}>
          {running ? `Reading… ${done.toLocaleString()} done` : "Read now"}
        </button>
      )}
      {!running && done > 0 && <p className="small">Read {done.toLocaleString()} saves.</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
