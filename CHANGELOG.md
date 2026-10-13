# Changelog

Versions cover the web app (`web/`) and the iPhone app (`ios/`) together. Each one is a git
tag, such as `v0.2.0`.

## 0.5.1 (2026-10-13)

- **Add to Brain on the web** works like the iPhone's Add sheet. Pick a **Link**, a **Note**, a
  **Voice memo** (record it in the browser, or pick a recording), up to 10 **Pictures** (each
  its own save) or a **File**. Add a note and tags if you like, and turn **Let AI sort** off
  to sort it yourself. A voice memo with no note takes its recording's name, not "Untitled".
- README: screenshots of the Ask Brain page and the new Add page.

## 0.5.0 "Connect" (2026-10-13)

Brain reads your email and your Pinterest boards, and Ask Brain joins up what's spread
across your saves.

### New, on the web

- **Gmail:** connect on the Sources page. Read only. Brings in your whole history, newest
  first, a slice every six hours (or on Sync now), then new mail. Spam, Trash, Drafts, chats
  and the Promotions, Social and Forums tabs stay out.
- **Outlook:** Outlook, Hotmail and Live mail through Microsoft Graph, read only. Junk,
  Deleted, Drafts and the Other tab stay out.
- Email lands under All and its source, not in the Inbox, and stays out of the weekly
  digest and Resurface, so thousands of emails don't crowd them.
- **Pinterest:** connect on the Sources page. Brings in the pins on your boards, each tagged
  with its board name.
- **Ask Brain page** (`/ask`) with an Ask button in the top bar and the side menu, examples,
  and links from each [n] to the save it cites.

### New, on the web and the iPhone

- **The AI reads everything:** bookmarks, posts, emails and pins too, not only notes,
  pictures and voice memos. It picks out people, dates and labels from each, and reads the
  first picture on a post or pin. This uses the chosen AI's key.
- **Categories grow:** when nothing fits, the AI adds a new broad category (up to 24 in all).
  Email is sorted too.
- **Faster:** the AI work runs every hour; syncing sources stays every six hours.

- **Ask Brain links saves up.** It works out what to look for, searches for each part, then
  searches again for the people it finds. So "what gift should I get my colleague's kids?"
  finds the kids' names in a voice memo, then the screenshots, bookmarks, pins and emails
  about them, and suggests ideas built on them. It says what it looked for under the answer.
- **iPhone: an Ask tab** in the tab bar. Type or say a question, tap an example, or pick a
  recent one. Email and Pinterest saves show with their own marks.
- README: a screenshot of the Add sheet with every option, and of the Ask tab.

### Under the hood

- `web/src/lib/connect/` holds Gmail, Outlook and Pinterest behind one shape. Sign-in goes
  through `/api/connect/<source>` and `/api/connect/<source>/callback`. Tokens are stored
  encrypted.
- Migration `0012_mail_pinterest.sql` adds the three sources.
- New Worker secrets: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `PINTEREST_APP_ID`,
  `PINTEREST_APP_SECRET`. Gmail uses the Google keys.

## 0.4.0 "Choice" (2026-10-02)

Pick the AI that does Brain's work: Claude, ChatGPT or Gemini.

### New, on the web and the iPhone

- **Settings, AI:** choose Claude, ChatGPT or Gemini. The choice syncs, so the web and the
  phone use the same one. It sorts saves, reads voice memos and pictures for people and
  dates, answers Ask Brain and writes the weekly digest.
- **A key for each:** paste an API key per AI. Keys are stored encrypted and shown only by
  their last four characters. Each AI also takes an optional model name.
- **Test:** one small call that says whether the key and model work.
- The web has a new Settings page (design, mode and AI). The Sources page keeps sources,
  sorting and Read now.

Sign-in instead of a key isn't offered: none of the three lets another app use your
account's plan for API calls.

### Under the hood

- `web/src/lib/ai.ts` is the one place that calls an AI. Sorting, reading, Ask Brain and the
  digest all go through it.
- New routes `GET/PUT /api/app/ai` and `POST /api/app/ai/test`.
- Search by meaning and transcription stay on Workers AI, so switching AI needs no reindex.

## 0.3.0 "Listen" (2026-10-02)

Every save of yours now has text Brain can search and ask about, and Claude picks out the
people, dates and events in it. Say "Sara's birthday is 14 March" into a voice memo, and
Ask Brain can answer "when is Sara's birthday?".

### New, on the web and the iPhone

- **Voice memos:** share one from Voice Memos (or any sound or video file) to Save to Brain,
  pick one in the Add sheet's Files button, or speak in the Add sheet: the phone now keeps
  the sound as well as the words. On the web, add a sound file on the Add page.
- **Written out in full:** the server writes out what was said (Workers AI Whisper), in the
  language it was said. Screenshots and photos get the text in the picture read out by
  Claude.
- **What Brain found:** Claude lists the people and the dates in each save (birthdays,
  meetings, trips) and adds labels such as "Birthday" and the people's names. The item page
  shows them, with the transcript, a player for the sound, and Read again.
- **Search and Ask Brain** now use the transcript and the facts, by word and by meaning.
- **Older saves:** notes, screenshots and photos already in Brain are read too, a few at each
  six-hour run, or all at once with Read now on the Sources page.

### Under the hood

- Migration `0011_transcripts.sql` adds `transcript`, `facts`, `text_at` and `text_error` to
  items and rebuilds word search to cover the transcript and facts.
- New route `POST /api/app/items/:id/read` reads an item again.
- `/files/:id` plays sound and video in the page and answers byte ranges, which Safari needs.

## 0.2.1 (2026-09-28)

- **Which build is live:** the web app shows its version, commit and deploy time at the
  bottom of every page, in your own time zone. The iPhone shows its own version, build,
  commit and build time at the bottom of Settings, with the live web app's line under it,
  so a mismatch is easy to spot when reporting a problem.
- New route `GET /api/app/version` returns the web app's version, commit and build time.

## 0.2.0 "Memory" (2026-09-28)

Brain now brings saves back instead of only storing them. Ideas came from the two test
builds, brain-recall and brain-reader, and were rebuilt here so the Sunroom and X-Vault
looks and the duplicate check stay. Pull request #23.

### New, on the web and the iPhone

- **Remind me:** pick Tomorrow, This weekend, Next week, Next month or any day, and the
  save comes back.
- **Resurface:** a few cards a day. First your reminders, then things from this day in past
  years. Keep brings a card back later and then less often, Tomorrow brings it back
  tomorrow, Done lets it go. On the web, keys 1, 2 and 3 answer.
- **Search by meaning:** finds saves about the same idea even when the words differ, in
  English and Arabic.
- **Ask Brain:** ask a question and Claude answers from your own saves, with numbered links
  to the ones it used.
- **Related:** each item lists saves about the same thing.
- **Weekly digest:** every Sunday evening Claude writes a short note on what you saved that
  week, grouped by theme. You can also write this week's at once.
- **Unread:** a view of saves you haven't opened. Opening one reads it; Mark unread brings
  the dot back.

### New on the web

- **⌘K** (or `/`) opens one box for word matches, meaning matches and Ask Brain.
- **Reading pane:** in the List layout a card opens beside the list. `j` and `k` move, `e`
  archives, `u` marks unread, `Esc` closes.
- **Sub-topic filter** inside a category, and the item page shows Category › Sub-topic.
- **Keep a Claude tag** with ✓. Kept tags look like tags you added.

### Changed

- Every app request is checked with zod in one place. A mistake gets a 400 with a plain
  message, and unknown fields are refused.
- All item changes go through one service, shared by the web and the iPhone.
- The list pages by a cursor, so paging stays quick and never skips or repeats an item.
  Older iPhone builds that page by number still work.
- `npm test` runs unit tests, and the pull request check runs them.
- The deploy makes the Vectorize index on its first run. The Cloudflare token needs
  Vectorize Edit and Workers AI Edit.

### Fixed

- The unsorted count no longer counts items in Trash.
- Saving a bare `http://` link shows a message instead of failing.
- App keys are written to the database at most once an hour, not on every request.
- Web uploads allow up to 20 MB. They were stuck at 1 MB.
- `/files` shows only pictures in the browser; other files download.
- Questions to Ask Brain match any of their subject words, so "What did I save about
  Amman?" finds Amman.

### Database

Migration `0010_memory.sql` adds `reminders`, `resurface_log`, `weekly_digests`,
`items.embedded_at` and a `sort_at` column with its index. It only adds; nothing is removed.

## 0.1.0 (2026-09-27 to 2026-09-28)

The first version, pull requests #1 to #22: saves from X, Feedly, YouTube, Instagram and
screenshots; Claude sorting into 8 categories; search, filters, notes and tags; sign in
with email or Google; the iPhone app with the Save to Brain share sheet; cloud sync between
web and phone; the Sunroom and X-Vault looks; one item per link; Trash.
