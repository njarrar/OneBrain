"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { remindItem } from "@/lib/actions";

// "Remind me": pick when an item should come back in Resurface. Dates are worked out here,
// in your own time zone, at 9 in the morning.
function at9(daysAhead: number, months = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setDate(d.getDate() + daysAhead);
  d.setHours(9, 0, 0, 0);
  return d;
}

const PRESETS = [
  { label: "Tomorrow", date: () => at9(1) },
  { label: "This weekend", date: () => at9((6 - new Date().getDay() + 7) % 7 || 7) },
  { label: "Next week", date: () => at9(7) },
  { label: "Next month", date: () => at9(0, 1) },
];

export function RemindMenu({ id, remindAt }: { id: string; remindAt: string | null }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);

  // Close on a click outside or on Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const set = (d: Date | null) => {
    setOpen(false);
    start(() => remindItem(id, d ? d.toISOString() : null));
  };

  const when = remindAt ? new Date(remindAt).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : null;

  return (
    <div className="remind" ref={box}>
      <button type="button" className={when ? "btn quiet memory-on" : "btn quiet"} onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={pending} suppressHydrationWarning>
        {when ? `Remind ${when}` : "Remind me"}
      </button>
      {open && (
        <div className="remind-menu" role="menu">
          {PRESETS.map((p) => {
            const d = p.date();
            return (
              <button key={p.label} role="menuitem" onClick={() => set(d)}>
                <span>{p.label}</span>
                <span className="muted small">{d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span>
              </button>
            );
          })}
          <form
            className="remind-custom"
            onSubmit={(e) => {
              e.preventDefault();
              if (custom) set(new Date(`${custom}T09:00:00`));
            }}
          >
            <input type="date" value={custom} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setCustom(e.target.value)} aria-label="Pick a date" />
            <button className="btn small" disabled={!custom}>Set</button>
          </form>
          {when && (
            <button role="menuitem" className="danger" onClick={() => set(null)}>Remove reminder</button>
          )}
        </div>
      )}
    </div>
  );
}
