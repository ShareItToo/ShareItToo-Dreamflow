# WP18 — current-candidate Pixel listing lifecycle

Status: **COMPLETE ON THE PHYSICAL PIXEL** for exact signed Staging candidate
`1.0.0+2026090506`. Runtime source and diagnostic/evidence changes remain
explicitly separated.

## Exact candidate and correction

- Runtime source HEAD: `d350e3e26f03ec52eac1a86c1cf400148dfd50b1`.
- Diagnostic hardening HEAD:
  `d480221d2bbfe133e0a96148ae5b77e16b3bffd8`.
- Package `com.shareittoo.app`, Internal channel, Staging API, version
  `1.0.0+2026090506`.
- AAB: 109,428,430 bytes, SHA-256
  `f426b7aa2f1e5cdf6e1496946845acb42c796b23103d7c35509b568d5e4d656f`.
- APK: 136,384,989 bytes, SHA-256
  `b42167783b2211e40c71491ea7ffec668881b7c5a4b700ba3ebe08cdfafa1b8b`.
- Canonical signing-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The original Pixel edit reached a structured `400
private_pilot_region_not_allowed`. The editor's asynchronous prefill replaced
the listing's existing accepted city with profile or default location truth.
The correction gives the existing listing city first priority, then explicit
supply prefill, profile and finally an available default. An unresolved city
fails closed. Focused coverage prevents this ordering from regressing.

The signed candidate archive, signature, Firebase binding and compiled binary
privacy report pass. Its update onto the Pixel preserved the previous install,
application data and encrypted-storage identity; no uninstall, reset or
downgrade was used.

## Physical lifecycle proof

Two distinct previously E-mail-verified Staging principals were used. Through
the real Pixel UI the owner edited a fresh draft, published it, paused it,
reactivated it and ended it. Each write was independently confirmed against
the server. Public-catalog truth and renter UI agreed throughout:

- published: visible to the renter;
- paused: publicly absent and absent in three stable settled observations;
- reactivated: visible again;
- ended: publicly absent and absent in three stable settled observations.

The authoritative catalog revision advanced strictly at every lifecycle
transition. Cleanup confirmed the synthetic listing ended and restored the
protected owner session. No booking, contract, reservation or payment was
created. The temporary normalized journey credential copy was deleted; its
protected source remained unchanged.

## Durable diagnostic behavior

Transient success dialogs are feedback, not durable truth. The diagnostic can
continue only from the exact freshly loaded owner item plus mandatory server
truth. Failures now name the exact lifecycle stage without retaining private
data. A partial private journey vault is removed on failure before a listing is
created; after a write it is retained unless cleanup is server-confirmed.

Guest reset and protected-session restoration retry exactly once because both
operations target an idempotent state. Focused tests prove one transient
failure recovers and a persistent failure stops after exactly two attempts.
No timeout was raised, no parallelism was reduced and no assertion was
weakened. This is a bounded deterministic state retry, not a permanent timing
workaround.

## Verification and boundaries

Exact clean R10 at the runtime source passes in an isolated checkout and
produces two byte-identical 231,346,343-byte debug APKs across all 794 entries.
The final diagnostic tree passes 2,284 tool tests, 864 Flutter tests with 33
declared skips, analyzer with zero findings, Web/Wasm, loopback and Android.

Runtime-source GitHub Regression `33981654417` and CodeQL `33981654389` pass.
Diagnostic-head Regression `33986388681`, including its independent clean R10,
and CodeQL `33986388676` pass. Open code-scanning alerts are zero. PR #7
remains Draft, open, mergeable and unmerged.

No deployment, Google Play, tester list, Firebase console, provider, Stripe,
Production, public registration, OnePlus, real money or PR-merge state changed.
