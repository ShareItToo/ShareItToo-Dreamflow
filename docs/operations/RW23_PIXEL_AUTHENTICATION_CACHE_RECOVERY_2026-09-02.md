# RW23 Pixel authentication-cache recovery

Status: **CLOSED / PIXEL VERIFIED / A-TO-B ISOLATION PASSED** on
02.09.2026.

## Trigger and root cause

The first authenticated Pixel-only smoke after RW22 established a valid
Staging session, but post-authentication profile hydration failed while
strictly decoding a malformed legacy `users` cache record. The UI therefore
remained on the login form even though the server session could already be
valid. The old generic network message did not distinguish this local
post-authentication failure from a rejected or unreachable login.

The strict decoder is an account- and privacy-protection boundary and remains
the default. RW23 adds one opt-in recovery path only after the Backend has
returned the authoritative current profile during authentication hydration.
That path replaces the malformed local cache with the authenticated profile;
ordinary reads and local mutations still fail closed and the focused test
proves that the strict default leaves the malformed bytes unchanged.

If any later post-authentication step fails, the login screen now clears only
the exact completed session owner and verifies the resulting clear receipt
before presenting `Anmeldung nicht abgeschlossen`. A successor session is
never cleared and an A-owned failure is never shown after the principal or
epoch has changed to B.

## Exact implementation and candidate

- Functional and artifact-source commit:
  `1814912b7542a4500626ba4a2909c232cd7b401f`.
- Candidate: `com.shareittoo.app`, `1.0.0+2026090207`, Internal/Staging,
  `minSdk 24`, `targetSdk 36`.
- AAB SHA-256:
  `408d365fc701041fb547999a21a56409cca98bf2debff50180e9f5035fa4e6da`.
- APK SHA-256:
  `c09e4306875feeeabcaac329650afa0bb45856a614f8c9dbccfdaa62389341fa`.
- Upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- The owner-only four-file archive, package/version/SDK identity, canonical
  signature, Android Firebase configuration and binary privacy scan passed.
  No Store upload occurred; the existing Play handoff was deliberately not
  rebound from `2026090206`.

## Regression and reproducibility

Focused profile-cache and principal/epoch wiring tests passed, and the analyzer
remained at zero diagnostics. The unchanged complete local gate passed with
2,027 Node checks, Backend/PostgreSQL, 637 Flutter checks plus three documented
skips, Web/Wasm, loopback smoke and the 448-task Android debug build.

Exact-head GitHub Regression `33671122573` passed all jobs. Its clean-checkout
proof produced a byte-identical debug APK at the same commit. CodeQL
`33671122566` passed and open code-scanning alerts were zero. The separately
authorized publication run `33671914048` repeated the complete proof and
published only the exact commit-labelled API image.

Two earlier local attempts stopped at the fixed capacity ratchet. Only
rebuildable Flutter/Gradle outputs and the superseded private `2026090205`
archive were removed; source, current candidate and retained rollback evidence
were preserved. The unchanged gate then passed locally and on a fresh GitHub
runner, and the signed builder completed its own cold generated-output
lifecycle. The cleanup is incident recovery, not a release prerequisite,
timing accommodation or pass-on-rerun acceptance condition. The recurrence is
retained as an observation under the existing capacity Technical Debt
contracts `TD-RR-012` and `TD-RR-021`.

## Staging and Pixel proof

Staging deployed exact commit `1814912b7542a4500626ba4a2909c232cd7b401f`
and retained deployment evidence at
`/docker/shareittoo/releases/staging-20260902T193030Z-1814912b7542.json`.
Direct container readback returned the same commit and healthy database, mail,
notification, payment-ledger and support-deadline checks. The environment
remains the non-binding Heilbronn pilot with Mail/Push/Payment transports
`memory`, listing AI `mock`, AI budget zero and Stripe `livemode=false`.

The Pixel 7 Pro was updated in place from `2026090206` to exact direct APK
`2026090207`. The first-install marker predates the update, the app-data
container remains present and the installed APK is byte-identical to the
private archive. Without re-entering credentials, the formerly trapped owner
session recovered to main navigation. Authenticated profile access and two
forced-stop cold starts passed.

The bounded role-isolation run then proved owner logout to guest, separate
renter login, renter identity visibility, absence of the prior owner identity,
renter cold-start restoration and final logout to guest. Credentials remained
only in the owner-only vault and neither credentials nor account identities
were emitted or stored as evidence. The final guest run matched the live public
Staging catalog with one listing, showed an explicit load error while Wi-Fi was
off, recovered after validated connectivity restoration and left Wi-Fi on.

## Remaining boundaries

- Real personal-email registration is not proven while Staging mail remains
  memory-only.
- OS push delivery is not proven while Staging push remains memory-only.
- Real contracts, reservations, payments, payouts, refunds, handover, return,
  damage and reviews remain outside the non-binding simulation.
- Production, Play, tester lists, Firebase project state, DNS, public
  registration and PR merge were not changed.
- OnePlus was not contacted or changed.
- V5.2 remains draft-blocked pending independent professional approval and
  approved document snapshots.

The Pixel is left on exact `2026090207`, signed out, online and ready for the
next owner-visible Pixel-only test.
