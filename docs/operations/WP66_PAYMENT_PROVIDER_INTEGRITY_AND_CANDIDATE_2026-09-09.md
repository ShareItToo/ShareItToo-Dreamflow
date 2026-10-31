# WP66 — payment provider integrity and successor candidate

Status: **COMPLETE LOCALLY; GITHUB VERIFICATION PENDING; STAGING/DEVICE
ROLLOUT PENDING**.

## Why this package was required

The existing payment workflow already failed closed outside the memory-only,
non-live pilot configuration, but provider retries were still coupled to the
current request key and provider events were not bound tightly enough to the
local payment, booking, customer and provider-object identity. A successful
provider call followed by a lost application response therefore needed a
durable replay contract before any Stripe sandbox or real-money exercise.

WP66 now derives opaque, namespaced provider idempotency keys from durable
operation identities. A new client request key after restart either replays the
completed original command or reuses the same provider operation. Checkout
expiry is frozen with the payment row. Missing or expired reconciliation state
never permits a second payment and is reported as requiring reconciliation.
Provider events must match the exact local payment, booking, known customer,
provider object family, transfer group and live/test mode before any state
mutation.

The first signed local successor `2026090903` exposed one last retry edge during
review: its provider line-item title came from an editable listing. Although
payload drift failed closed and could not duplicate a charge, it could prevent
durable recovery after a listing edit. The provider payload now uses a stable
generic booking title. A PostgreSQL integration test performs a real listing
edit between the first checkout and a new-client-key retry, proves the same
payment and URL are recovered, and restores the fixture through the normal
revision-checked listing API. Candidate `2026090903` was never uploaded and is
permanently superseded.

## Exact candidate

The successor is signed Internal/Staging candidate `1.0.0+2026090904`, built
from source commit `12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0` for package
`com.shareittoo.app`, minSdk 24 and targetSdk 36.

- AAB: 109,455,561 bytes, SHA-256
  `fcc6c36055a978ffb3c70761f2630d942c8e65ac30c9600f3963be48b7d56696`
- APK: 136,368,737 bytes, SHA-256
  `8c5e02d309f39d808d900c5d8d59a862efbf9d1928a6baacf7fc2d7e2b62b8e4`
- binary privacy report SHA-256:
  `d5e9c8e9446efa1363d6aac7fde7ac78e49b84a58a24e1e65593e817195f6dc9`
- canonical upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`

Signature, package/version identity, ZIP structure, Bundletool 1.18.1,
Firebase Android configuration, binary privacy and owner-only non-overwriting
archive checks pass. The artifact remains private and is not committed.

## Verification

Twenty-one focused provider/client tests, two isolated PostgreSQL integration
tests and all 2,487 tool tests pass. The complete local technical regression at
candidate-binding HEAD `6dbde0df83cd480398fcf29081dc8095454f88fb`
passes the full Backend, PostgreSQL, Flutter, analyzer, Web/Wasm, loopback and
Android minSdk-24 lanes. Flutter reports 909 passes and 33 declared skips;
the analyzer reports zero issues. No timing, retry, concurrency or cache
workaround was accepted.

## External truth and boundaries

No Stripe call or Dashboard mutation occurred. The Codex Stripe connector
requires reauthentication, while Staging remains memory-only and non-live.
No real money was attempted. V5.2 professional approval and approved legal
snapshots remain open. Staging still runs source
`7a73de4aba2b4ae4d6785e8dfbd466a5ad5aa60c` with client build `2026090902`;
the active Play/Internal build remains `2026090711`, and the Pixel remains on
`2026090902` until the next bounded rollout.

No Google Play upload, tester change, device install, Staging/Production,
Firebase, Cloud/VPS/DNS or PR-merge change is part of WP66. The next package is
WP67: deploy the exact candidate-compatible Backend to Staging, install the
exact APK on the Pixel, and then run the full cross-device OnePlus matrix once
the physical device is unlocked. A lock bypass is never attempted.

Machine-readable evidence:
`docs/evidence/release-readiness/wp66-payment-provider-integrity-and-candidate-20260909.json`.
