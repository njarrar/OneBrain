import Link from "next/link";
import { displayTitle } from "@/components/ItemCard";
import { RemindMenu } from "@/components/RemindMenu";
import { MarkOpened } from "@/components/MarkOpened";
import { getItem } from "@/lib/items/service";
import { listCategoryNames } from "@/lib/queries";
import { acceptTag, addTags, purgeItem, readAgain, removeTag, restoreItem, saveNote, setCategory, setRead, setStatus, trashItem } from "@/lib/actions";
import { relatedItems } from "@/lib/memory/embed";
import { SOURCE_LABELS, shortDate } from "@/lib/links";
import { dayLabel, isAudioFile } from "@/lib/memory/read";

// One item in full. Used by the item page and by the reading pane beside the list.
// Opening an item marks it read, same as on the iPhone.
export async function ItemView({ id, pane = false }: { id: string; pane?: boolean }) {
  const data = await getItem(id);
  if (!data) return <p className="empty">This item is gone.</p>;
  const { item, saves, tags, files, textError } = data;
  const sounds = files.filter((f) => isAudioFile(f.mime, f.filename));
  const facts = item.facts;
  const trashed = !!item.deleted_at;
  const [categories, related] = await Promise.all([listCategoryNames(), trashed ? [] : relatedItems(id).catch(() => [])]);
  // Posts often have no title, so their text is the main thing on the page.
  const heading = item.title ?? (item.body ? null : displayTitle(item));

  return (
    <article className={pane ? "item in-pane" : "item"}>
      <MarkOpened key={item.id} id={item.id} unread={!trashed && !item.read_at} />
      {trashed && (
        <div className="item-actions trash-note">
          <span>In Trash since {shortDate(item.deleted_at)}.</span>
          <form action={restoreItem.bind(null, item.id)}><button className="btn">Restore</button></form>
          <form action={purgeItem.bind(null, item.id)}><button className="btn quiet danger">Delete forever</button></form>
        </div>
      )}
      <div className="item-actions">
        {item.url && (
          <a className="btn" href={item.url} target="_blank" rel="noreferrer">Open original</a>
        )}
        {pane && <Link className="btn quiet" href={`/item/${item.id}`}>Full page</Link>}
        {item.status !== "archived" ? (
          <form action={setStatus.bind(null, item.id, "archived")}><button className="btn quiet" title="Archive (e)">Archive</button></form>
        ) : (
          <form action={setStatus.bind(null, item.id, "inbox")}><button className="btn quiet">Move to inbox</button></form>
        )}
        {!trashed && (
          <form action={setRead.bind(null, item.id, false)}><button className="btn quiet" title="Mark unread (u)">Mark unread</button></form>
        )}
        {!trashed && <RemindMenu id={item.id} remindAt={item.remind_at} />}
        {!trashed && (
          <form action={trashItem.bind(null, item.id)}><button className="btn quiet danger">Delete</button></form>
        )}
      </div>

      {item.author && (
        <p className="who" dir="auto">
          {item.author} {item.author_handle && <span className="muted">{item.author_handle}</span>}
          {item.posted_at && <span className="muted"> · {shortDate(item.posted_at)}</span>}
        </p>
      )}
      {(item.category || item.subtopic) && (
        <p className="crumbs">
          {item.category && <Link href={`/?view=all&category=${encodeURIComponent(item.category)}`} dir="auto">{item.category}</Link>}
          {item.category && item.subtopic && <span aria-hidden="true"> › </span>}
          {item.subtopic && (
            <Link
              href={`/?view=all${item.category ? `&category=${encodeURIComponent(item.category)}` : ""}&subtopic=${encodeURIComponent(item.subtopic)}`}
              className="topic"
              dir="auto"
            >
              {item.subtopic}
            </Link>
          )}
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
          {sounds.map((f) => (
            f.mime.startsWith("video/")
              ? <video key={f.id} src={`/files/${f.id}`} controls preload="metadata" />
              : <audio key={f.id} src={`/files/${f.id}`} controls preload="metadata" />
          ))}
          {files.filter((f) => !f.mime.startsWith("image/")).map((f) => (
            <a key={f.id} href={`/files/${f.id}`} className="btn quiet">{f.filename}</a>
          ))}
        </div>
      )}

      {facts && (facts.dates.length > 0 || facts.people.length > 0) && (
        <section className="panel facts">
          <h2>What Brain found</h2>
          <ul>
            {facts.dates.map((d, i) => (
              <li key={`d${i}`} dir="auto">
                <strong>{d.person ? `${d.person}: ` : ""}{d.what}</strong> <span className="muted">{dayLabel(d.date)}{d.yearly ? ", every year" : ""}</span>
              </li>
            ))}
            {facts.people.map((p, i) => (
              <li key={`p${i}`} dir="auto"><strong>{p.name}</strong>{p.about && <span className="muted"> {p.about}</span>}</li>
            ))}
          </ul>
        </section>
      )}

      {(item.transcript || textError || sounds.length > 0) && (
        <section className="panel transcript">
          <h2>{sounds.length > 0 || item.kind === "audio" || item.kind === "video" ? "What was said" : "Text in the picture"}</h2>
          {item.transcript && <div className="body" dir="auto">{item.transcript}</div>}
          {!item.transcript && !textError && <p className="muted small">Brain is still listening to this one.</p>}
          {textError && <p className="error small">Brain couldn&apos;t read this: {textError}</p>}
          <form action={readAgain.bind(null, item.id)}><button className="btn quiet small">Read again</button></form>
        </section>
      )}

      {related.length > 0 && (
        <section className="panel related">
          <h2>Related in your Brain</h2>
          <ul>
            {related.map((r) => (
              <li key={r.id}>
                <Link href={`/item/${r.id}`}>
                  <i className="dot" style={{ background: r.category_color ?? "var(--soft)" }} aria-hidden="true" />
                  <span className="t" dir="auto">{displayTitle(r)}</span>
                  <span className="muted mono small">{shortDate(r.posted_at ?? r.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel">
        <h2>Your note</h2>
        <form action={saveNote.bind(null, item.id)} className="note-form">
          <textarea id={`note-${item.id}`} name="note" rows={4} defaultValue={item.note ?? ""} placeholder="Why you saved this, what to do with it…" dir="auto" aria-label="Your note" />
          <button className="btn">Save note</button>
        </form>
      </section>

      <section className="panel">
        <h2>Category and tags</h2>
        <form action={setCategory.bind(null, item.id)} className="inline-form">
          <select id={`category-${item.id}`} name="category" defaultValue={item.category ?? ""} aria-label="Category">
            <option value="">No category</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn quiet">Set</button>
        </form>
        <div className="chips tag-list">
          {tags.map((t) => (
            <span key={t.name} className={t.added_by === "user" ? "chip" : "chip suggested"} title={t.added_by === "user" ? "Added by you" : "Suggested by the AI"}>
              <Link href={`/?view=all&tag=${encodeURIComponent(t.name)}`} dir="auto">{t.name}</Link>
              {t.added_by !== "user" && (
                <form action={acceptTag.bind(null, item.id, t.name)}>
                  <button aria-label={`Keep ${t.name}`} className="chip-x" title="Keep this tag">✓</button>
                </form>
              )}
              <form action={removeTag.bind(null, item.id, t.name)}>
                <button aria-label={`Remove ${t.name}`} className="chip-x">×</button>
              </form>
            </span>
          ))}
          {tags.length === 0 && <span className="muted">No tags yet.</span>}
        </div>
        {tags.some((t) => t.added_by !== "user") && (
          <p className="muted small">Dashed tags are the AI&apos;s suggestions. Press ✓ to keep one.</p>
        )}
        <form action={addTags.bind(null, item.id)} className="inline-form">
          <input id={`tags-${item.id}`} name="tags" placeholder="Add tags, split with commas" dir="auto" aria-label="Add tags" />
          <button className="btn quiet">Add</button>
        </form>
      </section>

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
    </article>
  );
}
