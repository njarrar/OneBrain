// One key per saved thing, so the same post or link saved from two places (or twice) is one item.
//   x:<tweet id>        a post on X, from any twitter.com / x.com link or the X sync
//   yt:<video id>       a YouTube video, from youtu.be, watch?v=, shorts, embed, m. and music.
//   ig:<shortcode>      an Instagram post or reel
//   url:<canonical url> any other link, with tracking removed
//   img:<sha-256>       a picture, by its bytes
//   note:<sha-256>      a note with no link, by its words
// Kept free of app imports so scripts and tests can use it too.

// Query parameters that only say where a click came from.
const TRACKING = new Set([
  "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "yclid", "twclid", "ttclid", "li_fat_id",
  "mc_cid", "mc_eid", "igshid", "igsh", "_ga", "_gl", "_hsenc", "_hsmi", "mkt_tok", "ref_src", "ref_url",
  "oly_anon_id", "oly_enc_id", "vero_id", "__twitter_impression", "cmpid", "spm", "share_id", "sfnsn",
]);
// Extra ones that are only noise on these sites (on others they can mean something).
const SITE_TRACKING: [RegExp, string[]][] = [
  [/(^|\.)(x\.com|twitter\.com)$/, ["s", "t", "src", "ref_src", "ref_url", "lang"]],
  [/(^|\.)(youtube\.com|youtu\.be)$/, ["si", "feature", "pp", "ab_channel", "embeds_referring_euri"]],
  [/(^|\.)instagram\.com$/, ["igsh", "igshid", "img_index", "hl", "utm_source"]],
  [/(^|\.)(spotify\.com)$/, ["si", "context", "nd"]],
  [/(^|\.)(tiktok\.com)$/, ["is_from_webapp", "sender_device", "web_id", "_r", "_t", "is_copy_url"]],
  [/(^|\.)(linkedin\.com)$/, ["trk", "trackingId", "lipi", "rcm"]],
  [/(^|\.)(threads\.net|threads\.com)$/, ["xmt", "slof"]],
];

const X_HOSTS = /^(?:(?:www|mobile|m)\.)?(?:x|twitter|fxtwitter|vxtwitter|fixupx|fixvx)\.com$/;
const YT_HOSTS = /^(?:(?:www|m|music)\.)?(?:youtube\.com|youtube-nocookie\.com)$/;
const IG_HOSTS = /^(?:(?:www|m)\.)?(?:instagram\.com|instagr\.am)$/;
const YT_ID = /^[\w-]{11}$/;
const IG_CODE = /^[\w-]{5,}$/;

function parse(input: string): URL | null {
  const s = input.trim();
  if (!s) return null;
  try {
    // A bare "example.com/a" gets https://; anything with its own scheme (mailto:) is left to fail below.
    const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(s) && !/^[^/:]+:\d/.test(s);
    const u = new URL(hasScheme ? s : `https://${s}`);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

function host(u: URL) {
  return u.hostname.toLowerCase().replace(/\.$/, "");
}

// The tweet id in an X or Twitter link, whatever else is in the path (/photo/1, /video/1, /analytics).
export function tweetId(u: URL): string | null {
  if (!X_HOSTS.test(host(u))) return null;
  const m = u.pathname.match(/^\/(?:[^/]+|i\/web|i)\/status(?:es)?\/(\d{1,25})(?:\/|$)/i);
  return m ? m[1] : null;
}

export function youtubeId(u: URL): string | null {
  const h = host(u);
  let id: string | null = null;
  if (h === "youtu.be" || h === "www.youtu.be") id = u.pathname.split("/")[1] ?? null;
  else if (YT_HOSTS.test(h)) {
    if (u.pathname === "/watch" || u.pathname === "/watch/") id = u.searchParams.get("v");
    else id = u.pathname.match(/^\/(?:shorts|embed|live|v|e)\/([^/?#]+)/i)?.[1] ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

export function instagramCode(u: URL): string | null {
  if (!IG_HOSTS.test(host(u))) return null;
  // /p/X, /reel/X, /reels/X, /tv/X, and the same after a user name: /name/p/X.
  const m = u.pathname.match(/^\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([^/?#]+)/i);
  return m && IG_CODE.test(m[1]) ? m[1] : null;
}

// One spelling for a link: https, lower-case host without www., no fragment, no tracking,
// sorted query, no trailing slash. X, YouTube and Instagram links collapse to one form per post.
export function canonicalUrl(input: string): string {
  const u = parse(input);
  if (!u) return input.trim();

  const tid = tweetId(u);
  if (tid) return `https://x.com/i/status/${tid}`;
  const yid = youtubeId(u);
  if (yid) return `https://youtube.com/watch?v=${yid}`;
  const code = instagramCode(u);
  if (code) return `https://instagram.com/p/${code}`;

  const h = host(u).replace(/^www\d*\./, "");
  const extra = SITE_TRACKING.filter(([re]) => re.test(h)).flatMap(([, names]) => names);
  const params = [...u.searchParams.entries()]
    .filter(([k]) => {
      const key = k.toLowerCase();
      return !key.startsWith("utm_") && !TRACKING.has(key) && !extra.includes(k);
    })
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1));
  const query = params.length ? `?${new URLSearchParams(params).toString()}` : "";

  let path = u.pathname.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  if (path === "/") path = "";
  const port = u.port && u.port !== "80" && u.port !== "443" ? `:${u.port}` : "";
  // Keep #! and #/ routes (single-page sites); drop every other fragment.
  const hash = /^#[!/]/.test(u.hash) ? u.hash : "";
  return `https://${h}${port}${path}${query}${hash}`;
}

// The identity key for a link.
export function urlKey(input: string): string | null {
  const u = parse(input);
  if (!u) return null;
  const tid = tweetId(u);
  if (tid) return `x:${tid}`;
  const yid = youtubeId(u);
  if (yid) return `yt:${yid}`;
  const code = instagramCode(u);
  if (code) return `ig:${code}`;
  return `url:${canonicalUrl(input)}`;
}

export type KeyInput = {
  source?: string | null;
  url?: string | null;
  externalId?: string | null;
  // A video id, tweet id or shortcode, when the source knows it.
  itemKey?: string | null;
  // SHA-256 of a picture's bytes, as hex.
  imageHash?: string | null;
};

// The identity key for an incoming item, or null when there is nothing stable to key on.
export function identityKey(x: KeyInput): string | null {
  if (x.url) {
    const k = urlKey(x.url);
    if (k) return k;
  }
  const own = x.itemKey ?? x.externalId ?? null;
  if (own) {
    if (x.source === "x" && /^\d{1,25}$/.test(own)) return `x:${own}`;
    if (x.source === "youtube" && YT_ID.test(own)) return `yt:${own}`;
    if (x.source === "instagram" && IG_CODE.test(own)) return `ig:${own}`;
  }
  if (x.imageHash) return `img:${x.imageHash.toLowerCase()}`;
  return null;
}

// The item id used for a key, matching the ids the X, YouTube and Instagram imports have always used,
// so a link shared from the phone lands on the item the sync made (and the other way round).
export function idForKey(key: string | null): string | null {
  if (!key) return null;
  const [kind, value] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
  if (kind === "x") return `x-${value}`;
  if (kind === "yt") return `youtube-${value}`;
  if (kind === "ig" && /^[\w-]{1,80}$/.test(value)) return `instagram-${value}`;
  return null;
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// A note with no link is keyed by its words, ignoring case and spacing, so a retried share is one item.
export async function noteKey(text: string): Promise<string | null> {
  const words = text.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  return words ? `note:${await sha256Hex(words)}` : null;
}

// Most advanced status wins when two copies are merged.
export const STATUS_RANK: Record<string, number> = { inbox: 0, read: 1, archived: 2 };
