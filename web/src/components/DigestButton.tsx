"use client";

import { useActionState } from "react";
import { makeDigestNow } from "@/lib/actions";

// Asks the AI for this week's digest now instead of waiting for Sunday evening.
export function DigestButton({ label }: { label: string }) {
  const [message, action, pending] = useActionState(async () => makeDigestNow(), null);
  return (
    <form action={action} className="digest-make">
      <button className="btn quiet" disabled={pending}>{pending ? "Writing…" : label}</button>
      {message && <p className="muted small" role="status">{message}</p>}
    </form>
  );
}
