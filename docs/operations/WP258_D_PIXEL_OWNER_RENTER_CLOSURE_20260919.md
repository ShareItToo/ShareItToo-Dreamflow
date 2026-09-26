# WP258-D Pixel owner/renter staging closure — TECHNICAL PASS

## Scope and binding

This package is a non-production, synthetic Staging and Pixel 7 Pro closure
bound to candidate `1.0.0+2026091704`, package `com.shareittoo.app`, source
commit `9cbac5be2e4702c6b11954bfcc935ca38fdb6aac`. No Play, production,
payment, provider, Firebase, cloud/VPS/DNS, OnePlus or PR-merge mutation was
performed.

## Verified matrix

- The existing allowlisted owner and exactly one separately generated,
  allowlisted renter both logged in through the real app/backend path.
- Owner A and renter B had distinct sessions and profiles. B could read the
  public owner listing, but B's private listing surface contained no A data.
  Foreign update was rejected with `403`; foreign delete was rejected with
  `404`; A's listing remained intact.
- Owner listing create, read, update and end-of-life delete semantics passed.
  The ended row remains as audit/retention evidence and was not hard-deleted.
- On the real Pixel UI the owner photo was visible in the Mein-SIT profile
  card, bottom navigation avatar and public profile card. Logout/login and
  process restart preserved the authoritative image. Renter logout/login
  showed the renter profile without A's private state.
- Public catalogue read and `Sonstiges` listing read passed. No payment,
  payout, provider or live-money endpoint was called; the runtime remained in
  test/memory mode.

## Runtime truth and limits

The first authorized profile upload exposed a staging configuration defect:
the API generated an internal container hostname, which the client correctly
rejected as an unmanaged image URL. Staging was corrected to use the external
`staging.shareittoo.com/api/v1` base URL, while preserving the same Green
network, upload volume and MFA secret mount. The mount remained mode `0640`
with the runtime group binding; secret contents were never read out.

This closes the Pixel owner/renter smoke boundary only. Message-surface avatar
parity, push delivery, real booking/payment, provider activation and OnePlus
evidence remain separate work. The source-side restart hydration correction is
tracked by WP259-A and is not retroactively claimed for immutable candidate
1704.

Evidence: `docs/evidence/release-readiness/wp258-d-pixel-owner-renter-closure-20260919.json`.
