"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAuth } from "@/lib/auth";
import { requireUser } from "@/lib/session";
import { sortItems, unsortedCount } from "@/lib/sorter";
import { captureItem, listItems, markOpened, purgeItems, updateItem, type ItemRow } from "@/lib/items/service";
import { ItemChange, Question, Review, tagList } from "@/lib/items/schema";
import { InputError, errorMessage } from "@/lib/http";
import { review } from "@/lib/memory/reminders";
import { embedItems, searchByMeaning } from "@/lib/memory/embed";
import { readItems, rereadItem, unreadTextCount } from "@/lib/memory/read";
import { ask } from "@/lib/memory/ask";
import { makeDigest } from "@/lib/memory/digest";
import { importInstagram } from "@/lib/instagram";
import { disconnect as disconnectYT, setPickedPlaylists, syncYouTube } from "@/lib/youtube";
import { disconnect as disconnectXApi, syncX } from "@/lib/x";
import { keyProblem, setApiKey } from "@/lib/secrets";
import { isProvider, saveAiSettings, testProvider, type Provider } from "@/lib/ai";
import { isDesign, isMode, savePrefs } from "@/lib/theme";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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

// Hears or reads the next batch of saves (voice memos, pictures, notes). The Sources page calls this in a loop.
export async function readNext(): Promise<{ read: number; remaining: number; error?: string }> {
  await requireUser();
  try {
    const r = await readItems();
    revalidatePath("/", "layout");
    return { read: r.read + r.failed, remaining: await unreadTextCount() };
  } catch (err) {
    return { read: 0, remaining: await unreadTextCount(), error: err instanceof Error ? err.message : String(err) };
  }
}

// "Read again" on an item: hear or read it from the start, then sort and embed with what it found.
export async function readAgain(id: string) {
  await requireUser();
  await rereadItem(id);
  await embedItems([id]).catch(() => 0);
  revalidatePath("/", "layout");
}

// The AI keys typed in Settings. Kept encrypted; the page shows only the last four characters.
export async function saveAiKey(provider: Provider, _: string | null, form: FormData): Promise<string | null> {
  await requireUser();
  if (!isProvider(provider)) return "Unknown AI.";
  const key = String(form.get("key") ?? "").trim();
  const problem = keyProblem(provider, key);
  if (problem) return problem;
  await setApiKey(provider, key);
  revalidatePath("/", "layout");
  return "Saved. Press Test to check it.";
}

export async function removeAiKey(provider: Provider) {
  await requireUser();
  if (!isProvider(provider)) return;
  await setApiKey(provider, null);
  revalidatePath("/", "layout");
}

// Which AI does the work: sorting, labels, Ask Brain and the digest.
export async function setAiProvider(form: FormData) {
  await requireUser();
  const provider = form.get("provider");
  if (isProvider(provider)) await saveAiSettings({ provider });
  revalidatePath("/", "layout");
}

// The model name for one AI. Empty goes back to the default.
export async function setAiModel(provider: Provider, form: FormData) {
  await requireUser();
  if (!isProvider(provider)) return;
  const name = String(form.get("model") ?? "").trim().slice(0, 100);
  if (name && !/^[\w.:/-]+$/.test(name)) return;
  await saveAiSettings({ model: { provider, name: name || null } });
  revalidatePath("/settings");
}

export async function testAi(provider: Provider): Promise<{ ok: boolean; message: string }> {
  await requireUser();
  if (!isProvider(provider)) return { ok: false, message: "Unknown AI." };
  return testProvider(provider);
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

// Every change to an item from the web goes through the same checks and code as the iPhone app.
async function change(id: string, raw: unknown) {
  await requireUser();
  const c = ItemChange.safeParse(raw);
  if (!c.success || typeof id !== "string" || !id) throw new Error("That change isn't allowed.");
  await updateItem(id, c.data);
  done(id);
}

export async function saveNote(id: string, form: FormData) {
  await change(id, { note: String(form.get("note") ?? "") });
}

export async function setStatus(id: string, status: "inbox" | "read" | "archived") {
  await change(id, { status });
}

export async function setRead(id: string, read: boolean) {
  await change(id, { read });
}

// Opening an item marks it read, once. Marking it unread afterwards sticks.
export async function markOpenedAction(id: string) {
  await requireUser();
  if (typeof id !== "string" || !id) return;
  await markOpened(id);
  revalidatePath("/", "layout");
}

// Delete moves an item to Trash, same as on the iPhone. Trash can restore it or delete it for good.
export async function trashItem(id: string) {
  await change(id, { trash: true });
}

export async function restoreItem(id: string) {
  await change(id, { trash: false });
}

export async function purgeItem(id: string) {
  await requireUser();
  await purgeItems([String(id)]);
  revalidatePath("/", "layout");
  redirect("/?view=trash");
}

export async function emptyTrash() {
  await requireUser();
  await purgeItems();
  revalidatePath("/", "layout");
  redirect("/?view=trash");
}

export async function setCategory(id: string, form: FormData) {
  await change(id, { category: String(form.get("category") ?? "") || null });
}

export async function addTags(id: string, form: FormData) {
  const tags = tagList(form.get("tags"));
  if (tags.length) await change(id, { addTags: tags });
}

// Keeps a tag Claude suggested, so it counts as yours.
export async function acceptTag(id: string, name: string) {
  await change(id, { addTags: [name] });
}

export async function removeTag(id: string, name: string) {
  await change(id, { removeTags: [name] });
}

// When an item should come back in Resurface; null removes the reminder.
export async function remindItem(id: string, remindAt: string | null) {
  await change(id, { remindAt });
}

export async function reviewCard(id: string, how: "keep" | "later" | "done") {
  await requireUser();
  const r = Review.safeParse({ id, how });
  if (!r.success) throw new Error("That answer isn't allowed.");
  const out = await review(r.data.id, r.data.how);
  revalidatePath("/", "layout");
  return out;
}

// The Add page: a link, a note, tags and an optional picture. Opens the item when saved.
export async function addItem(_: string | null, form: FormData): Promise<string | null> {
  await requireUser();
  const file = form.get("file");
  let id: string;
  try {
    ({ id } = await captureItem({
      url: String(form.get("url") ?? "").slice(0, 2000),
      text: String(form.get("note") ?? "").slice(0, 20000),
      title: String(form.get("title") ?? "").slice(0, 500),
      tags: tagList(form.get("tags")),
      file: file instanceof File ? file : null,
      source: "manual",
    }));
  } catch (err) {
    if (err instanceof InputError) return err.message;
    throw err;
  }
  revalidatePath("/", "layout");
  redirect(`/item/${id}`);
}

// ───────────── ⌘K box and Ask ─────────────

export type Hit = { id: string; title: string; category: string | null; color: string | null; date: string; rtl: boolean };

function hit(i: ItemRow): Hit {
  const text = i.title ?? i.body?.trim() ?? i.url ?? "Untitled";
  return {
    id: i.id,
    title: text.length > 120 ? text.slice(0, 120).trimEnd() + "…" : text,
    category: i.category,
    color: i.category_color,
    date: (i.posted_at ?? i.created_at).slice(0, 10),
    rtl: i.lang === "ar",
  };
}

// Word matches first (exact names, handles), then things that are about the same idea.
export async function paletteSearch(q: string): Promise<{ words: Hit[]; meaning: Hit[] }> {
  await requireUser();
  const text = String(q ?? "").trim().slice(0, 200);
  if (!text) return { words: [], meaning: [] };
  const [page, close] = await Promise.all([
    listItems({ view: "all", q: text, page: 1 }),
    searchByMeaning(text, 6).catch(() => []),
  ]);
  const words = page.items.slice(0, 6).map(hit);
  const seen = new Set(words.map((w) => w.id));
  return { words, meaning: close.filter((c) => !seen.has(c.id)).slice(0, 4).map(hit) };
}

export async function askBrain(q: string): Promise<{ answer: string | null; sources: Hit[]; error?: string }> {
  await requireUser();
  const parsed = Question.safeParse({ q });
  if (!parsed.success) return { answer: null, sources: [], error: "Ask in 500 characters or fewer." };
  try {
    const r = await ask(parsed.data.q);
    return { answer: r.answer, sources: r.sources.map(hit) };
  } catch (err) {
    return { answer: null, sources: [], error: `Claude couldn't answer: ${errorMessage(err)}` };
  }
}

// ───────────── Weekly digest ─────────────

export async function makeDigestNow(): Promise<string | null> {
  await requireUser();
  try {
    const r = await makeDigest();
    revalidatePath("/digest");
    return r.made ? null : (r.reason ?? "No digest this time.");
  } catch (err) {
    return `Claude couldn't write it: ${errorMessage(err)}`;
  }
}
