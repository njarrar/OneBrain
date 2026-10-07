"use client";

import { useState } from "react";
import { sortNext } from "@/lib/actions";

// Sorts everything still unsorted, one batch at a time, and shows progress.
export function SortPanel({ ready, remaining: start, ai }: { ready: boolean; remaining: number; ai: string }) {
  const [remaining, setRemaining] = useState(start);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      for (;;) {
        const r = await sortNext();
        setRemaining(r.remaining);
        setDone((n) => n + r.sorted);
        if (r.error) { setError(r.error); break; }
        if (r.sorted === 0 || r.remaining === 0) break;
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="source-row">
      <div className="source-main">
        <span className="source-name">Sorting</span>
        <span className={`pill ${!ready ? "off" : remaining ? "warn" : "ok"}`}>
          {!ready ? `Needs a ${ai} key` : remaining ? `${remaining.toLocaleString()} unsorted` : "All sorted"}
        </span>
      </div>
      <p className="small muted">
        {ai} gives each item a category, sub-topic, one-line summary and tags. New items are sorted as they arrive.
      </p>
      {ready && remaining > 0 && (
        <button className="btn small" onClick={run} disabled={running} style={{ alignSelf: "flex-start" }}>
          {running ? `Sorting… ${done.toLocaleString()} done` : "Sort now"}
        </button>
      )}
      {!running && done > 0 && <p className="small">Sorted {done.toLocaleString()} items.</p>}
      {error && <p className="error small">{error}</p>}
    </section>
  );
}
