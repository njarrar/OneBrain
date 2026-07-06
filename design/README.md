# Design files

Every design file for Brain lives here. App code lives in `web/` and `ios/`.

| Folder | What it holds |
| --- | --- |
| `iphone/` | The iPhone screens from the first canvas "Brain iPhone app" |
| `icons/` | The Pocket app icon masters (SVG), light, dark and tinted |
| `plan/` | The first plan: what Brain does, its sources and its build steps |
| `screenshots/` | Screenshots of the built app: each look on the web and the iPhone, and the Inbox cards |

## iPhone screens


Edit the screens there. `iphone/` is a copy of the canvas files, kept in sync each time a design is settled:

- `canvas.json` places the screens on the canvas.
- One `.dc.html` file per screen: Sign in, Menu, Inbox (`Main.dc.html`), Item, Settings, and Save to Brain (the share menu).

Each screen has a Theme switch with four looks: Sunroom light, Sunroom dark, X-Vault dark and X-Vault light. The files run only inside the canvas, and the sign in screen's icon points at an image stored on the canvas, so open the canvas link to view them.

## Colors

| Look | Page | Card | Line | Text | Soft text | Accent |
| --- | --- | --- | --- | --- | --- | --- |
| Sunroom light | `#FAF7F0` | `#FFFDF8` | `#E6DCC8` | `#2A2620` | `#6F6656` | `#D98F3F` |
| Sunroom dark | `#1C1A16` | `#26231E` | `#3A342B` | `#F3EDE2` | `#AAA08F` | `#E3A459` |
| X-Vault dark | `#0B0F17` | `#151D2B` | `#232F44` | `#F1F5F9` | `#94A3B8` | `#F59E0B` |
| X-Vault light | `#F4F6F9` | `#FFFFFF` | `#DDE3EB` | `#0F172A` | `#5B6778` | `#D97706` |

Type: Space Grotesk for text, JetBrains Mono for handles, dates and counts, IBM Plex Sans Arabic for Arabic (shown right to left).
