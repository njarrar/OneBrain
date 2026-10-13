import { env } from "@/lib/db";
import { sameKey } from "@/lib/settings";
import { syncYouTube, youtubeConnected } from "@/lib/youtube";
import { syncX, xConnected } from "@/lib/x";
import { CONNECTORS } from "@/lib/connect";
import { sortItems } from "@/lib/sorter";
import { embedItems } from "@/lib/memory/embed";
import { readItems } from "@/lib/memory/read";
import { digestIfDue } from "@/lib/memory/digest";

// The Worker's timer calls this every hour (see worker.ts). Every six hours it pulls new YouTube saves and
// X bookmarks, new mail from Gmail and Outlook (plus a slice of older mail until the history is in) and new
// Pinterest pins. Every hour it hears and reads saves not read yet (every kind: voice memos, pictures,
// notes, bookmarks, emails, pins), sorts a few batches of anything still unsorted, gives new or changed
// items their meaning vectors, and on Sunday evenings writes the weekly digest.
const SORT_BATCHES = 10;
const EMBED_BATCHES = 5;
const READ_BATCHES = 8;

export async function POST(req: Request) {
  const e = await env();
  if (!e.BETTER_AUTH_SECRET || !sameKey(req.headers.get("x-cron-key") ?? "", e.BETTER_AUTH_SECRET)) {
    return new Response("no", { status: 401 });
  }
  const report: Record<string, unknown> = {};
  // Sources sync every six hours (X charges per read); the AI work below runs every hour.
  const syncHour = new Date().getUTCHours() % 6 === 0 || new URL(req.url).searchParams.has("sync");
  if (syncHour && (await youtubeConnected())) {
    try {
      report.youtube = await syncYouTube();
    } catch (err) {
      report.youtube = String(err);
    }
  }
  if (syncHour && (await xConnected())) {
    try {
      report.x = await syncX();
    } catch (err) {
      report.x = String(err);
    }
  }
  for (const c of syncHour ? Object.values(CONNECTORS) : []) {
    if (!(await c.connected())) continue;
    try {
      report[c.id] = await c.sync();
    } catch (err) {
      report[c.id] = String(err);
    }
  }
  // Reading goes first, so sorting and vectors use what was heard or read.
  const reading = { read: 0, failed: 0, skipped: 0 };
  try {
    for (let i = 0; i < READ_BATCHES; i++) {
      const r = await readItems();
      reading.read += r.read;
      reading.failed += r.failed;
      reading.skipped += r.skipped;
      if (!r.read && !r.failed && !r.skipped) break;
    }
  } catch (err) {
    report.readError = String(err);
  }
  report.reading = reading;
  let sorted = 0;
  try {
    for (let i = 0; i < SORT_BATCHES; i++) {
      const n = await sortItems();
      sorted += n;
      if (!n) break;
    }
  } catch (err) {
    report.sortError = String(err);
  }
  report.sorted = sorted;
  // A few hundred vectors a run, so the first backfill of older items catches up over a few runs.
  let embedded = 0;
  try {
    for (let i = 0; i < EMBED_BATCHES; i++) {
      const n = await embedItems();
      embedded += n;
      if (!n) break;
    }
  } catch (err) {
    report.embedError = String(err);
  }
  report.embedded = embedded;
  try {
    report.digest = await digestIfDue();
  } catch (err) {
    report.digestError = String(err);
  }
  return Response.json(report);
}
