"use client";

import { useActionState } from "react";
import { makePodcastNow } from "@/lib/actions";

// Makes a new episode now. The script and the voices take about a minute.
export function PodcastButton({ label }: { label: string }) {
  const [message, action, pending] = useActionState(async () => makePodcastNow(), null);
  return (
    <form action={action} className="digest-make">
      <button className="btn" disabled={pending}>{pending ? "Making it, about a minute…" : label}</button>
      {message && <p className="muted small" role="status">{message}</p>}
    </form>
  );
}
