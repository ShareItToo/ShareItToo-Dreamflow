# WP79 — current candidate acceptance matrix

Status: **CURRENT PIXEL/STAGING CORE CLOSED; EXTERNAL GATES REMAIN OPEN**.

## Exact scope

WP79 is the conservative requirement-by-requirement acceptance matrix for the
installed Internal Staging candidate `com.shareittoo.app` `1.0.0+2026090905`.
It binds the exact APK and AAB hashes, certificate, candidate source
`e1c182ea496f013989863155c13bfda649255a7e`, Staging runtime
`baf9267c8bff7533230f3234c1f543649df6e4aa`, and the exact current source
security baseline. It makes no device, provider, Store, deployment or account
mutation.

The immediate predecessor to this candidate changed only Android build
metadata, payment-recovery and privacy/retention paths. In particular, the
only changed `app.js` lines add payment-recovery conditions to health and
readiness; they do not modify registration, login, report or block routes.
WP79 therefore preserves predecessor proof only where a requirement's route is
outside that verified delta and no current observation contradicts it. It does
not promote an older provider, privacy, binding-booking or physical-device
assertion merely because the app still builds.

## Current-source parity finding

The strict local candidate regression correctly refused the newer source tree:
after the signed candidate source, the repository gained V5.3 legal assets,
legal Flutter screens and one operational-readiness Backend path. The current
source must therefore never be called the installed candidate merely because
its GitHub checks pass. This is not a flaky test or a permitted workaround.

The full local technical gate then passed for the current source in its
explicit **CI-metadata-only rollover mode**: Backend and deterministic tests,
Flutter analyzer/tests, Web/Wasm/loopback smoke, and the Android debug
minSdk/capacity build are green. This is a source-quality result only; it does
not change the installed-candidate identity or erase the strict parity hold.

WP80 begins with a new-candidate parity preflight. It must prove whether the
current source can be bound to one exact Staging runtime before any signed
successor is built, installed, uploaded or deployed. Until then, the verified
`2026090905` candidate remains the sole physical acceptance target.

## Result

| State | Count | Meaning |
| --- | ---: | --- |
| PASS | 12 | Exact current evidence or safely scoped predecessor evidence exists. |
| PARTIAL | 11 | A real surface or predecessor proof exists, but exact-current coverage is incomplete. |
| OPEN | 9 | A provider, professional approval, human accessibility run, authorized staff action or second device is still required. |

The exact Pixel/Staging core is closed for provenance, FCM, two-role
non-binding marketplace flow, listing lifecycle, themes, restart/offline
recovery, mock Listing AI safety, support simulation, payment integrity and
physical report/block isolation. Current e-mail, password/session, privacy,
Google, search/saved, decline, location, booking-group and permission proofs
are retained as `PARTIAL` where a new exact-candidate replay remains more
truthful than inferring completion.

## Holds

- Facebook and Apple sign-in require their official provider configurations.
- Real image analysis requires a separately approved runtime provider and
  privacy/retention/budget decision; local Codex evaluation is not a runtime
  entitlement.
- Stripe remains memory-only until the official isolated sandbox and read-only
  reauthentication gate are complete. No test funds, refund or payout has run.
- Binding V5.2 workflow remains closed pending professionally approved immutable
  documents and actual operator/provider facts.
- TalkBack needs a human physical traversal; OnePlus remains untouched until
  the Pixel closure is sufficient for the second-device run.
- A reproducible least-privilege private-registry pull and two retained
  noncritical Support deadline updates still require their respective external
  owner/staff facts.
- The V5.3 legal material is draft-only. WP77's public-runtime/source mismatch
  remains fail-closed and is not treated as a Staging or public legal update.

The release decision is **HOLD / NOT PRODUCTION READY**. The machine-readable
matrix is
`docs/evidence/release-readiness/wp79-current-candidate-acceptance-matrix-20260909.json`.

## Next package

WP80 is restricted to source/candidate/Staging parity preflight. It must not
deploy, upload, mutate Stripe, a social provider, Firebase, Store, Production,
DNS, VPS or OnePlus. Independent deterministic work continues while any owner
or professional gate remains explicitly open.
