# Changelog

Versions cover the web app (`web/`), the iPhone app (`ios/`) and, from 0.6.0, the Android app (`android/`) together. Each one is a git
tag, such as `v0.2.0`.

## 0.8.1 (2026-10-31)

### Web
- Moves the web app to Next.js 16 and React 19.3. The Cloudflare build tool no longer
  takes Next.js 15, so 0.8.0 needs this release to deploy.

## 0.8.0 "Keep" (2026-10-31)

Ways to get through what you saved, say why you kept it, and take it with you.

### Web, iPhone and Android
- **Clear the pile.** Every inbox save, oldest first, one at a time, with a count of how
  many are left. **Keep** moves it to the Archive, **Let go** moves it to Trash, **Snooze**
  hides it for two weeks, and **Undo** takes the last call back. The screen moves on at
  once and saves behind you. On the web, keys D, X, S and U do the same.
- **Why I kept it.** After Keep, one tap says why: to use, to learn, to buy, for someone,
  or an idea (keys 1 to 5 on the web). Every item page can set or change it. Ask Brain
  reads it, so "what did I save to buy?" works.
- **Podcast.** Press Make and two hosts, Maya and Sam, talk through the last thirty days
  of what you saved and kept, and push back on each other. Your AI writes the script and
  Workers AI speaks it. It takes about a minute; the script and the saves it covers sit
  under the player.
- **Topic map.** One circle per category, sized by how much you saved in it, with lines
  between categories whose saves share tags. Tap a circle to open it; the main
  sub-topics are listed under the map.

### Web
- **Use Brain in other AIs.** Settings has a new section that makes a connector link.
  Add it as a custom connector in Claude or ChatGPT (or any app that takes MCP
  connectors) and that AI can search your saves, read one in full, see what you saved
  lately and how your topics look, and ask Brain. It can't change or delete anything.
  Each link has its own key, and you can remove one alone. A connector key never opens
  the app's own routes.
- The menu has Clear the pile (with its count), Podcast and Topic map.

### Server
- Migration `0013_pile_podcast.sql` adds `items.kept_why`, `items.snoozed_until` and a
  `podcasts` table. Episodes are kept in R2 under `podcasts/`.
- New routes: `/api/app/pile`, `/api/app/map`, `/api/app/podcast`,
  `/api/app/podcast/<id>/audio` and `/api/mcp/<key>`.

## 0.7.0 (2026-10-13)

A design pass on the phone apps, from a review of the iPhone app.

### iPhone and Android
- **Search and Ask Brain are one tab.** Saves that match show as you type, and the top row,
  **Ask Brain**, turns the same words into an answer. Before you type it shows recent
  questions and questions built from your own saves, so the first tap finds something.
  The tab bar is back to three tabs: Inbox, Library and Search.
- The search box at the top of the Inbox is gone; the Search tab does that job.
- Text follows the phone's text size setting, and rows and chips grow with it.
- A small buzz when you save, archive, delete, add a tag or set a reminder.
- Inbox: the X chip shows the X logo alone, and the unread dot sits before the name.
- Item: Remind me moves into the More menu, Delete asks first, and "Add a note" no longer
  looks greyed out.
- Add sheet: the tags box has a label, "Let AI sort" and "Add tags" look the same, every
  attach button has the same weight, and the iPhone sheet opens just tall enough.
- Library: no Inbox row (it has its own tab), a new Unread icon, and long category names
  take two lines.
- Sign in shows the app icon and a line on what Brain does.
- Counts read "1 screenshot", not "1 screenshots".
- Corners follow one rule: swatches 2, tag chips 6, fields and tiles 12, cards 16, pills round.

### iPhone only
- The system tab bar (Liquid Glass on iOS 26, shrinks while you scroll), with Search in its
  own place on the right. **+** sits at the top right of Inbox and Library, so it never
  covers a row.
- Inbox, Library, Search and Settings use the system large title, which shrinks as you
  scroll; on iOS 26 the count sits under it.
- Needs iOS 18 or later.

## 0.6.2 (2026-10-13)

### Web
- A sync you start by hand, and an Instagram import, now read, sort and index the new saves
  for search right away, not only sort them.
- A file sent with no type is named by its ending, so a video plays as a video and a picture
  shows as a picture. A voice memo or file saved with no title takes its file name.
- Add page: paste a screenshot to add it as a picture, remove a recording before saving, and
  a failed upload of several pictures retries only the ones still left.

### iPhone and Android
- **No category** in the category menu clears an item's category.
- **Read again** in the item's more menu.
- An item leaves a category or tag list as soon as you change its category or tag.
- A **Save** button beside the AI model name, so an edit isn't lost when the keyboard closes.
- Saving several pictures again after a failure doesn't save the first ones twice.
- Videos stored as plain data play as videos; files show their own label and icon.

### Android only
- Voice memos, emails, pins and files show their own label and icon.
- "Text in the picture" vs "What was said" now follows whether the save has sound.
- Picked or shared files find their type from the file name, and an unreadable file says so
  instead of "too big".
- Lists opened from a filter no longer share state, and the voice player frees itself when a
  file fails to load.

## 0.6.1 (2026-10-13)

- On a phone, the Ask Brain page no longer runs off the right edge; long source titles shorten
  instead.
- README: each desktop screenshot now has the same page on a phone beside it.

## 0.6.0 "Android" (2026-10-13)

### New

- **Android app** (`android/`), written in Kotlin with Jetpack Compose. Sign in, browse and
  search your saves, open one, Ask Brain, and add a link or note, or share one from any app.
  Each push builds an APK; get it from the Android run on the Actions tab.

### Fixed, on the web

- New saves from the iPhone's bulk import, the share menu and ingest hooks are now read
  (text in pictures, what was said) before they are sorted and searched, not only sorted.
- Gmail and Outlook new-mail checks pick up where they stopped, so a large batch of new mail
  is no longer skipped. Pinterest remembers how far it got on each board.
- A file saved with a link keeps the link. The phone's file upload keeps its title, link and
  reminder.
- Instagram links with a username in them (`instagram.com/name/p/...`) import, and a post seen
  twice keeps its author and date.
- Merging copies keeps reminders, transcripts and facts, and the merged save is searched again.
- Large batches of reading, embedding and Trash emptying no longer hit the database's limit on
  how many ids one request can hold.
- Reading stops only when nothing is left, not when one batch fails; Read again also sorts.
- The AI may name a new category oddly, or the list may be full: those saves now go to
  **Other** instead of staying unsorted for good. At most 4 pictures go with each sorting batch.
- X and YouTube sign-in tokens are now stored encrypted, like the rest.
- Voice memos and videos play from any point (range requests), and odd ranges get a proper error.
- Signing in from a phone keeps the phone's name on its key, even when you weren't signed in
  on the web yet.
- "What was said" shows for any save with sound, and "Text in the picture" for the rest.
- The Read and Sort panels show the right count after the page updates.
- Digest errors name the AI you picked.

### Fixed, on the iPhone

- Screenshot sync waits for the full picture, not the blurry draft Photos sends first.
- Voice memos no longer leave a stale "finished playing" watcher behind.
- Voice memos, emails and pins show their own icon, and sound files saved as plain data still play.

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
