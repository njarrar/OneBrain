# Brain for iPhone

A SwiftUI app that keeps your saves on the phone. It has the same side menu, card list with
pictures, item page (note, category, tags, archive) and filters as the web app, and a
**Save to Brain** share sheet for any app.

## Where the data lives

Everything sits in one SQLite file (with full-text search) and a `files` folder, inside the
app group `group.com.njarrar.brain`, so the app and the share sheet use the same data.
iPhone backup and iCloud Backup copy it. Nothing goes to the web app.

Keys stay in the Keychain on the phone: the Google and X sign-in tokens and your Anthropic key.

## Sources

| Source | How it comes in |
| --- | --- |
| X | Connect X in Settings. Brain reads your newest bookmarks from the X API (X allows 800) every six hours when you open the app. |
| YouTube | Sign in with Google (or Connect YouTube), then pick the playlists you want, plus Liked videos. |
| Instagram | Import `saved_posts.json` from Instagram's data download, or share a post to Save to Brain. |
| Screenshots | Turn on Add new screenshots. Brain copies new ones from the Screenshots album. |
| Anything else | Share it to Save to Brain. |
| The web app | Settings, Copy from the web app, once. It copies your saves with their categories, tags and notes. |

Claude (Haiku) sorts new items into the eight categories, with a sub-topic, summary, tags,
language and a sensitive flag. It uses your own Anthropic key, saved in Settings. The item's text,
and the picture for screenshots, go to Anthropic for this.

## Setup

`Shared/Config.swift` holds two client IDs. They are not secrets.

- `googleClientID`: a Google Cloud OAuth client of type iOS, bundle ID `com.njarrar.brain`,
  with the YouTube Data API v3 turned on.
- `xClientID`: the OAuth 2.0 client ID of an X app of type Native App, with callback `brain://x`.

Sign in with Apple needs a paid Apple Developer account.

## Build

Needs a Mac with Xcode 16 or later.

```sh
brew install xcodegen
cd ios
xcodegen                     # makes Brain.xcodeproj from project.yml
open Brain.xcodeproj
```

In Xcode, pick your team under Signing & Capabilities for both the **Brain** and
**BrainShare** targets, plug in your iPhone, and press Run.

To check it compiles without signing:

```sh
xcodebuild -project Brain.xcodeproj -scheme Brain \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```
