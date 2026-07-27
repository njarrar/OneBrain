import { allowed, denied } from "@/lib/apptoken";
import { db, now } from "@/lib/db";
import { getItem, purgeItems } from "@/lib/queries";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await allowed(req))) return denied();
  const data = await getItem((await params).id);
  return data ? Response.json(data) : Response.json({ error: "Not found" }, { status: 404 });
}

type Change = {
  status?: "inbox" | "read" | "archived";
  // true marks the item read, false unread.
  read?: boolean;
  // true moves the item to Trash, false brings it back.
  trash?: boolean;
  category?: string | null;
  note?: string | null;
  addTags?: string[];
  removeTags?: string[];
};

// Changes one item: status, read, trash, category, note, tags. Send only what changes.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await allowed(req))) return denied();
  const id = (await params).id;
  const c = (await req.json()) as Change;
  const d = await db();
  const stmts: D1PreparedStatement[] = [];
  const t = now();
  if (c.status && ["inbox", "read", "archived"].includes(c.status)) {
    stmts.push(d.prepare(`update items set status = ?, updated_at = ? where id = ?`).bind(c.status, t, id));
  }
  if (typeof c.read === "boolean") {
    stmts.push(d.prepare(`update items set read_at = ? where id = ?`).bind(c.read ? t : null, id));
  }
  if (typeof c.trash === "boolean") {
    stmts.push(d.prepare(`update items set deleted_at = ?, updated_at = ? where id = ?`).bind(c.trash ? t : null, t, id));
  }
  if (c.category !== undefined) {
    stmts.push(d.prepare(`update items set category = ?, updated_at = ? where id = ?`).bind(c.category || null, t, id));
  }
  if (c.note !== undefined) {
    stmts.push(d.prepare(`update items set note = ?, updated_at = ? where id = ?`).bind(c.note?.trim() || null, t, id));
  }
  for (const name of new Set((c.addTags ?? []).map((s) => s.trim()).filter(Boolean))) {
    stmts.push(
      d.prepare(`insert or ignore into tags (name) values (?)`).bind(name),
      d.prepare(
        `insert into item_tags (item_id, tag_id, added_by) select ?, id, 'user' from tags where name = ?
         on conflict (item_id, tag_id) do update set added_by = 'user'`,
      ).bind(id, name),
    );
  }
  for (const name of c.removeTags ?? []) {
    stmts.push(d.prepare(`delete from item_tags where item_id = ? and tag_id in (select id from tags where name = ?)`).bind(id, name));
  }
  if (stmts.length) await d.batch(stmts);
  const data = await getItem(id);
  return data ? Response.json(data) : Response.json({ error: "Not found" }, { status: 404 });
}

// Deletes an item for good. It must be in Trash first.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await allowed(req))) return denied();
  const n = await purgeItems([(await params).id]);
  return n ? Response.json({ deleted: n }) : Response.json({ error: "Move it to Trash first" }, { status: 409 });
}
