"use client";

import { useEffect, useState } from "react";
import { BUILD } from "@/lib/version";

// "Brain 0.2.0 · a087d18 · deployed 28 Sep 2026, 21:24", in the reader's own time zone.
// The time fills in after load so the server and the browser never disagree about it.
export function BuildInfo() {
  const [when, setWhen] = useState<string | null>(null);
  useEffect(() => {
    if (!BUILD.builtAt) return;
    const d = new Date(BUILD.builtAt);
    setWhen(d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
  }, []);
  return (
    <footer className="build-info" title={BUILD.builtAt ?? undefined}>
      Brain {BUILD.version} · {BUILD.commit}
      {when && <> · deployed {when}</>}
    </footer>
  );
}
