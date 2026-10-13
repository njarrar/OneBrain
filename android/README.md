# Brain for Android

The Android app for Brain. It does what the iPhone app does: Inbox, Library, Search and Ask Brain,
the Add sheet, each item's page, Settings, and "Save to Brain" in the share sheet. It talks to the
same web app (`/api/app/*`) with the same app key.

Written in Kotlin with Jetpack Compose and Material 3. Needs Android 8.0 or later.

## Install the app from GitHub

Every push to `main` that touches `android/` (and every pull request) builds the app.

1. Open the repository on GitHub and go to the **Actions** tab.
2. Pick **android** on the left, then the latest run with a green tick.
3. Under **Artifacts**, download **brain-android-apk**. It is a zip.
4. Unzip it. Inside is `brain-<version>.apk`, for example `brain-0.6.0.apk`.
5. Get the APK onto the phone (Google Drive, a USB cable, or email it to yourself) and open it.
6. Android asks to allow installing apps from that source (Files, Drive or the browser). Allow it,
   then tap **Install**.

Later builds install over the old one and keep you signed in, because every build is signed with
the same key (`app/debug.keystore`, or a release key if the repository has one; see below).

## Sign in

Tap **Sign in**. A browser tab opens Brain's connect page; sign in with email and password or
Google, then tap **Connect**. The page hands the app its key through a `brain://paired` link and
the app opens on your Inbox. To use another server, tap **Server** under the button first (or
**Settings, Server** later).

## Build it yourself

With Android Studio (Ladybug or newer):

1. **File, Open** and pick the `android` folder.
2. Let Gradle sync. Android Studio installs the Android 15 (API 35) SDK if it is missing.
3. Pick a phone or an emulator and press **Run**.

From a terminal, with the Android SDK installed and `ANDROID_HOME` set (or a `local.properties`
with `sdk.dir=...`):

```sh
cd android
./gradlew assembleDebug      # app/build/outputs/apk/debug/brain-0.6.0-debug.apk
./gradlew assembleRelease    # app/build/outputs/apk/release/brain-0.6.0.apk
```

## A real release key (optional)

To sign with your own key instead of the shared debug key, add these repository secrets
(Settings, Secrets and variables, Actions):

- `ANDROID_KEYSTORE_BASE64`: the keystore file, as base64 (`base64 -w0 release.jks`)
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

A phone with a build signed by the other key has to uninstall it first.

## Where things are

- `app/src/main/java/com/njarrar/brain/data`: the API client, models, app key and settings
- `app/src/main/java/com/njarrar/brain/ui`: the screens, one file each, as on the iPhone
- `MainActivity.kt`: the app, and the `brain://paired` sign in link
- `ShareActivity.kt`: Save to Brain, from the share sheet
