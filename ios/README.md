# Brain for iPhone

A SwiftUI app for the same archive as the web app: the side menu, the card list with pictures,
each item's page (note, category, tags, archive), a **Save to Brain** share sheet for any app,
and sending your Screenshots album to Brain so Claude can read and sort them.

It talks to the web app's `/api/app/*` routes. Signing in opens the web page `/connect-app`
in a Safari sheet (so Google, Apple and passwords all work), which hands the app its own key.
The key lives in the Keychain, shared with the share sheet through the app group
`group.com.njarrar.brain`.

## Build

Needs a Mac with Xcode 16 or later.

```sh
brew install xcodegen
cd ios
xcodegen                     # makes Brain.xcodeproj from project.yml
open Brain.xcodeproj
```

In Xcode, pick your team under Signing & Capabilities for both the **Brain** and
**BrainShare** targets, plug in your iPhone, and press Run. A free Apple account works,
but the app then stops opening after 7 days until you run it again from Xcode.

To check it compiles without signing:

```sh
xcodebuild -project Brain.xcodeproj -scheme Brain \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```
