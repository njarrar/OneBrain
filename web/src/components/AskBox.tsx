"use client";

import Link from "next/link";
import { Fragment, useEffect, useRef, useState, useTransition } from "react";
import { askBrain, type Hit } from "@/lib/actions";

const EXAMPLES = [
  "What gift should I get my colleague's kids?",
  "Whose birthday is coming up this month?",
  "What did I save about places to visit in Tunis?",
  "What did my landlord email me about the lease?",
];

type Result = { q: string; text: string | null; sources: Hit[]; searched: string[]; error?: string };

// "[2]" marks in the answer become links to the saves they cite.
function Cited({ text, sources }: { text: string; sources: Hit[] }) {
  return (
    <>
      {text.split(/(\[\d+\])/g).map((p, i) => {
        const m = p.match(/^\[(\d+)\]$/);
        const s = m ? sources[Number(m[1]) - 1] : null;
        if (!m || !s) return <Fragment key={i}>{p}</Fragment>;
        return <Link key={i} href={`/item/${s.id}`} className="cite" title={s.title}>{m[1]}</Link>;
      })}
    </>
  );
}

export function AskBox({ initial }: { initial: string }) {
  const [q, setQ] = useState(initial);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, start] = useTransition();
  const field = useRef<HTMLTextAreaElement>(null);

  function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    setQ(text);
    start(async () => {
      try {
        const r = await askBrain(text);
        setResult({ q: text, text: r.answer, sources: r.sources, searched: r.searched ?? [], error: r.error });
      } catch {
        setResult({ q: text, text: null, sources: [], searched: [], error: "Couldn't reach Brain. Try again." });
      }
    });
  }

  useEffect(() => {
    if (initial) ask(initial);
    else field.current?.focus();
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ask-box">
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="ask-form">
        <textarea
          ref={field}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(q);
            }
          }}
          rows={2}
          maxLength={500}
          dir="auto"
          placeholder="Ask anything you've saved, in English or Arabic…"
          aria-label="Your question"
        />
        <button className="btn memory-btn" disabled={pending || !q.trim()}>{pending ? "Thinking…" : "Ask"}</button>
      </form>

      {!result && !pending && (
        <div className="ask-examples">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" className="chip" onClick={() => ask(e)}>{e}</button>
          ))}
        </div>
      )}

      {pending && <p className="small muted" role="status">Looking through your saves and linking them up…</p>}

      {result && !pending && (
        <section className="answer ask-answer" aria-live="polite">
          <div className="answer-label">Brain · from your saves</div>
          <p dir="auto">
            {result.error ??
              (result.text ? <Cited text={result.text} sources={result.sources} /> : null) ??
              (result.sources.length ? "Add an AI key in Settings to get written answers. These look closest:" : "Nothing found.")}
          </p>
          {result.searched.length > 0 && (
            <p className="small muted ask-searched">Looked for: {result.searched.join(" · ")}</p>
          )}
          <ol className="answer-sources">
            {result.sources.map((s, i) => (
              <li key={s.id}>
                <Link href={`/item/${s.id}`}>
                  <span className="n">{i + 1}</span>
                  <span className="t" dir={s.rtl ? "rtl" : "auto"}>{s.title}</span>
                  <span className="d">{s.from} · {s.date}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

/** The Ask Brain button for the menu and the top bar. */
export function AskButton({ className = "btn small memory-btn" }: { className?: string }) {
  return <Link href="/ask" className={className} aria-label="Ask Brain">✦ Ask</Link>;
}
