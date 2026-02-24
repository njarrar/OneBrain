"use client";

import { useRef } from "react";
import { setCategory } from "@/lib/actions";

type Category = { name: string; color: string | null };

// The category pill on a card. Click it to move the item to another category.
export function CategoryPicker({ id, current, color, categories }: {
  id: string;
  current: string | null;
  color: string | null;
  categories: Category[];
}) {
  const box = useRef<HTMLDetailsElement>(null);
  const action = setCategory.bind(null, id);
  return (
    <details className="cat-pick" ref={box}>
      <summary className="cat-pill" style={{ "--cat": color ?? "var(--soft)" } as React.CSSProperties}>
        <i className="dot" aria-hidden="true" />
        <span dir="auto">{current ?? "No category"}</span>
      </summary>
      <div className="cat-menu" role="menu">
        <div className="cat-menu-label">Change category</div>
        {categories.map((c) => (
          <form key={c.name} action={action} onSubmit={() => box.current?.removeAttribute("open")}>
            <input type="hidden" name="category" value={c.name} />
            <button role="menuitem" className={c.name === current ? "on" : undefined}>
              <i className="dot" style={{ background: c.color ?? "var(--soft)" }} aria-hidden="true" />
              <span dir="auto">{c.name}</span>
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}
