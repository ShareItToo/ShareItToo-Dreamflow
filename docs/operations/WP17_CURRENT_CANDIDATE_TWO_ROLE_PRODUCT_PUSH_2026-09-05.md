# WP17 — current-candidate two-role product and push journey

Status: **COMPLETE ON THE PHYSICAL PIXEL** for the exact signed Staging
candidate. Two consecutive unchanged end-to-end runs pass after one isolated
navigation timing outlier. No permanent timing or test-parallelism workaround
was introduced.

## Exact candidate

- Source HEAD `e18e788c0d04fe6b80e3be2f63b30d5f3719ae7d`.
- Package `com.shareittoo.app`, version `1.0.0+2026090505`, Internal channel,
  API `https://staging.shareittoo.com/api/v1`.
- AAB: 109,426,479 bytes, SHA-256
  `f22168befdbede87ad0b067533c2159077515c1acc644449869593f18de2f8d0`.
- APK: 136,384,989 bytes, SHA-256
  `d20b49764f86bfd2723f598ed8aaf202730168f53b629bd283c5058092615c57`.
- Canonical signing-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Firebase Android is configured and the owner-only signed archive and binary
  privacy scan pass.

The installed Pixel 7 Pro package still reports version code `2026090505` and
version name `1.0.0` after the journey.

## Physical product proof

Two distinct, previously E-mail-verified synthetic Staging principals were
used. The owner created a fresh draft and published it through the real Pixel
UI. The backend confirmed it active and the public catalog exposed it. The
renter discovered it, submitted the explicitly non-binding pilot request,
and the owner accepted it. Both roles displayed the required
`Pilot-Simulation` truth; renter chat became visible and the owner principal
was absent after the renter switch.

Controlled FCM passed in foreground, background and after terminating the app
process. Private visual review confirmed that Android shows the recognizable
ShareItToo notification icon. The screenshots also contained unrelated
personal device notifications, so their SHA-256 values were recorded and the
captures were immediately deleted instead of retained.

Every attempt ran its fail-safe cleanup. The two successful journeys ended the
fresh listings, cancelled the synthetic bookings and removed no protected
account. The protected synthetic owner session was restored at the end.

## Consent and repeatability

WP16's confirmed account deletion correctly deleted the Firebase installation
and persisted push consent as disabled. The first WP17 FCM attempt therefore
failed closed before delivery. Push was re-enabled through the real app UI for
the protected synthetic owner; crash diagnostics remained disabled. This was
an explicit renewed consent, not a configuration bypass.

One later attempt passed all three FCM states but encountered a generic
post-FCM navigation timing failure. Its cleanup and owner restoration passed.
No timeout, retry threshold, parallelism or assertion was changed. Two fresh,
complete and consecutive runs then passed with the identical candidate and
criteria. The temporary timing observation is therefore closed by unchanged
repeatability evidence, with a low residual non-reproduced UI-transition risk
kept visible for later device-matrix work.

## Verification and boundaries

Candidate implementation local regression and exact clean R10 already pass at
the source HEAD. GitHub Regression `33975265727`, including independent R10,
and CodeQL `33975265754` pass. The preceding WP16 evidence HEAD
`92e929f2365fece064e34cf4257a8d2c00819f83` also has passing Regression
`33976719523` and CodeQL `33976719498`; open code-scanning alerts are zero.
PR #7 remains Draft, open, mergeable and unmerged.

No payment endpoint was called. No contract, reservation or monetary effect
was created. No deployment, Google Play, tester-list, Firebase-console,
provider, Stripe, Production, public-registration, OnePlus or PR-merge state
changed. Temporary normalized credential copies were deleted, the protected
source vault was not mutated, and no account identity, credential, token,
fixture identifier or private path entered Git.
