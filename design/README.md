# Design files

Every design file for Brain lives here. App code lives in `web/` and `ios/`.

| Folder | What it holds |
| --- | --- |
| `iphone-final/` | **The final iPhone design to build.** The owner's design file "Brain iOS.dc.html", its spec (`SPEC.md`) and the matching web redesign |
| `iphone/` | The first iPhone screens from the first canvas "Brain iPhone app" (replaced by `iphone-final/`) |
| `web/` | The web screens from the first canvas "Brain web app" |
| `icons/` | The Pocket app icon masters (SVG), light, dark and tinted |
| `plan/` | The first plan: what Brain does, its sources and its build steps |
| `screenshots/` | Screenshots of the built app: each look on the web and the iPhone, and the Inbox cards |

## The final iPhone design

`iphone-final/SPEC.md` lists the colors, type, icons, each of the seven screens (Inbox, Item, Add, Library, Save to Brain, Trash, Settings) and what changes from the current app. The new design uses one neutral look with Light and Dark and a Sky accent, Figtree type, and a tab bar. It replaces Sunroom and X-Vault, so the colors below apply only to the first canvases.

## The two first canvases

The folders here are copies of the canvas files.

| Canvas | Screens |
| --- | --- |
| Brain iPhone app | Sign in, Menu, Inbox, Item, Settings, Save to Brain, Search, Filters, Add, Tags |
| Brain web app | Sign in, Inbox, Item, Add, Sources and settings, Connect the iPhone app |

Each canvas has three pages:

- **Designs**: one full screen per file (`Main.dc.html` is the inbox). Each has a Theme switch: Sunroom light, Sunroom dark, X-Vault dark, X-Vault light.
- **Wireframes**: the same screens in gray, layout only. Files start with `W`.
- **All four looks**: each screen shown in all four looks side by side. Files start with `L`.

`canvas.json` places the screens on each canvas. On the web canvas, `Sidebar.dc.html` is the side menu that every screen shares.

The files run only inside a canvas, and the app icon on the sign in screens points at an image stored on the canvas, so open the canvas links to view them.

## Colors

| Look | Page | Card | Line | Text | Soft text | Accent |
| --- | --- | --- | --- | --- | --- | --- |
| Sunroom light | `#FAF7F0` | `#FFFDF8` | `#E6DCC8` | `#2A2620` | `#6F6656` | `#D98F3F` |
| Sunroom dark | `#1C1A16` | `#26231E` | `#3A342B` | `#F3EDE2` | `#AAA08F` | `#E3A459` |
| X-Vault dark | `#0B0F17` | `#151D2B` | `#232F44` | `#F1F5F9` | `#94A3B8` | `#F59E0B` |
| X-Vault light | `#F4F6F9` | `#FFFFFF` | `#DDE3EB` | `#0F172A` | `#5B6778` | `#D97706` |

Type: Space Grotesk for text, JetBrains Mono for handles, dates and counts, IBM Plex Sans Arabic for Arabic (shown right to left).
