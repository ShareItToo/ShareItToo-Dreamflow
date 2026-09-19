# WP67 — Staging, Pixel and cross-device runway

Status: **PIXEL AND STAGING COMPLETE; ONEPLUS USB AUTHORIZATION PENDING**.

## Exact runtime and candidate

Staging now runs exact technical HEAD
`78c663248aec089b08d19fd0fb40a9a63f19408b`, version
`0.1.0-78c663248aec`, from a hash-verified checkout and image
`sha256:1bed9028b4f49dc33bc8d82aefdaf11775d5a040b3bc1d0fb99bd73efba8e719`.
API, PostgreSQL, mail and FCM are healthy. Readiness is degraded only by the
two already known noncritical Support deadlines. Payment remains memory-only
and non-live. Listing AI remains mock, externally disabled and budget zero.

The immutable Android candidate is `com.shareittoo.app`
`1.0.0+2026090904`, source
`12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0`. Its APK SHA-256 is
`8c5e02d309f39d808d900c5d8d59a862efbf9d1928a6baacf7fc2d7e2b62b8e4`,
AAB SHA-256 is
`fcc6c36055a978ffb3c70761f2630d942c8e65ac30c9600f3963be48b7d56696`
and canonical upload-certificate SHA-256 is
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

## Physical Pixel proof

The Pixel 7 Pro received a data-preserving update from `2026090902` to exact
`2026090904`; application data, first-install identity, package and signature
were preserved and verified. The authenticated surface matrix passes.

The real Staging test then passed:

- distinct email-verified owner and renter principals;
- Pixel UI listing publication and server-confirmed public discovery;
- non-binding request and acceptance, chat and A-to-B isolation;
- FCM foreground, background and terminated-process delivery;
- image attachment, two-party handover/return time confirmation and restart
  persistence;
- exact-location disclosure blocked before its server-authorized window;
- idempotent rental-cart insertion, project creation/assignment, restart
  persistence and principal isolation;
- cancellation, listing retirement, fixture cleanup and protected-owner
  restoration.

The notification capture showed the ShareItToo icon but also unrelated
personal notifications. It was deleted immediately after visual review and
cannot be recovered from this package; only its non-sensitive content hash was
used during the private check.

## Deterministic cart measurement

The first cart lifecycle attempt missed the two-second success toast. An
unchanged immediate replay passed the entire flow, including exact server
state and cleanup. Inspection showed that the test waited 650 ms before
starting a potentially cold UIAutomator hierarchy dump, allowing the dump
itself to consume the toast's complete visibility window. This was test timing,
not accepted as a permanent retry prerequisite.

Commit `8f671e5a3a5ec6f3e4abed929e9e1212565fcf6f` starts the first hierarchy
probe within 75 ms and permanently tests that bound. Ten focused tests, all
2,488 tool tests and a fresh complete physical cart/project replay pass. The
app candidate bytes were not changed.

## Legal and binding hold

The physical return/damage lifecycle reached the structured legal hold
`409:v52_contract_documents_unavailable` before creating a contract,
reservation or payment. The connected Drive contains the V5.2 decision
package, but that package explicitly says it is not lawyer-approved and that
real operator/provider facts plus approved immutable snapshots are required
before binding publication. No newer professional snapshot approval was found.
The legal hold remains correct and was not bypassed.

## OnePlus runway

The exact APK was transferred privately from the Mac mini to the MacBook by
Tailscale Taildrop. The MacBook received it into an owner-only temporary
directory and independently verified the exact APK SHA-256. A OnePlus is
physically visible to ADB, but the device has not authorized USB debugging.
Therefore no install, package read, app launch or cross-device journey was
performed. Once the unlocked device confirms the USB-debugging prompt, the
MacBook can immediately perform a data-preserving update, verify the candidate
and execute the full OnePlus-to-Pixel matrix without rebuilding or using
Google Play.

No Production, Google Play, tester list, Firebase, external AI, payment
provider, real-money, public-registration, DNS or PR-merge state changed.
Machine-readable evidence:
`docs/evidence/release-readiness/wp67-staging-pixel-cross-device-runway-20260909.json`.
