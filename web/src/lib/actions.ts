"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { idForKey, noteKey, sha256Hex, urlKey } from "@/lib/canonical";
import { db, env, first, now, run } from "@/lib/db";
import { getAuth } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { unfurl } from "@/lib/unfurl";
import { sortItems, unsortedCount } from "@/lib/sorter";
import { importInstagram } from "@/lib/instagram";
import { disconnect as disconnectYT, setPickedPlaylists, syncYouTube } from "@/lib/youtube";
import { disconnect as disconnectXApi, syncX } from "@/lib/x";
import { setAnthropicKey } from "@/lib/secrets";
import { isDesign, isMode, savePrefs } from "@/lib/theme";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function logout() {
  await (await getAuth()).api.signOut({ headers: await headers() });
  redirect("/login");
}

// Blur on sensitive items is on unless you turn it off.
export async function toggleBlur() {
  await requireUser();
  const jar = await cookies();
  const off = jar.get("blur")?.value === "off";
  jar.set("blur", off ? "on" : "off", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", secure: true, httpOnly: true });
  revalidatePath("/", "layout");
}

// The design (X-Vault or Sunroom) and mode (light, dark, or follow the device). The phone reads the same settings.
export async function setLook(form: FormData) {
  await requireUser();
  const design = form.get("design");
  const mode = form.get("mode");
  await savePrefs({ design: isDesign(design) ? design : undefined, mode: isMode(mode) ? mode : undefined });
  revalidatePath("/", "layout");
}

// Sorts the next batch of unsorted items. The Sources page calls this in a loop.
export async function sortNext(): Promise<{ sorted: number; remaining: number; error?: string }> {
  await requireUser();
  try {
    const sorted = await sortItems();
    revalidatePath("/", "layout");
    return { sorted, remaining: await unsortedCount() };
  } catch (err) {
    return { sorted: 0, remaining: await unsortedCount(), error: err instanceof Error ? err.message : String(err) };
  }
}

// The Claude key typed on the Sources page. Kept encrypted; the page shows only its last four characters.
export async function saveAnthropicKey(_: string | null, form: FormData): Promise<string | null> {
  await requireUser();
  const key = String(form.get("key") ?? "").trim();
  if (!key.startsWith("sk-ant-")) return "Claude keys start with sk-ant-";
  await setAnthropicKey(key);
  revalidatePath("/sources");
  return "Saved.";
}

export async function removeAnthropicKey() {
  await requireUser();
  await setAnthropicKey(null);
  revalidatePath("/sources");
}

const MAX_IMPORT_BYTES = 90 * 1024 * 1024;

export async function importInstagramFile(_: string | null, form: FormData): Promise<string | null> {
  await requireUser();
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return "Pick your Instagram file first.";
  if (file.size > MAX_IMPORT_BYTES) return "That file is too big. Ask Instagram for JSON with low media quality, or upload only saved_posts.json.";
  try {
    const r = await importInstagram(file.name, new Uint8Array(await file.arrayBuffer()));
    revalidatePath("/", "layout");
    return `Found ${r.found.toLocaleString()} saved posts, ${r.added.toLocaleString()} of them new.`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

// Claude sorts what a sync brought in, in the background.
function sortLater(added: number) {
  if (added) getCloudflareContext().ctx.waitUntil(sortItems().catch((err) => console.error("sort failed", err)));
}

export async function syncYouTubeNow(): Promise<string> {
  await requireUser();
  try {
    const added = await syncYouTube();
    sortLater(added);
    revalidatePath("/", "layout");
    return `Done. ${added.toLocaleString()} new YouTube saves.`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

// Saves which playlists to bring in, then brings them in.
export async function pickYouTubePlaylists(_: string | null, form: FormData): Promise<string | null> {
  await requireUser();
  const ids = form.getAll("pick").map(String).filter(Boolean);
  if (!ids.length) return "Pick at least one list.";
  await setPickedPlaylists(ids);
  return syncYouTubeNow();
}

export async function disconnectYouTube() {
  await requireUser();
  await disconnectYT();
  revalidatePath("/sources");
}

export async function syncXNow(): Promise<string> {
  await requireUser();
  try {
    const added = await syncX();
    sortLater(added);
    revalidatePath("/", "layout");
    return `Done. ${added.toLocaleString()} new X bookmarks.`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function disconnectX() {
  await requireUser();
  await disconnectXApi();
  revalidatePath("/sources");
}

function done(id: string) {
  revalidatePath("/", "layout");
  revalidatePath(`/item/${id}`);
}

export async function saveNote(id: string, form: FormData) {
  await requireUser();
  const note = String(form.get("note") ?? "").trim() || null;
  await run(`update items set note = ?, updated_at = ? where id = ?`, note, now(), id);
  done(id);
}

export async function setStatus(id: string, status: "inbox" | "read" | "archived") {
  await requireUser();
  await run(`update items set status = ?, updated_at = ? where id = ?`, status, now(), id);
  done(id);
}

export async function setCategory(id: string, form: FormData) {
  await requireUser();
  const category = String(form.get("category") ?? "") || null;
  await run(`update items set category = ?, updated_at = ? where id = ?`, category, now(), id);
  done(id);
}

// A tag you add is yours, even if Claude or an import added it first.
async function tagStatements(id: string, names: string[]): Promise<D1PreparedStatement[]> {
  const d = await db();
  return names.flatMap((name) => [
    d.prepare(`insert or ignore into tags (name) values (?)`).bind(name),
    d.prepare(
      `insert into item_tags (item_id, tag_id, added_by)
       select ?, id, 'user' from tags where name = ?
       on conflict (item_id, tag_id) do update set added_by = 'user'`,
    ).bind(id, name),
  ]);
}

function splitTags(raw: FormDataEntryValue | null): string[] {
  return [...new Set(String(raw ?? "").split(",").map((t) => t.trim()).filter(Boolean))];
}

export async function addTags(id: string, form: FormData) {
  await requireUser();
  const stmts = await tagStatements(id, splitTags(form.get("tags")));
  if (stmts.length) await (await db()).batch(stmts);
  done(id);
}

export async function removeTag(id: string, name: string) {
  await requireUser();
  await run(
    `delete from item_tags where item_id = ? and tag_id in (select id from tags where name = ?)`,
    id,
    name,
  );
  done(id);
}

export async function addItem(_: string | null, form: FormData): Promise<string | null> {
  await requireUser();
  const url = String(form.get("url") ?? "").trim() || null;
  const note = String(form.get("note") ?? "").trim() || null;
  let title = String(form.get("title") ?? "").trim() || null;
  const tags = splitTags(form.get("tags"));
  const file = form.get("file");
  const hasFile = file instanceof File && file.size > 0;

  if (url && !/^https?:\/\//i.test(url)) return "Links need to start with http:// or https://";
  if (!url && !note && !hasFile && !title) return "Add a link, a note, or a photo.";
  if (hasFile && file.size > MAX_FILE_BYTES) return "That file is over 10 MB.";

  let body: string | null = null;
  const media: string[] = [];
  if (url) {
    const found = await unfurl(url);
    title ??= found.title ?? null;
    body = found.description ?? null;
    if (found.image) media.push(found.image);
  }
  const kind = url ? "link" : hasFile ? "image" : "note";
  if (!title && !url && note) title = note.split("\n")[0].slice(0, 120);

  const d = await db();
  const stmts: D1PreparedStatement[] = [];
  // One key per link however it is spelled, per picture by its bytes, or per note by its words,
  // so adding something that is already here adds to it instead of making a copy.
  const bytes = hasFile ? await file.arrayBuffer() : null;
  const hash = bytes ? await sha256Hex(bytes) : null;
  const key = url ? urlKey(url) : hash ? `img:${hash}` : await noteKey(note ?? title ?? "");
  const existing = await first<{ id: string }>(
    `select id from items where (?1 is not null and canon = ?1) or id = ?2 or (?3 is not null and url = ?3)
     order by coalesce(canon = ?1, 0) desc, created_at limit 1`,
    key, idForKey(key) ?? "", url,
  );
  const id = existing?.id ?? idForKey(key) ?? crypto.randomUUID();
  if (existing) {
    if (note) {
      // A note already on the item (the same form sent twice) is not added again.
      stmts.push(
        d.prepare(
          `update items set note = case when instr(coalesce(note, ''), ?1) > 0 then note
             else coalesce(note || char(10) || char(10), '') || ?1 end, updated_at = ?2 where id = ?3`,
        ).bind(note, now(), id),
      );
    }
    if (key) stmts.push(d.prepare(`update or ignore items set canon = coalesce(canon, ?) where id = ?`).bind(key, id));
  } else {
    stmts.push(
      d.prepare(`insert into items (id, title, body, note, url, kind, media, canon) values (?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, title, body, note, url, kind, JSON.stringify(media), key),
    );
  }
  stmts.push(
    d.prepare(`insert into saves (id, item_id, source_id, original_url) values (?, ?, 'manual', ?)`)
      .bind(crypto.randomUUID(), id, url),
  );
  const hasCopy = existing && hash
    ? await first(`select 1 from files where item_id = ? and sha256 = ?`, id, hash)
    : null;
  if (hasFile && bytes && !hasCopy) {
    const fileId = crypto.randomUUID();
    const key = `files/${fileId}`;
    await (await env()).FILES.put(key, bytes, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    stmts.push(
      d.prepare(`insert into files (id, item_id, filename, mime, size, r2_key, sha256) values (?, ?, ?, ?, ?, ?, ?)`)
        .bind(fileId, id, file.name, file.type || "application/octet-stream", file.size, key, hash),
    );
  }
  stmts.push(...(await tagStatements(id, tags)));
  await d.batch(stmts);

  // Claude sorts the new item in the background, so saving stays quick.
  if (!existing) getCloudflareContext().ctx.waitUntil(sortItems([id]).catch((err) => console.error("sort failed", err)));

  revalidatePath("/", "layout");
  redirect(`/item/${id}`);
}
