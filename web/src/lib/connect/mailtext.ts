// Turning an email into plain text Brain can search and Ask Brain can read. No app imports,
// so the tests can use it.

export const MAX_MAIL_TEXT = 8000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", zwnj: "", zwj: "" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// The words in an HTML email, with line breaks where blocks end.
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head|title)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

// Tidy whitespace and drop the quoted older messages under a reply.
export function tidyMail(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim());
  const out: string[] = [];
  for (const line of lines) {
    // "On Mon, 3 Oct 2026, Sara wrote:" and the "> " lines after it are the earlier message again.
    if (/^(On .{6,200} wrote:|-{2,} ?Original Message ?-{2,}|From: .+ Sent: .+)$/i.test(line)) break;
    if (line.startsWith(">")) continue;
    if (!line && !out[out.length - 1]) continue;
    out.push(line);
  }
  return out.join("\n").trim().slice(0, MAX_MAIL_TEXT);
}

export function base64UrlToText(data: string): string {
  const bin = atob(data.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// "Sara Ali <sara@example.com>" → name and address.
export function parseAddress(v: string | undefined | null): { name: string | null; email: string | null } {
  if (!v) return { name: null, email: null };
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(v);
  if (m) return { name: m[1].trim() || null, email: m[2].trim() };
  return { name: null, email: v.trim() || null };
}

// ─── Gmail ───

export type GmailPart = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
};

export type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPart;
};

function findPart(p: GmailPart | undefined, mime: string): string | null {
  if (!p) return null;
  if (p.mimeType === mime && p.body?.data && !p.filename) return p.body.data;
  for (const c of p.parts ?? []) {
    const found = findPart(c, mime);
    if (found) return found;
  }
  return null;
}

export function gmailHeader(m: GmailMessage, name: string): string | null {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

// The message's words: the plain text part, else the HTML one as text, else Gmail's snippet.
export function gmailText(m: GmailMessage): string {
  const plain = findPart(m.payload, "text/plain");
  if (plain) return tidyMail(base64UrlToText(plain));
  const html = findPart(m.payload, "text/html");
  if (html) return tidyMail(htmlToText(base64UrlToText(html)));
  return tidyMail(decodeEntities(m.snippet ?? ""));
}

// Gmail's batch answer is one multipart body with an HTTP response in each part. Returns the
// JSON of each part that came back 200, and how many parts failed.
export function parseBatch(body: string, boundary: string): { ok: unknown[]; failed: number } {
  const ok: unknown[] = [];
  let failed = 0;
  for (const part of body.split(`--${boundary}`)) {
    const status = /HTTP\/[\d.]+ (\d{3})/.exec(part)?.[1];
    if (!status) continue;
    const start = part.indexOf("{");
    const end = part.lastIndexOf("}");
    if (status !== "200" || start < 0 || end < start) {
      failed++;
      continue;
    }
    try {
      ok.push(JSON.parse(part.slice(start, end + 1)));
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}

// What a saved email shows: who it's from and to, then the words.
export function mailBody(p: { from?: string | null; to?: string | null; text: string }): string {
  const head = [p.from && `From: ${p.from}`, p.to && `To: ${p.to}`].filter(Boolean).join("\n");
  return [head, p.text].filter(Boolean).join("\n\n");
}
