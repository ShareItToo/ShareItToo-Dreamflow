# WP35 Pixel message-refresh candidate 2026090610 preparation

Status: **PREPARED FOR SOURCE FREEZE**. The corrected candidate still requires
the complete rollover regression, signed archive, data-preserving Pixel update
and exact two-role replay before physical closure is claimed.

## Reproduced finding and correction

The signed `2026090609` two-role Staging journey was run twice with isolated,
disposable fixtures. Publication, public discovery, the non-binding request,
foreground/background/terminated FCM delivery and both role-specific product
surfaces completed. The renter's final message surface then failed closed with
the shipped safe load-error state; it did not show empty, stale or successful
message truth.

The primary remote message-thread read wrote its cache through the generic
preference writer. That writer announced a communication change, while the
messages screen listens for that same change and starts another remote read.
The already-established read-only cache-write rule existed but was not wired
to this primary path. The correction routes the remote result through the
message-thread persistence helper with read-only announcements disabled. A
source-wiring ratchet now prevents a return to the recursive path, and the
physical diagnostic reports only sanitized surface counts on failure.

## Candidate reservation

- Branch: `codex/master-workflow-20260808`.
- Clean synchronized base before WP35: `9c6d2dd5865c1a69e538c73a45e187e8e7cdf8db`.
- Reserved identity: `1.0.0+2026090610`.
- Package: `com.shareittoo.app`.
- Installed Pixel build before replacement: `2026090609`.
- API: internal non-public Staging at
  `https://staging.shareittoo.com/api/v1`.
- Candidate source HEAD: the commit containing this preparation.

This is a strictly newer local candidate reservation. It is not a Play Console
version claim and does not supersede the already active Internal release.

## Pre-freeze verification

- Focused Flutter message-thread tests: 16 passed.
- Complete repository-owned Node tool inventory: 2,372 passed.
- Source-hash ratchets: mechanically refreshed; non-hash claims unchanged.
- Secret scan: passed with 23 exact reviewed historical findings and zero new
  high-confidence findings.
- The first complete regression invocation intentionally stopped at the
  strict Store-candidate identity check because it omitted the repository's
  maintained candidate-rollover profile. The validator passes with that
  explicit fail-closed profile; the complete profiled rerun remains required.

## Required closure

1. Commit and push the exact source reservation.
2. Run the complete regression with the maintained candidate-rollover profile,
   then the exact clean-checkout reproducibility gate.
3. Build and owner-privately archive the signed APK/AAB; verify package,
   version, Staging/Firebase envelope, certificate and hashes.
4. Replace-update only the connected Pixel without clearing app data.
5. Re-run the same two-role journey once on exact `2026090610`, verify cleanup,
   owner-session restoration and no protected-vault mutation.
6. Bind sanitized evidence and GitHub Regression/CodeQL to the exact candidate.

WP35 changes no Google Play track or tester, Production, payment, Firebase
Console, provider, Cloud/VPS/DNS, public registration, OnePlus or PR merge.
