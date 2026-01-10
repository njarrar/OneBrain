import Link from "next/link";
import { notFound } from "next/navigation";
import { displayTitle } from "@/components/ItemCard";
import { getItem, listCategoryNames } from "@/lib/queries";
import { addTags, removeTag, saveNote, setCategory, setStatus } from "@/lib/actions";
import { SOURCE_LABELS, shortDate } from "@/lib/links";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getItem(id);
  if (!data) notFound();
  const { item, saves, tags, files } = data;
  const categories = await listCategoryNames();
  // Posts often have no title, so their text is the main thing on the page.
  const heading = item.title ?? (item.body ? null : displayTitle(item));

  return (
    <article className="item">
      <div className="item-actions">
        {item.url && (
          <a className="btn" href={item.url} target="_blank" rel="noreferrer">Open original</a>
        )}
        {item.status !== "archived" ? (
          <form action={setStatus.bind(null, item.id, "archived")}><button className="btn quiet">Archive</button></form>
        ) : (
          <form action={setStatus.bind(null, item.id, "inbox")}><button className="btn quiet">Move to inbox</button></form>
        )}
        {item.status === "inbox" && (
          <form action={setStatus.bind(null, item.id, "read")}><button className="btn quiet">Mark read</button></form>
        )}
        {item.status === "read" && (
          <form action={setStatus.bind(null, item.id, "inbox")}><button className="btn quiet">Back to inbox</button></form>
        )}
      </div>

      {item.author && (
        <p className="who" dir="auto">
          {item.author} {item.author_handle && <span className="muted">{item.author_handle}</span>}
          {item.posted_at && <span className="muted"> · {shortDate(item.posted_at)}</span>}
        </p>
      )}
      {heading && <h1 className="item-title" dir="auto">{heading}</h1>}
      {item.summary && <p className="summary" dir="auto">{item.summary}</p>}
      {item.body && <div className={item.title ? "body" : "body lead-text"} dir="auto">{item.body}</div>}

      {(item.media.length > 0 || files.length > 0) && (
        <div className="media">
          {files.filter((f) => f.mime.startsWith("image/")).map((f) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={f.id} src={`/files/${f.id}`} alt={f.filename} loading="lazy" />
          ))}
          {item.media.map((m) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m} src={m} alt="" loading="lazy" referrerPolicy="no-referrer" />
          ))}
          {files.filter((f) => !f.mime.startsWith("image/")).map((f) => (
            <a key={f.id} href={`/files/${f.id}`} className="btn quiet">{f.filename}</a>
          ))}
        </div>
      )}

      <section className="panel">
        <h2>Saved</h2>
        <ul className="saves">
          {saves.map((s, i) => (
            <li key={i}>
              <span className="chip source">{SOURCE_LABELS[s.source_id] ?? s.name}</span>
              <span className="muted">
                {s.saved_at ? `Saved ${shortDate(s.saved_at)}` : `Added to Brain ${shortDate(s.created_at)}`}
              </span>
              {s.original_url && (
                <a href={s.original_url} target="_blank" rel="noreferrer" className="small">See it there</a>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Your note</h2>
        <form action={saveNote.bind(null, item.id)} className="note-form">
          <textarea id="note" name="note" rows={4} defaultValue={item.note ?? ""} placeholder="Why you saved this, what to do with it…" dir="auto" />
          <button className="btn">Save note</button>
        </form>
      </section>

      <section className="panel">
        <h2>Category and tags</h2>
        <form action={setCategory.bind(null, item.id)} className="inline-form">
          <select id="category" name="category" defaultValue={item.category ?? ""}>
            <option value="">No category</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn quiet">Set</button>
        </form>
        <div className="chips tag-list">
          {tags.map((t) => (
            <span key={t.name} className={t.added_by === "user" ? "chip" : "chip suggested"} title={t.added_by === "user" ? "Added by you" : "Suggested"}>
              <Link href={`/?view=all&tag=${encodeURIComponent(t.name)}`} dir="auto">{t.name}</Link>
              <form action={removeTag.bind(null, item.id, t.name)}>
                <button aria-label={`Remove ${t.name}`} className="chip-x">×</button>
              </form>
            </span>
          ))}
          {tags.length === 0 && <span className="muted">No tags yet.</span>}
        </div>
        <form action={addTags.bind(null, item.id)} className="inline-form">
          <input id="tags" name="tags" placeholder="Add tags, split with commas" dir="auto" />
          <button className="btn quiet">Add</button>
        </form>
      </section>
    </article>
  );
}
