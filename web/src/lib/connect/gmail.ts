import { db } from "@/lib/db";
import { markSynced, saveMany, type Incoming } from "@/lib/ingest";
import { tokenRequest } from "@/lib/youtube";
import { gmailHeader, gmailText, mailBody, parseAddress, parseBatch, type GmailMessage } from "@/lib/connect/mailtext";
import { knownIds, readState, readToken, saveState, saveToken } from "@/lib/connect/tokens";
import type { Connector, SyncResult } from "@/lib/connect/types";

// Gmail, read only. Its own Google sign-in (like YouTube) asks for gmail.readonly and keeps a
// refresh token. The first runs bring in your whole history newest first, a slice each time;
// after that each run brings in what arrived since. Spam, trash, chats and the Promotions,
// Social and Forums tabs stay out.

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SKIP = "-in:spam -in:trash -in:chats -category:promotions -category:social -category:forums";
const TOKEN = "gmail_refresh_token";
const STATE = "gmail_state";
// Messages fetched a run. Gmail allows about 50 message reads a second, so a batch holds 40.
const BUDGET = 400;
const BATCH = 40;

type State = {
  // Newest mail time seen (ms). New mail is anything after it.
  since: number;
  // Where the walk through older mail got to; null at the start.
  page: string | null;
  done: boolean;
  // Where the walk through new mail stopped when a run ran out of budget. "since" holds still
  // until that walk ends, so no new mail is skipped.
  newPage?: string | null;
};

async function accessToken(): Promise<string> {
  const refresh = await readToken(TOKEN);
  if (!refresh) throw new Error("Gmail is not connected.");
  return (await tokenRequest({ refresh_token: refresh, grant_type: "refresh_token" })).access_token!;
}

async function list(token: string, q: string, pageToken: string | null): Promise<{ ids: string[]; next: string | null }> {
  const p = new URLSearchParams({ q, maxResults: "100", ...(pageToken ? { pageToken } : {}) });
  const res = await fetch(`${API}/messages?${p}`, { headers: { authorization: `Bearer ${token}` } });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; nextPageToken?: string; error?: { message?: string } };
  if (!res.ok) throw new Error(`Gmail said: ${json.error?.message ?? res.status}`);
  return { ids: (json.messages ?? []).map((m) => m.id), next: json.nextPageToken ?? null };
}

// Full messages for these ids, in Gmail batches. Throws if any fail, after keeping the rest,
// so the walk doesn't move past a message it never saved.
async function fetchAndSave(token: string, ids: string[]): Promise<number> {
  let saved = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const boundary = `brain${crypto.randomUUID().replace(/-/g, "")}`;
    const body =
      chunk.map((id, n) => `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <m${n}>\r\n\r\nGET /gmail/v1/users/me/messages/${id}?format=full\r\n\r\n`).join("") +
      `--${boundary}--`;
    const res = await fetch("https://gmail.googleapis.com/batch/gmail/v1", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/mixed; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error(`Gmail said: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
    const answer = /boundary="?([^";]+)"?/.exec(res.headers.get("content-type") ?? "")?.[1];
    if (!answer) throw new Error("Gmail sent a batch answer Brain can't read.");
    const out = parseBatch(await res.text(), answer);
    failed += out.failed;
    const messages = (out.ok as GmailMessage[]).filter((m) => m?.id);
    await saveMany(messages.map(toIncoming));
    saved += messages.length;
  }
  if (failed) throw new Error(`Gmail didn't send ${failed} messages this time. They'll come next run.`);
  return saved;
}

function toIncoming(m: GmailMessage): Incoming {
  const from = parseAddress(gmailHeader(m, "From"));
  const sent = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null;
  return {
    source: "gmail",
    externalId: m.id,
    key: `mail:gmail:${m.id}`,
    url: `https://mail.google.com/mail/u/0/#all/${m.id}`,
    title: gmailHeader(m, "Subject")?.trim() || "(no subject)",
    body: mailBody({ from: gmailHeader(m, "From"), to: gmailHeader(m, "To"), text: gmailText(m) }),
    author: from.name ?? from.email,
    authorHandle: from.email,
    kind: "email",
    status: "read",
    postedAt: sent,
    savedAt: sent,
    raw: { threadId: m.threadId, labels: m.labelIds },
  };
}

async function sync(): Promise<SyncResult> {
  const d = await db();
  const before = (await d.prepare(`select count(*) as n from saves where source_id = 'gmail'`).first<{ n: number }>())?.n ?? 0;
  try {
    const token = await accessToken();
    const state = await readState<State>(STATE, { since: Date.now(), page: null, done: false });
    let budget = BUDGET;

    // New mail first, a page at a time. "after:" takes seconds; an hour back covers clock drift.
    // Only mail not here yet counts against the budget, so a run never stalls on mail it has.
    const after = Math.floor(state.since / 1000) - 3600;
    let page: string | null = state.newPage ?? null;
    do {
      const r = await list(token, `${SKIP} after:${after}`, page);
      const known = await knownIds(d, "gmail", r.ids);
      const missing = r.ids.filter((id) => !known.has(id));
      if (missing.length) await fetchAndSave(token, missing);
      budget -= Math.max(missing.length, 10);
      page = r.next;
    } while (page && budget > 0);
    state.newPage = page;
    const hasMoreNew = !!page;
    // Only once every page of new mail is in does "since" move up to the newest mail here.
    if (!hasMoreNew) {
      const latest = await d
        .prepare(`select max(saved_at) as t from saves where source_id = 'gmail'`)
        .first<{ t: string | null }>();
      if (latest?.t) state.since = Math.max(state.since, new Date(latest.t).getTime());
    }
    await saveState(STATE, state);

    // Then older mail, a page at a time, until the budget runs out.
    while (!state.done && budget > 0) {
      const r = await list(token, SKIP, state.page);
      const seen = await knownIds(d, "gmail", r.ids);
      const missing = r.ids.filter((id) => !seen.has(id));
      if (missing.length) await fetchAndSave(token, missing);
      budget -= Math.max(missing.length, 10);
      state.page = r.next;
      state.done = !r.next;
      await saveState(STATE, state);
    }
    await saveState(STATE, state);

    const total = (await d.prepare(`select count(*) as n from saves where source_id = 'gmail'`).first<{ n: number }>())?.n ?? 0;
    await markSynced("gmail", total - before);
    return { added: total - before, more: !state.done || hasMoreNew };
  } catch (err) {
    await markSynced("gmail", 0, err instanceof Error ? err.message : String(err));
    throw err;
  }
}

export const gmail: Connector = {
  id: "gmail",
  name: "Gmail",
  keysSet: (e) => !!(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET),
  authUrl(e, { state, redirectUri, challenge }) {
    const p = new URLSearchParams({
      client_id: e.GOOGLE_CLIENT_ID ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  },
  async finish(code, { redirectUri, verifier }) {
    const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier });
    if (!t.refresh_token) throw new Error("Google did not give lasting access. Remove Brain at myaccount.google.com/permissions and connect again.");
    await saveToken(TOKEN, t.refresh_token);
    await saveState(STATE, { since: Date.now(), page: null, done: false } satisfies State);
  },
  connected: async () => !!(await readToken(TOKEN)),
  sync,
  async disconnect() {
    await saveToken(TOKEN, null);
    await saveState(STATE, null);
    await markSynced("gmail", 0, null, "not_connected");
  },
};

// For the tests.
export const forTests = { toIncoming };
