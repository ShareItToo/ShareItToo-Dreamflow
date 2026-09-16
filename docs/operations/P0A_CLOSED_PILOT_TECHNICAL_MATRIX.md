# P0A closed-pilot technical matrix

Status: technical evidence assembled; overall state remains **HOLD**.

This matrix covers the V2.4 P0A package without activating a pilot. A `passed`
cell means that the current source has local and/or CI technical evidence for
the stated boundary. It does not mean legal, payment-provider, staffing,
signed-binary, physical-device or public-rollout approval.

## Flow and cross-cutting matrix

| Cell | Status | Current technical evidence |
| --- | --- | --- |
| Existing single-item path | passed | Server quote binding, request/acceptance, booking confirmation and secure client confirmation tests |
| Same-owner multi-item path | passed | Disabled group domain, immutable group quote, shared-appointment/item evidence and technical-only UI tests |
| Project cart/planner path | passed | Deterministic planner, real inventory, non-reserving cart, persistence and disabled configuration tests |
| Account lifecycle | passed | Session/security, suspension and legal-hold tests |
| Cancellation | passed | V5.1 timing/amount and private-pilot policy tests |
| Withdrawal | passed | Before/after-handover workflow and application-wiring tests |
| Handover/return | passed | Two-party confirmation, four evidence slots, return timing and policy tests |
| Damage and `needsReview` | passed | Item-specific return review and unrelated-position isolation tests |
| Export/deletion | passed | Account/local inventory, legal-hold, confirmed deletion and retention validator tests |
| Recovery | passed | Restore-readiness and automatic-rollback tooling tests; no live restore was run |
| Payment boundary | passed | Memory/disabled configuration and synthetic payment tests; no real payment or provider traffic |

The focused command is `bash scripts/p0a_closed_pilot_regression.sh`. The full
gate remains `bash scripts/technical_regression_check.sh` plus the complete
backend suite. Both use local/synthetic configuration only.

## Platform matrix

| Cell | Status | Meaning |
| --- | --- | --- |
| Current-source web | passed | Debug build served on loopback and index/manifest smoke checked |
| Current-source Android debug build | passed | Debug APK compiles locally and in CI; this is not a signed release candidate |
| Current-source Pixel 7 Pro | blocked | Device is reachable, but the installed historical app has a different signature; uninstall/forced replacement would violate the data-preservation boundary |
| Historical Pixel evidence | historical | Retained physical evidence proves only the earlier installed build, not the current source head |
| Signed current candidate | not applicable | Signing, upload and Store submission are outside P0A authorization |

No device serial, Android ID or other raw device identifier is stored in the
matrix. The historical installed version fact is metadata only and cannot turn
the blocked current-source cell green.

## Payment and activation boundary

- `realPaymentsEnabled` remains false.
- Production payment transport defaults to `disabled`; staging defaults to
  `memory`; Stripe livemode defaults false.
- No capture, payout, refund or live provider call was made.
- No production, Cloud/VPS, DNS, account permission, Store or signing action is
  part of this package.
- Legal approval, real payment/provider approval, role assignments, delegate
  absence tests, a current-source physical-device result and public activation
  remain separate open gates.

The machine-readable source is
`docs/evidence/p0a/closed-pilot-readiness-matrix.json`; the validator rejects a
greenwashed device cell, missing evidence, live-money drift, hidden blockers or
raw device identifiers.
