# Build report — LinkedIn CEO Dashboard store package

Date: 13 Oct 2026 (build VM, Linux). Builder: HQ subagent session.

## Done and verified

- Live app files fetched fresh from this repo (blob shas recorded in
  the build log; the stale local copy was not used) and copied
  verbatim into `store/www/`. Live web app behaviour untouched.
- Capacitor 7.4 project created; `cap add android`, `cap add ios`
  and `cap sync` all succeeded. Android project targets SDK 35,
  minSdk 23; iOS project includes project, workspace and Podfile.
- Launcher icons (all densities, incl. round + adaptive foreground)
  and splash screens generated from the app's own 512 icon;
  Android app name strings set to "LinkedIn CEO Dashboard".
- Upload keystore created locally: alias `linkedin-ceo-upload`,
  RSA 2048, 10950-day validity. Password generated locally and kept
  only in a 600-permission file on the VM + GitHub repo secrets
  (`KEYSTORE_B64`, `KEYSTORE_PASSWORD`, set 13 Oct, verified by list).
  Nothing secret is in the repo or this report.
- Signing wired into the shipped `build.gradle` behind env vars.
- Listing pack written from the live code: descriptions, keywords,
  Business category (both stores), IARC/App-rating notes, and a
  privacy policy that matches what the code actually stores
  (Supabase tables li_posts, li_post_stats, li_freebie_requests,
  li_vault_photos + Storage bucket "vault", li_conversations,
  li_alerts, li_outreach_leads, li_outreach_events,
  li_push_subscriptions; anon key + RLS; no impressions data).
- Addendum (research-grade creative): `listing/RESEARCH.md` holds the
  evidence (AppFollow 1,200-listing review; StoreMaven first-two-
  frames finding; benefit-led frame data; the video evidence both
  ways). Descriptions rewritten from it. **Video decision: none at
  launch** — storyboard kept in LISTING.md for a later A/B test.
  Seven branded frames built by `make_frames.py` at 1320 x 2868.
- 125 files pushed to `store/` via the Contents API and confirmed in
  the push manifest with blob shas (manifest kept on the VM at
  `~/workspace/linkedin-store-build/push-manifest.json`).

## The AAB — built? Not yet, and here is exactly why

Two hard blocks, both proven, neither is the toolchain:

1. **Local Gradle cannot run in this VM.** JDK 17, Android SDK 35 and
   Gradle 8.11.1 are all installed and verified (aapt2 runs). But
   Gradle's daemon talks to its client over loopback TCP, and this
   sandbox redirects raw TCP from assistant processes. Proven with a
   20-line Java socket test: the client receives the sandbox message
   "Other TCP connections is turned off for this assistant…" instead
   of the server's bytes; the daemon fails with
   `IllegalArgumentException: Unexpected type tag 109`. Python and
   Node loopback work; Java's does not. Fix: Muse Settings →
   Permissions → Direct network protocols → other_tcp: Deny → Ask.
2. **CI route blocked by token scope.** The workflow that builds and
   verifies the signed AAB is written and its secrets are set, but
   creating `.github/workflows/build-aab.yml` through the API returns
   403 "Resource not accessible by personal access token" (the token
   has no workflow scope). The file is in the repo at
   `store/ci/build-aab.yml`; one copy in a GitHub web session (or a
   workflow-scoped token) enables it.

So: no AAB file exists yet, no install/run test was possible (no
emulator either — /dev/kvm absent), and nothing here claims
otherwise. The moment either block lifts, the AAB is one command /
one workflow run away, signed with the keystore above.

## iOS

Project files only, ready to compile on a Mac or cloud Mac. No iOS
binary exists and none can be built on this Linux VM.

## Submission blockers (Ilse's, by design of the stores)

- Apple Developer Program US$99/yr unpaid + her ID — submission waits.
- Google Play Console US$25 one-time unpaid + her ID verification —
  submission waits.
- Real screenshot captures to drop into the finished frames;
  1024 x 1024 icon from the original design file; privacy policy
  hosted at a public URL.
