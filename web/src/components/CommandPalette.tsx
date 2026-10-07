"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { askBrain, paletteSearch, type Hit } from "@/lib/actions";

// ⌘K (or /) from anywhere: jump to a view, find an item by words or by meaning, or ask a
// question of everything you've saved. Arrow keys move, Enter opens, Esc closes.

type Row =
  | { kind: "go"; label: string; href: string; hint?: string }
  | { kind: "item"; hit: Hit; group: string }
  | { kind: "ask"; q: string };

const GO: { label: string; href: string; hint?: string }[] = [
  { label: "Inbox", href: "/" },
  { label: "Unread", href: "/?unread=1" },
  { label: "Resurface", href: "/resurface" },
  { label: "Weekly digest", href: "/digest" },
  { label: "All", href: "/?view=all" },
  { label: "Archive", href: "/?view=archived" },
  { label: "Trash", href: "/?view=trash" },
  { label: "Add something", href: "/add" },
  { label: "Sources", href: "/sources" },
];

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ words: Hit[]; meaning: Hit[] }>({ words: [], meaning: [] });
  const [answer, setAnswer] = useState<{ q: string; text: string | null; sources: Hit[]; error?: string } | null>(null);
  const [sel, setSel] = useState(0);
  const [searching, startSearch] = useTransition();
  const [asking, startAsk] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  // Open with ⌘K / Ctrl+K anywhere, or / when not typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("brain:palette", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("brain:palette", onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      input.current?.focus();
    } else {
      setQ("");
      setAnswer(null);
      setFound({ words: [], meaning: [] });
    }
  }, [open]);

  // Search as you type, a moment after you stop.
  useEffect(() => {
    const text = q.trim();
    setSel(0);
    if (!text) {
      setFound({ words: [], meaning: [] });
      return;
    }
    const t = setTimeout(
      () =>
        startSearch(async () => {
          try {
            setFound(await paletteSearch(text));
          } catch {
            setFound({ words: [], meaning: [] });
          }
        }),
      180,
    );
    return () => clearTimeout(t);
  }, [q]);

  const rows: Row[] = useMemo(() => {
    const text = q.trim().toLowerCase();
    const go = GO.filter((g) => !text || g.label.toLowerCase().includes(text)).map((g) => ({ kind: "go" as const, ...g }));
    if (!text) return go;
    return [
      { kind: "ask" as const, q: q.trim() },
      ...found.words.map((hit) => ({ kind: "item" as const, hit, group: "Matches" })),
      ...found.meaning.map((hit) => ({ kind: "item" as const, hit, group: "About the same thing" })),
      ...go,
    ];
  }, [q, found]);

  function run(row: Row | undefined) {
    if (!row) return;
    if (row.kind === "ask") {
      startAsk(async () => {
        try {
          const r = await askBrain(row.q);
          setAnswer({ q: row.q, text: r.answer, sources: r.sources, error: r.error });
        } catch {
          setAnswer({ q: row.q, text: null, sources: [], error: "Couldn't reach Brain. Try again." });
        }
      });
      return;
    }
    setOpen(false);
    router.push(row.kind === "go" ? row.href : `/item/${row.hit.id}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(rows.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(rows[sel]);
    }
  }

  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="palette-scrim" onMouseDown={() => setOpen(false)}>
      <div className="palette" role="dialog" aria-label="Search and commands" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" /><path d="m11 11 3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setAnswer(null);
            }}
            onKeyDown={onKeyDown}
            placeholder="Search, jump to, or ask anything you've saved…"
            dir="auto"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={`palette-row-${sel}`}
          />
          {(searching || asking) && <span className="spinner" aria-label="Loading" />}
          <kbd>esc</kbd>
        </div>

        {answer && (
          <section className="answer" aria-live="polite">
            <div className="answer-label">Brain · from your saves</div>
            <p dir="auto">
              {answer.error ??
                answer.text ??
                (answer.sources.length ? "Add an AI key in Settings to get written answers. These look closest:" : "Nothing found.")}
            </p>
            <ol className="answer-sources">
              {answer.sources.map((s, i) => (
                <li key={s.id}>
                  <button onClick={() => run({ kind: "item", hit: s, group: "" })}>
                    <span className="n">{i + 1}</span>
                    <span className="t" dir={s.rtl ? "rtl" : "auto"}>{s.title}</span>
                    <span className="d">{s.date}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        )}

        <ul className="palette-list" id="palette-list" role="listbox">
          {rows.map((row, i) => {
            const group = row.kind === "go" ? "Go to" : row.kind === "ask" ? "" : row.group;
            const head = group && group !== lastGroup ? <li key={`g${i}`} className="palette-group" role="presentation">{group}</li> : null;
            lastGroup = group || lastGroup;
            return [
              head,
              <li
                key={i}
                id={`palette-row-${i}`}
                role="option"
                aria-selected={i === sel}
                className={i === sel ? "palette-row on" : "palette-row"}
                onMouseEnter={() => setSel(i)}
                onClick={() => run(row)}
              >
                {row.kind === "ask" && (
                  <>
                    <span className="ico memory">✦</span>
                    <span className="t" dir="auto">Ask Brain: “{row.q}”</span>
                    <kbd>↵</kbd>
                  </>
                )}
                {row.kind === "go" && (
                  <>
                    <span className="ico">→</span>
                    <span className="t">{row.label}</span>
                    {row.hint && <kbd>{row.hint}</kbd>}
                  </>
                )}
                {row.kind === "item" && (
                  <>
                    <i className="dot" style={{ background: row.hit.color ?? "var(--soft)" }} aria-hidden="true" />
                    <span className="t" dir="auto">{row.hit.title}</span>
                    <span className="d">{row.hit.category ?? ""} · {row.hit.date}</span>
                  </>
                )}
              </li>,
            ];
          })}
          {q.trim() && !searching && !found.words.length && !found.meaning.length && (
            <li className="palette-empty">No matches by word or meaning. Try asking instead.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

/** A button that opens the palette, for the menu and the top bar. */
export function PaletteButton({ className = "palette-btn" }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event("brain:palette"))}>
      <span>Search or ask</span>
      <kbd>⌘K</kbd>
    </button>
  );
}
