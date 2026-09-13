# Brain

Brain is a digital brain: one private place for everything you save. It pulls in
X bookmarks, Instagram saves, screenshots, Feedly articles and YouTube videos, and keeps
all of it. Nothing is thrown away.

Claude Haiku reads each new item and gives it:

- one of 8 categories
- a sub-topic inside that category
- a one-line summary in English
- 2 to 4 tags
- its language (English or Arabic)
- a sensitive flag

You can then search, filter, read, archive, change the category or tags, add a note, and
add items by hand. Arabic text shows right to left.

Brain then brings things back: **Remind me** and a daily **Resurface**, search by meaning,
**Ask Brain** for answers from your own saves, **Related** saves on each item, and a
**weekly digest**.

**Version 0.2.0 "Memory".** See [CHANGELOG.md](CHANGELOG.md) for what changed.

The full design is in [design/plan/second-brain-plan.html](design/plan/second-brain-plan.html).

## What it looks like

The screenshots below use sample data on a local copy of the app.

![The inbox as a card grid, with the side menu on the left](docs/images/grid.png)
*The inbox. The menu starts with Resurface (with today's count) and the weekly digest,
then Inbox, Unread, All, Archive and Trash. Each card shows who posted it, the sub-topic,
the text, Claude's summary, the category, tags and any reminder.*

![The List layout with an item open in the reading pane](docs/images/reading-pane.png)
*The List layout. A card opens in the reading pane beside the list; j and k move through
it.*

![The ⌘K box with word matches and Ask Brain](docs/images/palette.png)
*⌘K: word matches and things about the same idea, and Ask Brain for a written answer.*

![A Resurface card with Done, Tomorrow and Keep](docs/images/resurface.png)
*Resurface: a few saves a day. Keys 1, 2 and 3 answer.*

![The Remind me menu on an item page](docs/images/remind.png)
*Remind me on an item page: pick when it comes back.*

![A weekly digest with numbered links to the saves](docs/images/digest.png)
*The weekly digest, written by Claude, with numbered links to the saves.*

![One category opened from the side menu](docs/images/category.png)
*One category, picked from the side menu. Arabic posts read right to left.*

![An Arabic item page with its note, category and tags](docs/images/item.png)
*An item page: open the original, archive it, write a note, change the category, add or
remove tags.*

![The Sources page](docs/images/sources.png)
*Sources: Claude sorting with a "Sort now" button, then each source with its status and
setup steps.*

<p>
  <img src="docs/images/mobile-grid.png" width="260" alt="The inbox on a phone">
  <img src="docs/images/mobile-resurface.png" width="260" alt="Resurface on a phone">
  <img src="docs/images/mobile-menu.png" width="260" alt="The side menu open on a phone">
</p>

*On a phone the side menu slides in from the left.*

## Categories

| Category | What goes in it |
| --- | --- |
| AI, Code & Dev Tools | LLMs, agents, prompts, coding tools, open source, Mac utilities |
| Markets, Startups & Finance | SaaS, venture capital, investing, macro and oil, MENA fintech |
| MENA Geopolitics & Society | Egypt, Jordan, the Gulf, Palestine, investigative threads |
| Cinema, Gaming, History & Culture | Film, games, books, history, art, calligraphy |
| Health, Biotech & Longevity | Health, fitness, sleep, nutrition, biotech |
| Menswear, Design & Travel | Tailoring, style, architecture, design, places to go |
| Viral Threads & Internet Culture | Memes, viral stories, social commentary, humor |
| Models, Pop Culture & NSFW | Celebrities, models, pop culture, sensitive content |

The categories live in the `categories` table, so you can rename or add them.

## The web app

The app is in `web/`. It is a Next.js 15 app that runs on Cloudflare Workers through
OpenNext.

- **Data:** Cloudflare D1 (SQLite), database `digital-brain`. The schema is in
  `db/migrations/`. Search uses an FTS5 index over the title, note, summary, author,
  handle and text. It handles English and Arabic alike, and matches word starts.
- **Files:** photos and screenshots go in R2, bucket `digital-brain-files`, and are served
  at `/files/<id>` only to you and your iPhone app.
- **Sign in:** Better Auth with email and password, plus Google (and Apple) when their
  keys are set. The archive is private: `ALLOWED_EMAILS` lists who may make an account.
  Without it, only the first account can be made.
- **One link, one item:** the same link saved from two places becomes one item with two
  saves, so you can see every place you saved it.

What you can do in it:

- **Inbox, Unread, All, Archive, Trash:** new items land in the inbox with an unread dot.
  Opening one reads it; Mark unread brings the dot back.
- **Search** by word, @handle or topic, in English or Arabic.
- **⌘K** (or `/`) opens one box for everything: word matches, then things about the same
  idea (search by meaning), then **Ask Brain**, which answers a question from your own
  saves and cites them as [1], [2].
- **Resurface:** a few saves each day. Ones you asked to see again with **Remind me**
  (Tomorrow, This weekend, Next week, Next month or a day you pick), then ones from this
  day in past years. Keep brings a card back later and then less often; Tomorrow brings it
  back tomorrow; Done lets it go. Keys 1, 2 and 3 answer.
- **Weekly digest:** every Sunday evening Claude writes a short note on what you saved
  that week, grouped by theme, with links to the items. "Write this week's now" makes one
  at once.
- **Related:** each item page lists saves about the same thing.
- **Reading pane:** in the List layout a card opens beside the list. `j` and `k` move,
  `e` archives, `u` marks unread, `Esc` closes.
- **Filter** by category and sub-topic, tag or source, by language (English or Arabic), by media (with
  pictures or text only) and by the sensitive flag. Sensitive pictures are blurred until
  you turn the blur off.
- **Grid or list** layout.
- **Item page:** read the full text and pictures, see where and when you saved it, write a
  note, set the category, add or remove tags. Tags you add look different from the ones
  Claude suggests; press ✓ to keep a suggestion.
- **Add by hand** at `/add`: a link (the title and picture are filled in from the page), a
  note, tags, and a photo or file up to 10 MB.

## Sources

Each source shows its status on the Sources page (`/sources`).

| Source | How it connects today |
| --- | --- |
| X | Click Connect X on the Sources page. Brain pulls new bookmarks from the X API on Sync now and every six hours, and stops at the first page it has already seen. Older bookmarks can come from an export file with `npm run import:x` (see below). |
| Feedly | Each article you save for later reaches Brain through an IFTTT webhook. The Sources page shows the link and the body to paste into IFTTT. |
| YouTube | Its own Google connection with read-only YouTube access. Tick Liked videos and any of your playlists on the Sources page, and Brain brings in those, then checks again every six hours. Needs the Google keys. |
| Instagram | Upload Instagram's "Download your information" export (the zip or `saved_posts.json`) on the Sources page. Instagram gives only the link, the account and the date. You can also share a post to Brain from the iPhone share sheet. |
| Screenshots | The iPhone app sends your Screenshots album. Claude looks at each picture to sort it. |
| Added by hand | The `/add` page, or "Save to Brain" in any iPhone app. |

Feedly and other tools post to `/api/ingest/<source>?key=...`. The key is made for you
and shown on the Sources page. Keep it private.

### Import X bookmarks you already exported

The older `x-bookmark-manager` and `x-bookmarks-review` repos hold JSON exports. Import
one or both. Running it again is safe: bookmarks already there are skipped.

```sh
cd web
npm run import:x -- ../../x-bookmark-manager/bookmarks_export.json ../../x-bookmarks-review/bookmarks_db.json
```

Add `--remote` to load them into the real D1 database, and `--status read` to keep them
out of the inbox.

## Claude sorting

Claude Haiku sorts items in batches of 20. It reuses sub-topics already in use so they
stay tidy, and it never overwrites a category, sub-topic or summary you already have.

- New items from Feedly, the `/add` page, the share sheet and screenshots are sorted as
  they arrive.
- **Sort now** on the Sources page sorts everything still unsorted and shows progress.
- A timer in `web/worker.ts` runs every six hours. It syncs YouTube, sorts up to 10
  batches of unsorted items, reads new and changed items for search by meaning, and on
  Sunday's 18:00 UTC run writes the weekly digest.

Sorting needs the `ANTHROPIC_API_KEY` Worker secret. Without it, items still save, and
the Sources page says "Needs API key".

## Search by meaning

Search by meaning, Related and Ask Brain use Workers AI (`@cf/baai/bge-m3`, which reads
English and Arabic) and a Vectorize index called `digital-brain-items`. Each item is read
once after it is saved or sorted, and again when its text changes. The deploy makes the
index the first time. Without the index (for example in `npm run dev`), these fall back to
word search.

## The app API

The iPhone app talks to `/api/app/*` with a `Bearer brn_…` key from `/connect-app`. The
same routes work from a signed-in browser. Every route checks its input with zod
(`web/src/lib/items/schema.ts`) and answers mistakes with a 400 and a plain message.
Unknown fields are refused.

| Route | What it does |
| --- | --- |
| `GET /items` | The list. Same filters as the web page. Page with `cursor` (from `nextCursor`); `page` still works. |
| `GET /items/:id`, `PATCH /items/:id` | One item. PATCH takes `status`, `read`, `trash`, `category`, `note`, `addTags`, `removeTags`, `remindAt` (null clears). |
| `DELETE /items/:id`, `DELETE /items?view=trash` | Delete for good, from Trash only. |
| `GET /items/:id/related` | Saves about the same thing. |
| `GET /resurface`, `POST /resurface` | Today's cards; answer one with `{ id, how: keep, later or done }`. |
| `POST /ask` | `{ q }`, answers from your saves with the items it used. |
| `GET /digest`, `POST /digest` | The latest weekly digests; POST writes this week's now. |
| `POST /save` | A link, a note or a file. |
| `GET /menu`, `GET/PUT /prefs`, `GET /sources`, `GET /unfurl`, `POST /import` | Counts, look, sources, link previews, bulk import. |

## The iPhone app

The app is in `ios/`. It is a SwiftUI app built with XcodeGen, with a share extension
called **Save to Brain** that saves a link, text or picture from any app.

It reads and writes the same cloud data as the web app, so a note, tag or archive on one
shows up on the other. You sign in with the same account as the web, Google included.
Sources and the Claude key are set once on the web and shared. Screenshots from the
Screenshots album and anything shared to Save to Brain go straight to the cloud.
Library opens Resurface and the weekly digest, Search can Ask Brain, and each item has a
bell for Remind me and a list of related saves. See
[ios/README.md](ios/README.md) to build it.

<p>
  <img src="docs/images/iphone-signin.png" width="180" alt="Sign in with Apple or Google">
  <img src="docs/images/iphone-list.png" width="180" alt="Inbox grouped by day">
  <img src="docs/images/iphone-library.png" width="180" alt="Library with Resurface, the weekly digest and Unread">
  <img src="docs/images/iphone-item.png" width="180" alt="Item page with the Remind me bell">
  <img src="docs/images/iphone-settings.png" width="180" alt="Settings with sources">
</p>

Sign in, the inbox, Library, an item and Settings, with made-up sample data.

## Deploys

GitHub is the source of truth. Merge to `main` and it goes live.

- `.github/workflows/deploy.yml` runs on every push to `main`. It applies new D1
  migrations to the real database, then builds and deploys the Worker. It needs a
  `CLOUDFLARE_API_TOKEN` repository secret (Edit Cloudflare Workers template, plus D1
  Edit and Vectorize Edit). It also makes the Vectorize index the first time.
- `.github/workflows/web.yml` runs lint, a typecheck, the unit tests and a build on every
  pull request.

Set Worker secrets once from `web/`:

```sh
cd web
npx wrangler secret put NAME
```

| Secret | What it is |
| --- | --- |
| `BETTER_AUTH_SECRET` | Long random string that signs sessions. Also guards the six-hourly timer. |
| `ALLOWED_EMAILS` | Who may make an account, comma separated. Unset means only the first account. |
| `ANTHROPIC_API_KEY` | Turns on Claude sorting. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional. Shows "Continue with Google" and lets you connect YouTube. |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_APP_BUNDLE_ID` | Optional. Shows "Continue with Apple". |

`BETTER_AUTH_URL` is not a secret. It is set in `web/wrangler.jsonc`.

Redirect URLs to add in Google and Apple:

- `https://<your app>/api/auth/callback/google` (Google sign in)
- `https://<your app>/api/youtube/callback` (YouTube)
- `https://<your app>/api/auth/callback/apple` (Apple sign in)

## Run it locally

You need Node 20 or later. Wrangler keeps a local copy of D1 and R2 in `web/.wrangler`.

```sh
cd web
npm install
cp .dev.vars.example .dev.vars   # then set BETTER_AUTH_SECRET and ALLOWED_EMAILS
npm run migrate                  # makes the tables in the local D1 copy
npm run dev                      # http://localhost:3000
```

Workers AI and Vectorize only run on Cloudflare, so `npm run dev` leaves them off. Run
`BRAIN_REMOTE=1 npm run dev` after `npx wrangler login` to use the real ones.

Open http://localhost:3000, sign up with an email from `ALLOWED_EMAILS`, and add items at
`/add`. Add `ANTHROPIC_API_KEY` to `.dev.vars` to try sorting. Never commit `.dev.vars`.

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run preview` | Builds the real Worker and runs it at http://localhost:8787 |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (input checks, paging, Resurface schedule, digest week, links) |
| `npm run build` | Next.js build |
| `npm run migrate:remote` | Applies migrations to the real D1 database |
| `npm run deploy` | Builds and deploys by hand (the GitHub workflow does this for you) |
| `npm run cf-typegen` | Rebuilds the binding types in `cloudflare-env.d.ts` |

## Repo layout

```
.
├── web/                     Next.js app on Cloudflare Workers
│   ├── src/app/(app)/       Pages: list, item, add, sources
│   ├── src/app/api/         Sign in, ingest hook, timer, YouTube, iPhone app API
│   ├── src/components/      Cards, side menu, forms
│   ├── src/lib/             Database, sorter, sources, auth
│   ├── src/lib/items/       Input checks, item SQL and the one item service
│   ├── src/lib/memory/      Resurface, search by meaning, Ask Brain, weekly digest
│   ├── scripts/import-x.ts  X export import
│   ├── worker.ts            Worker entry and six-hourly timer
│   └── wrangler.jsonc       D1, R2 and timer settings
├── db/migrations/           D1 schema, applied in name order
├── ios/                     iPhone app and "Save to Brain" share extension
├── docs/                    Design doc and README screenshots
├── CHANGELOG.md             What changed in each version
└── .github/workflows/       Deploy on merge, checks on pull requests
```
