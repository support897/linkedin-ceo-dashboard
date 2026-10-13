# Store package — LinkedIn CEO Dashboard

This folder wraps the live web app (repo root) with Capacitor 7 for the
Apple App Store and Google Play. The live web app is untouched: the
wrapper serves a verbatim copy of it from `www/`.

## What's here

- `capacitor.config.json` — appId `com.apexwebsitesolutions.linkedinceo`,
  appName "LinkedIn CEO Dashboard", webDir `www`.
- `package.json` / `package-lock.json` — Capacitor 7.4 dependencies.
- `www/` — verbatim copy of the live web app files.
- `android/` — full Android Studio / Gradle project (minSdk 23,
  compile/target SDK 35). Launcher and splash icons generated from the
  app's own icon art. Release signing is wired in
  `android/app/build.gradle`: it signs only when these environment
  variables are set — `KEYSTORE_FILE`, `KEYSTORE_PASSWORD`,
  `KEY_ALIAS`, `KEY_PASSWORD`. No secrets live in this repo.
- `ios/` — full Xcode project (App.xcodeproj, workspace, Podfile),
  ready to open and compile on a Mac or a cloud Mac. No iOS binary is
  included — iOS cannot be compiled on Linux.
- `listing/` — the store listing pack: `LISTING.md` (names,
  descriptions, category, content-rating notes), `RESEARCH.md` (the
  ASO evidence behind the creative), `privacy-policy.html`,
  `icons/`, `make_frames.py` + `screenshots/` (branded frames).
- `ci/build-aab.yml` — GitHub Actions workflow that builds and verifies
  the signed AAB and uploads it as a workflow artifact. Copy it to
  `.github/workflows/build-aab.yml` to enable it (the API token used
  for this repo cannot create workflow files — it lacks the workflow
  scope). The signing secrets it needs (`KEYSTORE_B64`,
  `KEYSTORE_PASSWORD`) are already set on this repo.

## Rebuild the AAB

Option A — CI: enable the workflow above and run it
(Actions → "Build signed AAB" → Run workflow). Download the
`linkedin-ceo-dashboard-aab` artifact.

Option B — local: Node 20+, JDK 17, Android SDK 35.

```
cd store
npm ci
npx cap sync android
export KEYSTORE_FILE=/path/to/linkedin-ceo-upload.jks
export KEYSTORE_PASSWORD=...   # from the local password file
export KEY_ALIAS=linkedin-ceo-upload
export KEY_PASSWORD=...        # same password
cd android && ./gradlew bundleRelease
# AAB: android/app/build/outputs/bundle/release/app-release.aab
```

## Upload keystore (facts, no secrets)

- Alias: `linkedin-ceo-upload`
- File: `~/workspace/linkedin-store-build/secrets/linkedin-ceo-upload.jks`
  on the build VM — **not** in this repo, and it must be backed up
  somewhere safe: if it is lost, the Play listing can never be updated.
- Password: stored only in
  `~/workspace/linkedin-store-build/secrets/linkedin-ceo-upload.password`
  (file permissions 600) and as the GitHub repo secret
  `KEYSTORE_PASSWORD` (the keystore itself as `KEYSTORE_B64`).
  It is written nowhere else.

## What still blocks submission (not building)

1. Apple Developer Program — US$99/yr, unpaid. Enrolment also needs
   Ilse's own ID. Until then the iOS project cannot be submitted.
2. Google Play Console — US$25 one-time, unpaid, plus Ilse's ID
   verification. Until then the AAB cannot be uploaded.
3. On the build VM, local Gradle cannot run: the sandbox blocks raw
   TCP for assistant processes (Gradle's daemon talks over loopback
   TCP), and the repo token lacks the workflow scope for the CI file.
   Either Ilse flips Muse Settings → Permissions → "Other TCP" from
   Deny to Ask, or the workflow file is added via a GitHub web session.
4. Screenshots: branded frames are ready; the real in-app captures
   still need dropping in (see `listing/LISTING.md`).
5. Apple marketing icon: swap the in-project 1024 icon for a true
   1024 export from the original design file before submission.
6. Privacy policy: host `listing/privacy-policy.html` at a public URL
   and paste the URL into both consoles.
