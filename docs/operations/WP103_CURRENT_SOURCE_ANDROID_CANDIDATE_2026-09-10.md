# WP103 — Current-Source Android Candidate

## Scope

WP103 creates and privately verifies the exact Android successor required after
WP102 changed runtime source. It binds only the signed Internal/Staging binary
to the committed source, preserves historical device evidence under its
versioned 2026091001 manifest, and prepares the complete exact-candidate
regression. It does not upload or activate a Play release, install a device
build, contact Staging, or change any payment, provider, Firebase, cloud, VPS,
DNS, tester, legal or production setting.

## Candidate identity

- Application ID: `com.shareittoo.app`
- Version: `1.0.0+2026091002`
- Source commit: `fdcfd1dc782c9f9dd3cb766d566abf7363a76cc5`
- Channel and endpoint: Internal / isolated Staging API
- Android API contract: compile and target SDK 36; min SDK 24
- Closed pilot UI: enabled only for the existing non-public,
  payment-free Heilbronn technical envelope.

## Local proof completed

- The clean, commit-bound build preflight passed with canonical signing and the
  local Android Firebase configuration derived only in-process.
- A signed AAB and APK were created into the owner-only, non-overwriting local
  archive; their package, version, endpoint, ZIP/JAR/APK signatures, canonical
  upload certificate and privacy report were independently revalidated.
- AAB SHA-256:
  `2afcc4f5d473c74708861c116e26e46233c0873aaaa23e3a6cceaa78ea377501`
- APK SHA-256:
  `d0ac7a80232536a4c2f5e1d659b8b9ba4f973581f816142dc6419931742c3637`
- Binary privacy scan: passed without findings.

The locally unavailable bundletool executable is recorded honestly as not run;
it is not substituted by a claim. The builder's ZIP, JAR and APK verification
remain passed independently.

## Evidence lineage

The previous `2026091001` candidate is now retained as
`store/google-play/rollover-candidate-2026091001.json`. Its WP98 Pixel evidence
references that immutable versioned manifest, never the mutable current
candidate pointer. It is superseded for upload by `2026091002`; it is not
erased, reinterpreted or used as evidence for the new binary.

`store/google-play/current-rollover-candidate.json` now points only to the new
private archive. Its full technical regression passed in the designated
isolated Android build profile, including the maintained test inventories,
analyzer, Web/Wasm build and loopback smoke, plus the Android debug reach
check. GitHub Regression `34505947881`, its fresh clean-checkout proof and
CodeQL `34505947825` all passed. The GitHub verification head
`fbfeb514911d7a747d7b3fa995db1f18be506498` is a documentation/evidence-only
successor of the archive source, not the archive source itself. The committed
candidate-rollover guard proved the source is its ancestor and that no
runtime-affecting path changed in between. The PR-head and PR-merge scan
readback each show zero open alerts. Two direct-branch historical instances
remain recorded at older commit `0048ece49b7819fb09600465a027a4e0b530ccda`;
they are not relabelled as current-candidate findings.

## Next bounded action

WP103 is **BUILD READY**: the next suitable action is a separately bounded
physical-test/distribution package for this exact APK, with fresh owner/device
consent and no assumption of a Store upload or activation. This package itself
stops before any Store upload, activation, tester change, device installation,
deployment or public release.
