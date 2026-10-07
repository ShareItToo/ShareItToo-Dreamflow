# WP26 Android build-host and toolchain debt closure

Status: **COMPLETE** on 06.09.2026. This package closes only the historical
release-host capacity, incompatible Kotlin-metadata and obsolete SDK-XML reader
debt. It does not create a candidate or change Android, Firebase, provider,
Store, Production, payment, Cloud/VPS/DNS, device or PR state.

## Closure basis

The original acceptance condition was an uninterrupted complete local gate
followed by the normal signed AAB/APK archive lifecycle, without a manual cache
purge, reduced test scope, warning suppression, relaxed capacity floor or retry
being treated as success. Candidate `1.0.0+2026090402` already supplied that
exact sequence. Its final logs contained neither incompatible Kotlin metadata
nor the SDK XML reader mismatch, and the signed APK/AAB plus archive validation
passed. The historical failed attempts remain failed evidence.

The later exact signed Internal Staging candidate `1.0.0+2026090606`, source
`637c80d0086f7ad1aa08fe5ba1df5c1624b3e545`, confirms that this was not a
one-off result. Its complete local candidate regression, normal signed archive,
independent artifact validation, GitHub Regression `34022203378` and CodeQL
`34022203376` all pass. The release script invokes the checked Android builder
for both AAB and APK before archival; that builder rejects the known Kotlin and
SDK XML incompatibility patterns even when Gradle exits successfully.

Current read-only capacity was also rechecked. The macOS data volume reports
23,536,920 KiB available and the dedicated APFS SIT build volume reports
36,048,612 KiB available, both above the fixed 5,242,880-KiB release floor.
Capacity acceptance and generated-footprint limits are code-owned and cannot be
changed by environment values or timing flags.

## Deterministic checks

Twenty focused checks pass:

- all known Kotlin/SDK-XML patterns are found across arbitrary stream splits;
- exit-zero builds still fail closed on either incompatibility;
- both signed artifacts must pass the checked builder before archive creation;
- the release-host capacity floor and generated-footprint ceiling are fixed;
- neither environment overrides nor timing workarounds can weaken them;
- the signed-candidate path owns a cold generated-output lifecycle; and
- CI keeps signing manual while validating exact rollover metadata and the
  checksum-bound Gradle wrapper.

No private build path, credential, device identifier or signing material is
included in repository evidence. The official SDK/CLI selection remains a
normal reproducible toolchain input, while GitHub clean-checkout proves the
source does not depend on one local cache or a manual purge.

## Result

`TD-N29-HOST-CAPACITY`, `TD-N29-KOTLIN-METADATA` and the associated SDK-XML
reader debt are closed. A future recurrence is a new build failure because the
permanent detector and capacity gates remain active; it is not a tolerated
warning or release prerequisite. WP25 SMS confirmation stays separate and
active, awaiting only the already-requested private six-digit code.

Machine evidence:
`docs/evidence/release-readiness/wp26-android-build-host-toolchain-debt-closure-20260906.json`.
