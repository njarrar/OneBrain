"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import { setRead, setStatus } from "@/lib/actions";

// Keyboard keys for the list:
//   j / k   next / previous item (opens it in the reading pane in the List layout)
//   o, ↵    open the chosen item
//   e       archive it (or move it back to the inbox)
//   u       mark it unread (or read)
//   esc     close the reading pane
export function ListKeys({ closeHref }: { closeHref: string | null }) {
  const router = useRouter();
  const [, start] = useTransition();
  const at = useRef<number>(-1);

  useEffect(() => {
    const cards = () => [...document.querySelectorAll<HTMLElement>(".cards > .card[data-id]")];
    const mark = (list: HTMLElement[], i: number) => {
      list.forEach((c, n) => c.classList.toggle("key-focus", n === i));
      list[i]?.scrollIntoView({ block: "nearest" });
    };
    // Start from the item open in the pane, if any.
    const open = cards().findIndex((c) => c.getAttribute("aria-current") === "true");
    if (open >= 0) at.current = open;

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [contenteditable], dialog, .palette")) return;
      const list = cards();
      if (!list.length) return;
      const card = list[at.current];
      const inPane = (href: string | undefined) => !!href && href.includes("open=");
      switch (e.key) {
        case "j":
        case "k": {
          e.preventDefault();
          const next = Math.min(list.length - 1, Math.max(0, at.current + (e.key === "j" ? 1 : -1)));
          at.current = at.current < 0 ? 0 : next;
          mark(list, at.current);
          const href = list[at.current].dataset.href;
          if (inPane(href)) router.push(href!, { scroll: false });
          break;
        }
        case "o":
        case "Enter":
          // Enter on a focused link or button does its own thing.
          if (e.key === "Enter" && e.target !== document.body) break;
          if (card?.dataset.href) {
            e.preventDefault();
            router.push(card.dataset.href, { scroll: false });
          }
          break;
        case "e":
          if (card?.dataset.id) {
            e.preventDefault();
            const id = card.dataset.id;
            start(() => setStatus(id, card.dataset.archived ? "inbox" : "archived"));
          }
          break;
        case "u":
          if (card?.dataset.id) {
            e.preventDefault();
            const id = card.dataset.id;
            start(() => setRead(id, !!card.dataset.unread));
          }
          break;
        case "Escape":
          if (closeHref) router.push(closeHref, { scroll: false });
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, closeHref]);

  return null;
}
