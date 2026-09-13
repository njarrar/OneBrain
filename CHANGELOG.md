# Changelog

Versions cover the web app (`web/`) and the iPhone app (`ios/`) together. Each one is a git
tag, such as `v0.2.0`.

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
