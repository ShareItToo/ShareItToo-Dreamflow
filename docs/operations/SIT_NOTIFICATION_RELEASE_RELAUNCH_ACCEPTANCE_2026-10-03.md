# Notification release-Web/relaunch acceptance — 2026-10-03

## PASS: isolated non-human release harness

Closes the page/browser-relaunch and release-semantic evidence gap left by
`SIT_NOTIFICATION_BROWSER_ACCEPTANCE_2026-10-03.md`, within the explicit synthetic
harness boundary. This is **not** AppRoot, deployed Web, human VoiceOver/NVDA or
provider-delivery acceptance. No new production defect was found or production
file changed. Auth/password/social providers, manifests and foreign capsule were
not edited; no account/device/provider operations, deployment, commit or push.

Binding: `SIT-master-workflow-20260808`, `codex/master-workflow-20260808`, source
base `77478d38ead700f17adbd72bea88f3b4149ca680` plus the new test-support files.
The runner copies the complete current `lib`/assets and required fixture sources,
verifies copy consistency, and records each source hash. Shared files are read
only; the tested copy is frozen before offline build.

## Decisive result

12/12 release-browser stations passed:

1. Only owner booking/message rows; foreign and renter rows absent; unread button semantics.
2. Current CTA opens a real synthetic internal chat (positive control).
3. Actual page reload creates a new harness instance and retains read state without duplicate rows.
4. Chrome closes; a distinct Chrome process with the same owned profile retains read state and semantics.
5. Principal switches to renter: owner detail closes and only renter inbox remains.
6. Captured old owner row/CTA callbacks cannot reopen owner content.
7. Owner replacement session loads only its own inbox.
8. Another same-owner session replacement closes the existing private detail.
9. Old row/CTA replay remains closed even though the chat target exists and is accessible to this principal.
10. Exact local session removal closes detail and leaves no private inbox.
11. Page reload after logout remains unauthenticated and empty.
12. Another new Chrome process after logout remains unauthenticated and empty.

Three distinct browser PIDs; all exited normally (code 0). Every owned group,
profile process reference and CDP port was absent/closed. Temporary checkout,
compiled artifact and profile were removed after verification. The immutable
file inventory and readback remain in the local evidence JSON.

Page network: **55 allowed local asset requests, 0 blocked requests, 0 runtime
errors, 0 CDP-control errors, 0 server rejections**. The same Seatbelt policy was
directly checked: an outbound connect to reserved documentation IP `192.0.2.1`
returned `EPERM`. CDP admits only GETs for hash-inventoried assets on the exact
loopback origin; server rejects other routes. Backend and all social flags are
compile-time false; AppRoot/provider initialization is not invoked.

## Reproduce / evidence

macOS, Flutter 3.41.7 / Dart 3.11.5, Chrome 154.0.8037.93:

```sh
node --test test/tool/notification_release_probe.test.mjs
flutter analyze --no-pub test/support/notification_release_harness.dart
node test/support/notification_release_probe.mjs --run
git diff --check
```

Contract tests 2/2; analyzer and diff check clean. The runner performs offline
locked dependency resolution, `flutter build web --release --no-pub
--no-web-resources-cdn --pwa-strategy=none` and the CDP matrix itself. Full build
arguments, toolchain, source/artifact inventories and cleanup are retained in:

`build/notification-release-evidence/readback-1791035758283.json`

- Evidence SHA-256: `84db68aae2824dde18a57ce2a13018173348dd65f99678f18e003f627a72d993`
- Source-inventory digest: `7e696baf20441ff2f6af539ec578811476793553549d082de67cf55bf67bdc63`
- Artifact-inventory digest: `017861c80df25ab104222a0f54a3579c614890594daa6613b08d7df06bbba939`
- `main.dart.js`: `0aea0cfe8f3ae6493e5f175b982279f410299f347518b5ca5c4398ba7aa0de7a`
- Production notification screen, unchanged: `65069d6aa922acabd7f44f9b3ddf6ef42fbed64d24d102de52c319f8fbb8bf30`
- Harness: `6596622d82213e55f7d2f062746ee259a8d97be5ad0f38d58b15cc35cca59df8`
- Runner: `32962165a6ad1a1c80285fd66f2f4f746162ff3e4a4324af7f4bc5590d924af1`
- Contract test: `5e0095b3dfa74be57fd1a86b53002182edc65ca9cf7d7982b31fcd528acbaee9`

This 12-station readback supersedes the earlier intermediate 11-station local
readback; the latter is not the accepted successor evidence.

## Runner debt and next gate

The default nested Chromium sandbox stalled `Page.enable` on this host. Like
Flutter 3.41.7's own headless launcher, this harness uses `--no-sandbox` and
`--disable-gpu`, while retaining the directly verified outer Seatbelt network
boundary. These are **test-runner flags only**, not release security settings.
The inherited, strictly validated Google plugin-registration isolation is applied
only to the temporary test checkout; it prevents registration-time remote-script
loading. Production source/package graph remains unchanged. These exceptions
limit the claim to the isolated harness, never full AppRoot startup/security.

Next remaining gate: human screen-reader/assistive-technology acceptance on the
intended supported browser/device, followed separately by exact AppRoot/release
and authorized native provider/device delivery acceptance if that broader claim
is required. Do not enable Web Push, FCM or SMTP from this result.
