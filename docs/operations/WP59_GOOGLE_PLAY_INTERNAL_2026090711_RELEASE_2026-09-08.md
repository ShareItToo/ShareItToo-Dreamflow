# WP59 — Google Play Internal release 2026090711

Status: **INTERNAL RELEASE ACTIVE; LOCAL REGRESSION PASSED; EXACT-HEAD GITHUB
EVIDENCE PENDING**.

## Authorized scope and preflight

The current owner instruction authorized continuation from the completed Pixel
closure to the exact Google Play Internal candidate. Before any Store mutation,
the authenticated ShareItToo Play Console was observed on the Internal testing
track. The previous active Internal release was
`1.0.0-internal-2026090204`; no newer or competing release was visible. Open
testing and Closed testing remained unstarted, Production was unavailable and
inactive, and the existing tester list contained two users. No tester identity
is retained in repository evidence.

The owner-only AAB was revalidated immediately before upload:

- package: `com.shareittoo.app`;
- version: `1.0.0+2026090711`;
- source: `c819c5f4445d0b998b2ee319e64f8c95cfb01eda`;
- size: `109599517` bytes;
- SHA-256:
  `a2e72a5afd09e44a20c82d60236e63143d963f7a3ba6ac6e95389e87ce1e3681`;
- upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`;
- minSdk 24, targetSdk 36;
- Internal channel, Staging API and configured Android Firebase client.

The archive manifest binds the exact candidate to
`https://staging.shareittoo.com/api/v1`. The compressed bundle structure passed
fresh validation. No artifact was rebuilt, relabelled or resigned.

## Store action and readback

Only the Internal testing track was changed. Google Play processed the exact
AAB as `2026090711 (1.0.0)`, with API level 24+ and target SDK 36. The device
comparison reported zero newly unsupported devices. The release was named
`1.0.0-internal-2026090711` and received one factual German Internal-test note.

The final confirmation was then applied. Fresh Console readback at
`2026-09-08T16:50:54Z` reports:

- track `Internal testing`: `Active`;
- latest release: `1.0.0-internal-2026090711`;
- delivery state: `Available to internal testers`;
- released on 8 September 2026 at 18:47 Europe/Berlin;
- review state: `Not reviewed` and temporary unreviewed app name;
- tester list: unchanged, one existing list with two users;
- Open testing and Closed testing: unchanged and unstarted;
- Production: unchanged, unavailable and inactive.

Google notes that propagation to Play can usually take up to one hour and can
occasionally take longer. Therefore this package proves the Internal track
state, not successful delivery to the OnePlus. The separate OnePlus Play update
and physical current-build verification remain unexecuted.

## Preserved boundaries and remaining work

No tester entry, tester list, Store listing, Data Safety answer, application
content declaration, package name, signing configuration, Firebase Console,
provider, payment, Production, Open/Closed testing, Cloud/VPS/DNS, public
release, PR merge or device state was changed. The Console still reports an
incomplete Data Safety declaration; it was neither guessed nor edited and
remains a public-release compliance blocker.

The next bounded package is current-candidate OnePlus readiness. It must first
replace the stale `2026082601` assumptions in the existing fail-closed tooling
with exact `2026090711` evidence, then use the Play-delivered installation path.
Direct APK replacement is not acceptable because the local upload certificate
does not prove compatibility with the Play App Signing certificate, and an
uninstall would risk personal-device data loss.

Machine-readable evidence:
`docs/evidence/release-readiness/wp59-google-play-internal-2026090711-release-20260908.json`.

The complete local candidate-rollover regression passes at standard repository
settings through all repository validators, the 909-test Flutter suite, the
mandatory randomized security profiles, analyzer, Web/Wasm, loopback smoke and
Android debug build at minSdk 24. No timing, cache, parallelism or retry
accommodation was introduced. Exact-head GitHub Regression and CodeQL remain
pending until the evidence commit is pushed.
