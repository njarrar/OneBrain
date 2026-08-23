"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { reviewCard } from "@/lib/actions";
import { shortDate } from "@/lib/links";

export type Card = {
  id: string;
  reason: "reminder" | "on_this_day";
  title: string | null;
  body: string | null;
  summary: string | null;
  note: string | null;
  url: string | null;
  author: string | null;
  category: string | null;
  color: string | null;
  date: string;
  picture: string | null;
  rtl: boolean;
  sensitive: boolean;
};

const ANSWERS = [
  { how: "done", label: "Done", hint: "Don't show again", key: "1" },
  { how: "later", label: "Tomorrow", hint: "Ask me tomorrow", key: "2" },
  { how: "keep", label: "Keep", hint: "Bring it back later, spaced out", key: "3" },
] as const;

// One card at a time. Answering moves on at once; if saving fails, the card comes back.
export function ResurfaceDeck({ cards: initial }: { cards: Card[] }) {
  const [cards, setCards] = useState(initial);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const card = cards[0];
  const total = initial.length;
  const answerRef = useRef<(how: (typeof ANSWERS)[number]["how"]) => void>(() => {});

  // Keys 1, 2 and 3 answer the card on top, unless you're typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]")) return;
      const a = ANSWERS.find((x) => x.key === e.key);
      if (a) answerRef.current(a.how);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function answer(how: (typeof ANSWERS)[number]["how"]) {
    if (!card) return;
    setCards((c) => c.slice(1));
    setDone((d) => d + 1);
    setError(null);
    start(async () => {
      try {
        await reviewCard(card.id, how);
      } catch {
        setCards((c) => [card, ...c]);
        setDone((d) => d - 1);
        setError("Couldn't save that. Try again.");
      }
    });
  }

  answerRef.current = answer;

  if (!card) {
    return (
      <div className="resurface-empty">
        <div className="big memory" aria-hidden="true">✦</div>
        <h2>{done ? "That's today's set." : "Nothing to resurface today."}</h2>
        <p className="muted">Use “Remind me” on any item to have it come back here.</p>
        <Link href="/" className="btn quiet">Back to inbox</Link>
      </div>
    );
  }

  const text = card.title ?? card.body ?? card.url ?? "Untitled";
  return (
    <div className="deck">
      <div className="deck-progress" aria-label={`${done} of ${total} done`}>
        {Array.from({ length: total }, (_, i) => <span key={i} className={i < done ? "on" : ""} />)}
      </div>

      <article className="deck-card" key={card.id} style={{ ["--cat" as string]: card.color ?? "var(--line)" }}>
        <span className="reason">
          {card.reason === "reminder" ? "You asked to see this again" : `From this day, ${shortDate(card.date)}`}
        </span>
        {card.author && <p className="who" dir="auto">{card.author}</p>}
        <Link href={`/item/${card.id}`} className={card.rtl ? "deck-text rtl" : "deck-text"} dir="auto">{text}</Link>
        {card.summary && <p className="insight" dir="auto">{card.summary}</p>}
        {card.picture && !card.sensitive && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.picture} alt="" className="deck-pic" referrerPolicy="no-referrer" />
        )}
        {card.note && <p className="card-note" dir="auto">{card.note}</p>}
        <div className="deck-meta">
          {card.category && <span className="chip"><i className="dot" style={{ background: card.color ?? "var(--soft)" }} />{card.category}</span>}
          {card.url && <a href={card.url} target="_blank" rel="noreferrer" className="small">Open original ↗</a>}
        </div>
      </article>

      <div className="deck-answers">
        {ANSWERS.map((a) => (
          <button key={a.how} className={a.how === "keep" ? "btn memory-btn" : "btn quiet"} onClick={() => answer(a.how)} title={a.hint}>
            {a.label} <kbd>{a.key}</kbd>
          </button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
