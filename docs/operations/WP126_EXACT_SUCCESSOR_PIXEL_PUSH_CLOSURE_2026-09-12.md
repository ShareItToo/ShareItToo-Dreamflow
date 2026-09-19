# WP126 — Exact successor candidate and Pixel push closure

## Result

The immutable Internal/Staging Android successor `com.shareittoo.app`
`1.0.0+2026091201` was built from
`1546812f625b4e8f1e700bf976410097cd45ac2f`, frozen at
`f9c4c9523eb0f4dfcdb03d34516795a91e0bcbdd` and installed directly on the
physical Pixel 7 Pro. The update preserved the existing Android app data,
matched the private archive byte for byte and retained the approved upload
certificate. No uninstall, reset, downgrade or Store delivery was used.

The exact installed candidate passed controlled Staging FCM delivery in the
foreground, background and after process termination. The private
notification-shade capture showed the clear ShareItToo brand icon on both
notifications. It was hash-bound for review, then moved to Trash because it
also contained unrelated private notifications. No screenshot or account
identity is retained in Git.

This proves exact-candidate delivery. It does not claim that an artificial
transport-response-loss condition was injected on the physical device. The
retry, cleanup, principal/epoch and Account-A-to-B invariants remain covered by
WP125's deterministic source and widget tests; a backend or transport failure
still cannot be presented as successful registration.

## Candidate binding

- AAB: 138,736,330 bytes, SHA-256
  `81c204fd65d83a0403d203b606328880acb0787d076093240efab87d00575399`.
- APK: 199,608,577 bytes, SHA-256
  `a8bfda4c1a0e7302b2528db8edfbe1318e88322023f65588da032220a24badd4`.
- Upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Android configuration: minSdk 24, target/compile SDK 36, Firebase Android
  configured, Staging API, external Listing-AI provider disabled and on-device
  analysis retained.
- The current Google Play internal build was not changed. This new AAB was not
  uploaded or activated.

## Verification

The candidate freeze passed the complete local technical regression, including
the permanent tool inventory, Backend, Flutter, analyzer with zero findings,
Web/Wasm, loopback smoke and Android build. GitHub Regression `34703064328`
passed the same freeze, including independent clean-checkout reproducibility;
CodeQL `34703064266` passed and open branch alerts were zero. PR #7 remained
Draft, open, clean, mergeable and unmerged.

The first standalone tool-glob diagnostic after `flutter clean` intentionally
did not run the required dependency bootstrap. Its two package-floor modules
failed at module load because `.dart_tool/package_config.json` did not yet
exist. The official regression runner already recreates that file from the
locked dependencies before starting the tool inventory. With that declared
precondition present, the final glob passed 2,743/2,743 tests. The clean
local complete runner and independent clean-checkout CI are the accepted
evidence; an unbootstrapped rerun is not.

## Diagnostic correction and physical replay

Two preparation attempts correctly stopped before device evidence with the
typed `409 v52_contract_documents_unavailable` response. The first requested a
binding fixture while professional V5.2 documents remain unavailable. The
second exposed that the isolation wrapper recognized only fixture-verified
synthetic accounts and therefore did not reuse an otherwise safe E-mail-link
verified non-binding simulation. Both attempts ended without contract,
reservation, payment or public listing residue.

Diagnostic correction
`4f4ae2a2cce6672a61ca77fc3fcec57fb0aac245` accepts exactly the two supported
synthetic verification pairs, requires one owner and one renter, and retains
all existing no-money and no-binding checks. Six focused tests pass. The
corrected isolation path then passed the complete physical FCM matrix without
creating a second listing or booking. Its non-binding booking was cancelled,
the exact listing was paused and independently absent from the public catalog.
GitHub Regression `34704553662`, including independent clean checkout, and
CodeQL `34704553654` both pass on that exact correction head.

## Capacity and boundaries

The first complete local gate refused to start below its fixed five-GiB
effective-capacity floor. Two superseded private candidate archives totaling
487,424 KiB were moved recoverably to the connected Crucial X9 cold-storage
directory; no source, current candidate or user data was deleted. The unchanged
gate then passed inside its fixed bounds. Generated build output was removed
afterward with the normal Flutter cleanup. The manual relocation is incident
recovery only, not release evidence or a permanent prerequisite; exact clean CI
independently passed.

No Production, Google Play, tester list, Firebase project, backend deployment,
payment, real money, VPS/DNS, public registration, OnePlus or PR-merge state
changed. Machine-readable evidence is in
`docs/evidence/release-readiness/wp126-exact-successor-pixel-push-closure-20260912.json`.

## Remaining truth

- Physical transport-response-loss injection is not claimed; deterministic
  WP125 recovery tests remain the accepted proof for that branch.
- On-device Listing AI and the wider renter/owner journey were not needlessly
  replayed because the successor runtime delta is limited to push registration.
- Professional V5.2 binding, Stripe sandbox, manual TalkBack and every live,
  Store or production gate remain separate.
- The disconnected OnePlus is not required for this closure and was not
  contacted.
