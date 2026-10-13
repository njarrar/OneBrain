"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addOne } from "@/lib/actions";

// The Add page, like the iPhone's Add sheet: pick what you're adding (a link, a note, a voice
// memo, pictures or a file), add words and tags if you like, and the AI sorts it after you save.

type Kind = "link" | "note" | "voice" | "picture" | "file";

const KINDS: { id: Kind; label: string; icon: string }[] = [
  { id: "link", label: "Link", icon: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" },
  { id: "note", label: "Note", icon: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" },
  { id: "voice", label: "Voice memo", icon: "M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3" },
  { id: "picture", label: "Pictures", icon: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01" },
  { id: "file", label: "File", icon: "M14 3H6v18h12V7zM14 3v4h4" },
];

const MAX_PICTURES = 10;
const MAX_BYTES = 20 * 1024 * 1024;

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Records from the microphone in the browser and hands back the recording as a file. */
function Recorder({ audio, onAudio }: { audio: File | null; onAudio: (f: File | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const url = useMemo(() => (audio ? URL.createObjectURL(audio) : null), [audio]);

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => rec.current?.stream.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const parts: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && parts.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const mime = (r.mimeType || "audio/webm").split(";")[0];
        const ext = mime.includes("mp4") ? "m4a" : "webm";
        const stamp = new Date().toISOString().slice(0, 16).replace("T", " ").replace(":", ".");
        onAudio(new File(parts, `Voice memo ${stamp}.${ext}`, { type: mime }));
      };
      r.start();
      rec.current = r;
      setSeconds(0);
      setRecording(true);
    } catch {
      setError("Brain can't use the microphone. Allow it in the browser, or pick a recording below.");
    }
  }

  function stop() {
    rec.current?.stop();
    rec.current = null;
    setRecording(false);
  }

  return (
    <div className="add-voice">
      {recording ? (
        <button type="button" className="add-rec on" onClick={stop}>
          <span className="dot" /> Stop · {clock(seconds)}
        </button>
      ) : (
        <button type="button" className="add-rec" onClick={start}>
          <Icon d={KINDS[2].icon} /> {audio ? "Record again" : "Record"}
        </button>
      )}
      {url && !recording && (
        <div className="add-audio-preview">
          <audio controls src={url} />
          <button type="button" className="link-btn" onClick={() => onAudio(null)}>Remove</button>
        </div>
      )}
      {error && <p className="small muted">{error}</p>}
      <label className="add-pick">
        Or pick a recording
        <input type="file" accept="audio/*,video/*,.m4a,.mp3,.wav,.aac,.ogg,.opus,.webm" onChange={(e) => onAudio(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  );
}

export function AddForm() {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>("link");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [sort, setSort] = useState(true);
  const [audio, setAudio] = useState<File | null>(null);
  const [pictures, setPictures] = useState<File[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const previews = useMemo(() => pictures.map((p) => URL.createObjectURL(p)), [pictures]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function addPictures(list: FileList | File[] | null) {
    const picked = Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    setPictures((p) => [...p, ...picked].slice(0, MAX_PICTURES));
  }

  function paste(e: React.ClipboardEvent) {
    const pasted = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!pasted.length) return;
    e.preventDefault();
    setKind("picture");
    setError(null);
    addPictures(pasted);
  }

  // What gets sent, one save per entry.
  function files(): (File | null)[] {
    if (kind === "voice") return [audio];
    if (kind === "picture") return pictures;
    if (kind === "file") return [file];
    return [null];
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const list = files();
    if (kind === "link" && !url.trim()) return setError("Paste a link.");
    if (kind === "note" && !note.trim()) return setError("Write a note.");
    if (kind === "voice" && !audio) return setError("Record a voice memo or pick a recording.");
    if (kind === "picture" && !pictures.length) return setError("Pick at least one picture.");
    if (kind === "file" && !file) return setError("Pick a file.");
    if (list.some((f) => f && f.size > MAX_BYTES)) return setError("Each file needs to be 20 MB or less.");

    start(async () => {
      const ids: string[] = [];
      for (const [n, f] of list.entries()) {
        if (list.length > 1) setProgress(`Saving ${n + 1} of ${list.length}…`);
        const form = new FormData();
        if (kind === "link") form.set("url", url.trim());
        if (kind === "link") form.set("title", title);
        // A voice memo with no note is named after its recording, not "Untitled".
        else if (kind === "voice" && f && !note.trim()) form.set("title", f.name.replace(/\.[^.]+$/, ""));
        form.set("note", note);
        form.set("tags", tags);
        form.set("sort", sort ? "on" : "off");
        if (f) form.set("file", f);
        try {
          const r = await addOne(form);
          if (r.error) {
            setError(list.length > 1 ? `Picture ${n + 1}: ${r.error}` : r.error);
            break;
          }
          if (r.id) ids.push(r.id);
        } catch {
          setError("Couldn't reach Brain. Try again.");
          break;
        }
      }
      setProgress(null);
      if (ids.length === list.length) {
        router.push(ids.length === 1 ? `/item/${ids[0]}` : "/?view=all");
      } else if (kind === "picture" && ids.length > 0) {
        setPictures((p) => p.slice(ids.length));
      }
    });
  }

  return (
    <form onSubmit={save} onPaste={paste} className="add-form">
      <div className="add-kinds" role="tablist" aria-label="What are you adding?">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={kind === k.id}
            className={`add-kind${kind === k.id ? " on" : ""}`}
            onClick={() => { setKind(k.id); setError(null); }}
          >
            <Icon d={k.icon} /> {k.label}
          </button>
        ))}
      </div>

      {kind === "link" && (
        <>
          <label htmlFor="url">Link</label>
          <input id="url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" autoFocus />
          <label htmlFor="title">Title <span className="muted">(optional, filled in from the link)</span></label>
          <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} dir="auto" />
        </>
      )}

      {kind === "voice" && <Recorder audio={audio} onAudio={setAudio} />}

      {kind === "picture" && (
        <div className="add-pictures">
          <div className="add-thumbs">
            {previews.map((u, i) => (
              <div key={u} className="add-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {pictures[i].type.startsWith("video/") ? <video src={u} muted /> : <img src={u} alt="" />}
                <button type="button" className="chip-x" aria-label="Remove" onClick={() => setPictures((p) => p.filter((_, n) => n !== i))}>×</button>
              </div>
            ))}
            {pictures.length < MAX_PICTURES && (
              <label className="add-thumb add-more">
                <Icon d={KINDS[3].icon} />
                <span>{pictures.length ? "Add more" : "Choose pictures"}</span>
                <input type="file" accept="image/*,video/*" multiple onChange={(e) => { addPictures(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
          <p className="small muted">Up to {MAX_PICTURES}, each its own save. Brain reads the text in each one.</p>
        </div>
      )}

      {kind === "file" && (
        <>
          <label htmlFor="file">File <span className="muted">(up to 20 MB)</span></label>
          <input id="file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </>
      )}

      <label htmlFor="note">Note {kind !== "note" && <span className="muted">(optional)</span>}</label>
      <textarea
        id="note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={kind === "note" ? 8 : 3}
        dir="auto"
        autoFocus={kind === "note"}
        placeholder={kind === "note" ? "A thought, a name, a birthday, a quote…" : "Why this matters, who it's for…"}
      />

      <label htmlFor="tags">Tags <span className="muted">(optional, split with commas)</span></label>
      <input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} dir="auto" placeholder="Family, Gift ideas" />

      <label className="add-sort">
        <input type="checkbox" checked={sort} onChange={(e) => setSort(e.target.checked)} />
        <span><b>Let AI sort</b> <span className="muted">picks the category, summary and tags</span></span>
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn" disabled={pending}>{pending ? (progress ?? "Saving…") : kind === "picture" && pictures.length > 1 ? `Save ${pictures.length}` : "Save"}</button>
    </form>
  );
}
