"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { pileCall, pileMore, pileWhy } from "@/lib/actions";
import type { PileCard } from "@/lib/memory/pile";
import { shortDate } from "@/lib/links";

type How = "done" | "letgo" | "snooze";
type Why = "use" | "learn" | "buy" | "someone" | "idea";

const CALLS: { how: How; label: string; key: string; hint: string }[] = [
  { how: "done", label: "Keep", key: "d", hint: "Keep it: it moves to the Archive" },
  { how: "letgo", label: "Let go", key: "x", hint: "It goes to Trash" },
  { how: "snooze", label: "Snooze", key: "s", hint: "Back in the pile in two weeks" },
];

const WHYS: { why: Why; label: string; key: string }[] = [
  { why: "use", label: "To use", key: "1" },
  { why: "learn", label: "To learn", key: "2" },
  { why: "buy", label: "To buy", key: "3" },
  { why: "someone", label: "For someone", key: "4" },
  { why: "idea", label: "An idea", key: "5" },
];

const SAID: Record<How, string> = { done: "Kept", letgo: "Let go", snooze: "Snoozed" };

// One save at a time. A call moves on at once and saves behind you; if saving fails, the card comes back.
export function PileDeck({ initial, left: startLeft }: { initial: PileCard[]; left: number }) {
  const [cards, setCards] = useState(initial);
  const [left, setLeft] = useState(startLeft);
  const [cleared, setCleared] = useState(0);
  const [history, setHistory] = useState<{ card: PileCard; how: How }[]>([]);
  const [why, setWhy] = useState<{ id: string; picked: Why | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef<string[]>([]);
  const loading = useRef(false);
  const card = cards[0];

  // Fetch more before the screen runs out.
  useEffect(() => {
    if (cards.length >= 6 || left <= cards.length || loading.current) return;
    loading.current = true;
    pileMore([...cards.map((c) => c.id), ...handled.current.slice(-60)])
      .then((r) => {
        setCards((cur) => {
          const have = new Set(cur.map((c) => c.id));
          return [...cur, ...r.cards.filter((c) => !have.has(c.id))];
        });
      })
      .catch(() => setError("Couldn't load more. Reload the page."))
      .finally(() => (loading.current = false));
  }, [cards, left]);

  function call(how: How) {
    if (!card) return;
    setCards((c) => c.slice(1));
    setLeft((n) => Math.max(0, n - 1));
    setCleared((n) => n + 1);
    setHistory((h) => [...h.slice(-19), { card, how }]);
    setWhy(how === "done" ? { id: card.id, picked: null } : null);
    setError(null);
    handled.current.push(card.id);
    pileCall(card.id, how).catch(() => {
      setCards((c) => [card, ...c.filter((x) => x.id !== card.id)]);
      setLeft((n) => n + 1);
      setCleared((n) => n - 1);
      setError("Couldn't save that. Try again.");
    });
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setCards((c) => [last.card, ...c.filter((x) => x.id !== last.card.id)]);
    setLeft((n) => n + 1);
    setCleared((n) => Math.max(0, n - 1));
    setWhy(null);
    pileCall(last.card.id, "undo").catch(() => setError("Couldn't take that back. Try again."));
  }

  function pickWhy(w: Why) {
    if (!why) return;
    const picked = why.picked === w ? null : w;
    setWhy({ id: why.id, picked });
    pileWhy(why.id, picked).catch(() => setError("Couldn't save the reason."));
  }

  const keys = useRef({ call, undo, pickWhy });
  keys.current = { call, undo, pickWhy };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
      const k = e.key.toLowerCase();
      const c = CALLS.find((x) => x.key === k);
      if (c) keys.current.call(c.how);
      else if (k === "u") keys.current.undo();
      else {
        const w = WHYS.find((x) => x.key === k);
        if (w) keys.current.pickWhy(w.why);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const last = history[history.length - 1];
  const bar = (
    <div className="pile-bar">
      <span className="pile-left"><b>{left.toLocaleString()}</b> left</span>
      {cleared > 0 && <span className="muted small">{cleared.toLocaleString()} cleared this time</span>}
      <button className="btn quiet small" onClick={undo} disabled={!last} title="Take the last call back">
        Undo <kbd>u</kbd>
      </button>
    </div>
  );

  const whyRow = why && (
    <div className="pile-why" role="group" aria-label="Why did you keep it?">
      <span className="muted small">Why did you keep it?</span>
      {WHYS.map((w) => (
        <button key={w.why} className={why.picked === w.why ? "chip on" : "chip"} onClick={() => pickWhy(w.why)}>
          {w.label} <kbd>{w.key}</kbd>
        </button>
      ))}
    </div>
  );

  if (!card) {
    return (
      <div className="deck">
        {bar}
        {whyRow}
        <div className="resurface-empty">
          <div className="big memory" aria-hidden="true">0</div>
          <h2>{cleared ? "Nothing left. The pile is clear." : "The pile is clear."}</h2>
          <p className="muted">New saves land here. Snoozed ones come back in two weeks.</p>
          <Link href="/" className="btn quiet">Back to inbox</Link>
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="deck">
      {bar}
      {whyRow}
      {last && !why && <p className="muted small">{SAID[last.how]}.</p>}

      <article className="deck-card" key={card.id} style={{ ["--cat" as string]: card.color ?? "var(--line)" }}>
        <span className="reason">{card.from} · {shortDate(card.date)}</span>
        {card.author && <p className="who" dir="auto">{card.author}</p>}
        <Link href={`/item/${card.id}`} className={card.rtl ? "deck-text rtl" : "deck-text"} dir="auto">{card.text}</Link>
        {card.summary && <p className="insight" dir="auto">{card.summary}</p>}
        {card.picture && !card.sensitive && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.picture} alt="" className="deck-pic" referrerPolicy="no-referrer" />
        )}
        <div className="deck-meta">
          {card.category && <span className="chip"><i className="dot" style={{ background: card.color ?? "var(--soft)" }} />{card.category}</span>}
          {card.url && <a href={card.url} target="_blank" rel="noreferrer" className="small">Open original ↗</a>}
        </div>
      </article>

      <div className="deck-answers">
        {CALLS.map((c) => (
          <button key={c.how} className={c.how === "done" ? "btn memory-btn" : "btn quiet"} onClick={() => call(c.how)} title={c.hint}>
            {c.label} <kbd>{c.key}</kbd>
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
