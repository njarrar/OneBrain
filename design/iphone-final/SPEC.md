# Brain for iPhone: final design spec

Source: the owner's design project, file "Brain iOS.dc.html" (exported 2026-09-28).
This folder holds the file itself (`Brain iOS.dc.html`, open it next to `ios-frame.jsx` and `support.js`), this spec, the Pocket icon (`pocket-light.svg`), and `web-reference/Brain Redesign.dc.html` (the matching web redesign, for reference only).
`uploads/` holds what came in the owner's zip: four PNG shots of the web redesign with the owner's comment pins, and a 7-page PDF of shots. They add no iPhone screens.

Design summary, in the owner's file: "The web redesign carried to iOS: a tab bar replaces the side menu, swipe replaces the action buttons, Add and Save to Brain share one capture sheet, and deleted items go to Trash until you empty it."

Frame: 402 x 874 pt (iPhone 17/18 Pro size). Status bar and home bar come from the system.

## Looks

The design has one look with a Light/Dark switch, and a Sky or Amber accent (Sky is the default). That gives four looks: Light Sky, Dark Sky, Light Amber, Dark Amber. It replaces Sunroom and X-Vault. Settings shows only Light and Dark; the accent is a design tweak, so ship Sky and keep Amber as a value in code.

### Accent

| Token | Sky light | Sky dark | Amber light | Amber dark |
| --- | --- | --- | --- | --- |
| acc (fills, toggles, FAB) | oklch(0.55 0.14 245) | oklch(0.78 0.11 230) | oklch(0.76 0.14 72) | oklch(0.80 0.13 72) |
| acc-text (links, labels) | oklch(0.50 0.14 245) | oklch(0.78 0.11 230) | oklch(0.50 0.12 60) | oklch(0.80 0.13 72) |
| acc-ink (text on acc) | #ffffff | #07121a | #1a1203 | #1a1203 |
| acc-soft (tinted pills) | acc at 12% | acc at 14% | acc at 12% | acc at 14% |

sRGB for SwiftUI (converted from oklch): Sky acc #0077BD, acc-text #0068AD, dark #64C4F0. Amber acc #E7A13C, acc-text #934F00, dark #F1AF57. Red light #D73337, dark #F47A79.

### Neutrals

| Role | Light | Dark |
| --- | --- | --- |
| Page | #ffffff | #0e1013 |
| Grouped page (Library, Settings) | #f4f5f7 | #0e1013 |
| Card / group | #ffffff | #15181c |
| Fill (search field, chips) | #f1f3f5 | #1d2127 |
| Image placeholder | #f0f2f4 | #15181c |
| Border | #e7e9ec | #23272e |
| Divider | #eef0f2 | #23272e |
| Ink | #16191d | #e9ecef |
| Ink 2 (body) | #2e343b | #e9ecef |
| Soft text | #5c6570 | #9aa3ae |
| Faint text | #6b7480 | #7c8591 |
| Chevron | #9aa0a8 | #7c8591 |
| Dashed tag border (suggested) | #cfd4da | #23272e |
| Icon | #16191d | #c9ced4 |
| Selected segment | #ffffff | #2a2f37 |
| Red (delete, empty) | oklch(0.58 0.2 25) | oklch(0.72 0.15 22) |

### Category colors

Swatch = oklch(0.62 0.09 H), a 7 pt square with 2 pt corners.

| Category | Hue | sRGB |
| --- | --- | --- |
| AI, Code & Dev Tools | 235 | #4A8FB5 |
| Markets, Startups & Finance | 150 | #5D9669 |
| MENA Geopolitics & Society | 45 | #B37458 |
| Cinema, Gaming, History | 20 | #B67070 |
| Health, Biotech & Longevity | 175 | #419883 |
| Menswear, Design & Travel | 90 | #9B8442 |
| Viral Threads & Internet | 305 | #9378B2 |
| Models, Pop Culture & News | 355 | #B16F89 |

## Type

- Text: Figtree 400/500/600/700. Bundle it, or fall back to SF Pro.
- Handles, times, counts: JetBrains Mono 400/500.
- Arabic: IBM Plex Sans Arabic 400/500, right to left (`dir=auto` per text block).

| Use | Size / weight |
| --- | --- |
| Screen title | 32 / 700, with a mono count after it in soft text |
| Section header (Today, Yesterday) | 13 / 600, soft |
| Row author | 15 / 600 |
| Row text | 15 / 400, 2 lines, line height 1.4 (Arabic 1.65) |
| Row time | mono 12, faint |
| Category label | 12.5 |
| Item body | 19 / 400, line height 1.5 (Arabic 1.8) |
| Chip | 14 / 500 |
| List row | 16 / 400, min height 48 |

## Icons

Phosphor 2.1.1 in the file. SF Symbols to use:

| Phosphor | SF Symbol |
| --- | --- |
| tray | tray |
| books | books.vertical |
| magnifying-glass | magnifyingglass |
| plus | plus |
| funnel-simple | line.3.horizontal.decrease |
| microphone | mic |
| archive | archivebox |
| trash | trash |
| envelope-simple | envelope (Unread) |
| arrow-square-out | arrow.up.right.square |
| share-network | square.and.arrow.up |
| dots-three | ellipsis |
| sparkle | sparkle |
| caret-left / caret-right | chevron.left / chevron.right |
| arrow-counter-clockwise | arrow.uturn.backward (Restore) |
| image / camera / paperclip | photo / camera / paperclip |
| link | link |
| hash | number |
| note-pencil | note.text |
| text-aa | textformat |
| video-camera | video |
| rss | dot.radiowaves.up.forward |
| gear-six | gearshape |
| sun / moon | sun.max / moon |
| eye-slash | eye.slash |
| plugs | powerplug |
| device-mobile | iphone |
| user-circle | person.crop.circle |
| x-logo, instagram-logo, youtube-logo | keep the brand marks as assets |

## App shell

- A tab bar replaces the side menu. Three tabs: Inbox (tray), Library (books), Search (magnifying glass).
- Tab bar: a glass pill, left 16, right 92, bottom 30, height 62. Light fill rgba(255,255,255,.74) with blur 20 and saturation 180% (use `.regularMaterial` or iOS 26 glass). The active tab gets an acc-soft pill and the filled icon in acc-text.
- FAB: a 62 pt accent circle, right 16, bottom 30, with a plus in acc-ink. It opens the capture sheet (1c).

## Screens

### 1a Inbox

"Inbox. Swipe left to archive or delete."

- Header: padding 60/16/10. Title "Inbox" 32/700 with a mono count. Search field below it: height 40, radius 12, fill, magnifying glass on the left, mic on the right.
- Chips row: height 32, pill, 14/500, with icons (for example All, Unread, a filter chip with funnel). Scrolls sideways.
- List grouped by day: Today, Yesterday, Earlier this week. Plain list style, no cards.
- Row: grid of 36 pt icon / text / meta, padding 12x16.
  - Left: a 36 pt source tile, radius 10 (X, Instagram, YouTube, RSS, Screenshot and so on).
  - Unread: an 11 pt accent dot.
  - Author 15/600, time in mono 12 on the right.
  - Text 15, 2 lines max.
  - Optional image 3:2, radius 12, full width of the text column.
  - Category swatch plus label 12.5.
  - Divider inset 64 from the left.
- Swipe left: Archive (acc) and Delete (red). Delete sends the item to Trash.
- Tap a row: open the item (1b).

### 1b Item

"Item. Actions live in one toolbar at the bottom."

- Top bar: a 44 pt back pill "Inbox" (chevron.left), and on the right a pill with Share and More.
- Author: 40 pt round avatar, name 16/600, handle and date in mono.
- Body text 19, Arabic right to left at line height 1.8.
- Image 16:10, radius 14.
- Summary card: sparkle icon and "Summary" label in acc-text, text 15, fill background, radius 14.
- Grouped list, rows min 48:
  - Note: the note text, with "Saved" in faint text when stored.
  - Category, with a swatch and a chevron. Tap to change.
  - Tags: chips with 6 pt corners. A dashed border means a suggested tag from Claude; tap to accept.
  - Saved from: source and date.
- Bottom glass toolbar with four actions: Open (arrow-square-out), Unread (envelope), Archive (acc), Delete (red).

### 1c Add (capture sheet)

"Add. One field for links, notes, photos and voice."

- Sheet with 28 pt top corners and a grabber. The inbox shows behind at 50% opacity.
- Header: Cancel, "Add to Brain", and a Save pill in acc.
- One free text field. Paste a link or type a note.
- When the text holds a link: a link preview card, and a "Link" badge that shows the detected type.
- Chips: "Let Claude sort" (on by default) and "Add tags".
- A row of 44 pt round buttons: photo, camera, mic, paperclip.
- The keyboard shows on open.
- Save to Brain in the share menu (1e) uses the same layout.

### 1d Library

"Library. Views, categories and sources in one place."

- Grouped page (#f4f5f7), groups in white with 16 pt corners. Title "Library" 32/700. A gear button at the top right opens Settings.
- Views: Inbox, All saves, Archive, Trash, each with a count.
- Categories: the eight categories, each with its swatch and count.
- Sources: Screenshots, Audio notes, Videos, YouTube, X, Instagram, RSS, Notes, Text, Links, each with its icon and count.
- Every row has a chevron and opens a filtered list in the Inbox style.

### 1e Save to Brain (share sheet)

"Save to Brain, from the share sheet in any app."

- Sheet with 34 pt corners, inset 8 from the screen edges, over the host app.
- Header: the Pocket icon, "Save to Brain", a close x.
- Preview card: source icon, author, handle, 3 lines of text.
- Note field.
- Chips: "Let Claude sort" and "Add tags".
- A full-width "Save to inbox" button, height 52, acc fill.

### 1f Trash

"Trash. Deleted items wait here until you empty it."

- Back pill "Library". "Empty" in red at the top right (ask to confirm).
- Title "Trash" with a mono count. Hint: "Swipe to restore an item or delete it forever."
- Rows as in the Inbox, with meta "Deleted from Inbox, today".
- Swipe: Restore (acc) and Delete forever (red).

### 1g Settings (shown in dark)

"Settings, with the Light and Dark switch."

- Appearance: a segmented Light / Dark control, with "Syncs with the web app." below.
- Capture: Sync Screenshots album (toggle), Claude sorting ("Up to date"), Blur sensitive pictures (toggle). Toggles 51x31 in acc.
- Storage: Trash (count, opens 1f), Sources ("Set up on the web").
- Account: name, Sign out in red.

## What changes from the current app

1. Navigation: the side menu (NavigationSplitView) goes. A three-tab bar (Inbox, Library, Search) with a glass look and a floating Add button takes its place.
2. Looks: Sunroom and X-Vault go. One neutral look with Light and Dark, a Sky accent (Amber as a spare), Figtree type, and SF Symbols in place of the current icons. The Light/Dark choice still syncs with the web.
3. Inbox: a plain list grouped by day, with source tiles, unread dots and category swatches, in place of cards. Swipe left to archive or delete, in place of buttons on each card.
4. Item: a bottom toolbar (Open, Unread, Archive, Delete), a Summary card, and a grouped list for note, category, tags (suggested tags dashed) and source.
5. Capture: Add and Save to Brain share one sheet with one field for links, notes, photos, files and voice, a detected-type badge, and "Let Claude sort" and "Add tags" chips.
6. Library: a new tab that holds views, categories and sources with counts, and the Settings gear.
7. Trash (new, needs server work): Delete moves an item to Trash. Trash can restore, delete forever, or empty. The server needs a trash state, restore, and a hard delete, and the web should match.
8. Settings: Appearance (Light/Dark), Capture toggles (Screenshots album sync, Blur sensitive pictures), Claude sorting status, Storage (Trash, Sources on the web), Account.
9. New source types in the Library: Audio notes, Videos, RSS, Notes, Text, Links. Voice notes need a mic capture path.
10. Unread: rows show an unread dot and the item toolbar toggles Unread, so the server needs a read state if it lacks one.
