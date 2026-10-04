# WP32 Pixel V5.2 return-case physical lane

Status: **IMPLEMENTATION COMPLETE; PHYSICAL SUCCESS BLOCKED BY THE EXISTING
V5.2 LEGAL-SNAPSHOT HOLD**.

## Scope and immutable candidate separation

WP32 prepares a fail-closed physical Pixel journey for the return-case path
implemented in WP28 and exposed in WP30. It does not modify or rebuild the
installed WP31 candidate `1.0.0+2026090608`, source
`15f7766ef15c0be30cf96a743edc4d62d1a588e3`. WP31 remains the immutable
candidate/install evidence. WP32 owns only its diagnostic, tests and the
truthful blocked result.

Implementation commit `dd0123094188799d433e885448337f5175cbd49d` adds an
isolated, two-role device runner. A successful run must prove both participant
entry points, one private image upload, server acceptance, equal owner/renter
server projections, `needsReview` for both roles, removal of the duplicate
return-case entry point, preservation of general support and restoration of
the protected owner. No account identity, credential, token, fixture ID, raw
device ID or private path may enter its result.

## Safe execution result

The first attempt stopped before any remote or device mutation because the
protected vault used the newer, equally constrained
`email-link-verified-ready-for-login` state. The wrapper now accepts exactly
that state and projects it into a fresh isolated temporary vault. A regression
proves the protected bytes remain unchanged.

The next attempt reached the real Staging booking boundary and received the
structured response `409 v52_contract_documents_unavailable`. No booking,
reservation, contract, payment or return case was created. The preparation
helper verified that no booking appeared for the temporary listing and paused
that listing before returning the original hold. The Pixel evidence file was
removed, the protected owner session was restored and the protected vault
remained unchanged.

This is deliberately not converted into a physical pass. A non-binding
simulation also cannot satisfy WP32: database controls correctly prohibit
contract, payment and V5.2 actual-loss/return-case side effects for simulation
bookings.

## Legal and Drive readback

A connected, read-only Drive search found no newer matching V5.2 legal source
after `02_V5.2_RECHTSMAPPE_PRIVATLAUNCH.pdf`, modified
`2026-08-18T17:51:36.056Z`. That source says it is not professionally approved.
The repository manifest independently remains `draft-blocked`, has no
effective date, reports `not-professionally-reviewed` and forbids activation
and provisioning. The updated Aurelius support packet does not constitute or
claim a professional V5.2 contract approval.

The hold may be cleared only by genuine approved snapshots following the
existing professional-review and provisioning process. No draft content is
promoted, no approval fact is invented and no test-only bypass is added.

## Verification

- Focused WP32 and isolation checks: 32 passed.
- Complete repository tool suite: 2,353 passed, 0 failed.
- Flutter suite: 900 passed with 33 declared skips.
- Analyzer: zero issues.
- Web/Wasm, loopback smoke and Android minSdk-24 debug build: passed.
- Complete local technical regression through the version-2 scoped build
  profile: passed.
- GitHub CodeQL `34048891840`: passed at exact implementation HEAD.
- GitHub Regression `34048891874`: passed all four required jobs, including
  the independent clean-checkout proof, at exact implementation HEAD. The
  guarded API-image publish job was correctly skipped.
- Repository-wide open code-scanning alerts: zero. PR #7 remains Draft, open,
  mergeable and unmerged.

## Boundaries and continuation

No Production, Google Play, tester list, real money, payment/provider,
Firebase Console, external AI, Cloud/VPS/DNS, OnePlus or PR-merge boundary
changed. PR #7 remains Draft and unmerged.

WP32 is safely resumable on the same installed candidate after authentic
approved V5.2 snapshots exist in Staging. Until then, the physical return-case
claim remains `BLOCKED`, while independent non-contract test packages may
continue.
