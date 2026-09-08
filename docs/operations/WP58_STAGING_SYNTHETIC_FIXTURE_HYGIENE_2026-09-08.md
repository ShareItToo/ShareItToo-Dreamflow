# WP58 — Staging synthetic fixture hygiene

Status: **COMPLETE**.

## Why this package was selected

The exact current Pixel candidate could not continue while the physical phone
was locked. Independent public Staging checks nevertheless reproduced the
historical discovery boundary and found several old `SIT Rollenprüfung`
fixtures still visible. This was higher-value than another broad hardening
pass because it directly affected the catalog the owner will test.

## Safe implementation

The non-binding simulation runner now has a symmetric retirement path. It
accepts only the exact private simulation vault and independently verifies the
server booking as `simulationOnly`, non-contractual, non-reserving,
payment-free and zero-minor before it may cancel it. The exact owned listing is
then paused, verified absent from the public catalog and recorded only in the
owner-only vault.

The feed hygiene runner adds a separate `technical-only` mode. It recognizes a
fixture only when both the strict title prefix and the `sit` plus
`role-fixture` tags match. A non-terminal booking always protects the listing.
Only orphaned matches are paused; nothing is deleted. Any later verification
failure reactivates earlier mutations.

## Applied Staging result

- The one retained non-binding simulation was cancelled through the normal
  participant API and its listing was paused.
- Contract, reservation, payment and monetary effects remain absent.
- Four further publicly visible orphaned technical listings were paused.
- Public Staging now returns zero active listings and zero technical fixtures.
- Three older technical rows remain active but non-public. They have no active
  booking, yet no current authorized owner session exists. WP58 deliberately
  leaves them unchanged instead of using a direct database workaround.
- The post-cleanup Staging foreign-key check passes all 354 constraints.
- Readiness remains HTTP 503 only because of the pre-existing noncritical
  overdue Support update; fixture cleanup did not alter that gate.

No Production, Store, Firebase Console, provider, payment, real-money,
OnePlus, PR-merge or account boundary changed. Sanitized machine evidence is
`docs/evidence/release-readiness/wp58-staging-synthetic-fixture-hygiene-20260908.json`.

## Local closure verification

Fourteen focused WP58 checks pass. The complete supported candidate-rollover
regression also passes with 2,461 repository tool tests, zero analyzer issues,
909 Flutter tests plus 33 declared skips, Web/Wasm, loopback smoke and the
Android debug build and platform-surface checks.

The first complete run correctly rejected a stale privacy source hash after
the simulation runner changed. Refreshing that direct binding exposed the
intended dependent Evidence and validator ratchets. Those hashes were
mechanically propagated through the existing source inventories. The
retirement path adds no personal-data category, retention behavior, provider
decision or gate change, and no validator condition was weakened.

Exact implementation HEAD `11c2bc91eb9f6e9b3fae14423f710b8868c42352`
passes GitHub Regression `34185296223`, including the independent clean
checkout, and CodeQL `34185296219`. Open code-scanning alerts are zero. PR #7
remains Draft, open, mergeable and unmerged.
