# N26 Pixel phone backend-gate preflight handover

Status: **BACKEND-GATE PREFLIGHT PASSED / CURRENT-CANDIDATE REAL SMS OWNER STEP
PENDING / LIVE GATES CLOSED** on 03.09.2026.

The physical Pixel 7 Pro still has the exact signed Staging candidate
`com.shareittoo.app` `1.0.0+2026090306` installed from source
`9d7e2601dc477cf3ae3d469b65448ce2065375e0`. The installed APK hash and signing
certificate match the private release archive. The candidate remains an
ancestor of the diagnostic source, and all 71 later changed paths are confined
to Backend, documentation, repository tools and their tests; no mobile source
changed after the candidate was built.

The authenticated Staging status endpoint returned the exact enabled backend
state advertising `firebase-phone`. The diagnostic authenticated with the
protected synthetic owner outside Git and revoked the exact short-lived
diagnostic session afterward. It did not expose an address, password, token,
phone number, SMS code, private path or raw device identifier.

This result is deliberately narrower than provider proof. Repository evidence
from 14.08.2026 records that the Staging Firebase Phone provider and Germany-only
SMS region were enabled and that a real SMS and valid code passed on historical
build `2026081403`. N26 did not read the current Firebase Console state and did
not treat the historical SMS as proof for current build `2026090306`.

## Exact remaining owner-assisted phase

Run the existing diagnostic in `request` mode with one owner-only file holding
the German test number. The app presents its consent surface before requesting
one real Staging SMS. If Firebase requires a code, Walid supplies it through the
device while the diagnostic verifies rejection of a deliberately invalid code,
then observes the valid result and its persistence after force-stop/cold start.

No phone number or code is printed, copied from notifications, read from SMS,
or stored in Git. This phase is intentionally not executed unattended. Until it
passes, current-candidate SMS delivery, code acceptance and cold-start
persistence remain `OPEN`, not failed and not inferred.

Implementation commits
`c4b3ee29100474bc4da9bf057b9235d1b7dccbc5` and
`1ad0b40ab3d4d703bca4099eec1e275fad5648a2` make the diagnostic portable to an
explicit frozen private candidate archive, fail on later mobile-source drift,
add a no-SMS preflight, and distinguish the backend-advertised provider from a
direct Console or real-SMS proof.

The first exact Regression run `33750353633` correctly rejected a static
synthetic password-shaped value in the new test fixture. Commit
`0dfcd7760ae87c554d7ff42c40ac86d6f02fb3ab` constructs that value at runtime
and reviews only the exact immutable historical finding; the scanner rule is
unchanged. Commit `f23d9f90541ac63d50d52c25247831acee5e410b` refreshes the
dependent hash chain through RW20. The final scan recognizes 21 exact reviewed
historical findings and reports no unexpected history or working-tree finding.

The complete local gate passes 2,114 repository tool tests, 797 Backend tests
with two expected no-database skips, PostgreSQL fresh/recovery, 652 Flutter
tests, analyzer zero, Web/Wasm, loopback and Android debug. Exact GitHub
Regression `33751508842`, independent clean checkout and CodeQL `33751508867`
pass; open alerts remain zero. PR #7 stays Draft and unmerged.

No SMS, Firebase mutation, Play change, Production change, payment, KYC, real
money, Cloud/VPS/DNS action, OnePlus action or merge occurred.

Machine-readable evidence:
`docs/evidence/release-readiness/n26-pixel-phone-backend-gate-preflight-2026090306.json`.
