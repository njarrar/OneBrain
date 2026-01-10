"use client";

import { useActionState } from "react";
import { addItem } from "@/lib/actions";

export function AddForm() {
  const [error, action, pending] = useActionState(addItem, null);
  return (
    <form action={action} className="add-form">
      <label htmlFor="url">Link</label>
      <input id="url" name="url" type="url" placeholder="https://" autoFocus />
      <label htmlFor="title">Title <span className="muted">(optional, filled in from the link)</span></label>
      <input id="title" name="title" dir="auto" />
      <label htmlFor="note">Note</label>
      <textarea id="note" name="note" rows={4} dir="auto" placeholder="A thought, a quote, why this matters…" />
      <label htmlFor="tags">Tags <span className="muted">(split with commas)</span></label>
      <input id="tags" name="tags" dir="auto" />
      <label htmlFor="file">Photo or file <span className="muted">(up to 10 MB)</span></label>
      <input id="file" name="file" type="file" />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
