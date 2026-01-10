"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, env, first, now, run } from "@/lib/db";
import { SESSION_COOKIE, passwordMatches, sessionToken } from "@/lib/auth";
import { unfurl } from "@/lib/unfurl";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function login(_: string | null, form: FormData): Promise<string | null> {
  if (!(await passwordMatches(String(form.get("password") ?? "")))) return "That password is wrong.";
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

function done(id: string) {
  revalidatePath("/", "layout");
  revalidatePath(`/item/${id}`);
}

export async function saveNote(id: string, form: FormData) {
  const note = String(form.get("note") ?? "").trim() || null;
  await run(`update items set note = ?, updated_at = ? where id = ?`, note, now(), id);
  done(id);
}

export async function setStatus(id: string, status: "inbox" | "read" | "archived") {
  await run(`update items set status = ?, updated_at = ? where id = ?`, status, now(), id);
  done(id);
}

export async function setCategory(id: string, form: FormData) {
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
  const stmts = await tagStatements(id, splitTags(form.get("tags")));
  if (stmts.length) await (await db()).batch(stmts);
  done(id);
}

export async function removeTag(id: string, name: string) {
  await run(
    `delete from item_tags where item_id = ? and tag_id in (select id from tags where name = ?)`,
    id,
    name,
  );
  done(id);
}

export async function addItem(_: string | null, form: FormData): Promise<string | null> {
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
  const existing = url ? await first<{ id: string }>(`select id from items where url = ?`, url) : null;
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    if (note) {
      stmts.push(
        d.prepare(`update items set note = coalesce(note || char(10) || char(10), '') || ?, updated_at = ? where id = ?`)
          .bind(note, now(), id),
      );
    }
  } else {
    stmts.push(
      d.prepare(`insert into items (id, title, body, note, url, kind, media) values (?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, title, body, note, url, kind, JSON.stringify(media)),
    );
  }
  stmts.push(
    d.prepare(`insert into saves (id, item_id, source_id, original_url) values (?, ?, 'manual', ?)`)
      .bind(crypto.randomUUID(), id, url),
  );
  if (hasFile) {
    const fileId = crypto.randomUUID();
    const key = `files/${fileId}`;
    await (await env()).FILES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    stmts.push(
      d.prepare(`insert into files (id, item_id, filename, mime, size, r2_key) values (?, ?, ?, ?, ?, ?)`)
        .bind(fileId, id, file.name, file.type || "application/octet-stream", file.size, key),
    );
  }
  stmts.push(...(await tagStatements(id, tags)));
  await d.batch(stmts);

  revalidatePath("/", "layout");
  redirect(`/item/${id}`);
}
