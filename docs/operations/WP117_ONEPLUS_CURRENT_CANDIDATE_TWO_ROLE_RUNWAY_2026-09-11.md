# WP117 — OnePlus Current-Candidate Two-Role Runway

## Result so far

WP117 prepares one fail-closed command for the complete physical OnePlus
renter/owner replay of the exact signed Internal/Staging candidate
`com.shareittoo.app` `1.0.0+2026091110`, source
`c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b` and APK SHA-256
`711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f7`.
The physical run has not started because the MacBook that owns the attached
OnePlus ADB transport is currently offline.

## Durable execution contract

`tool/run_wp117_oneplus_current_candidate_two_role.mjs` accepts only that exact
candidate, its canonical upload certificate, passed binary privacy report,
Internal channel, Firebase-enabled Staging API and one unlocked physical
OnePlus CPH2581. A different model, build, source, hash, channel or privacy
result stops before product activity.

Every physical execution additionally requires the exact WP117 execution
confirmation. Merely supplying private paths or attaching a phone cannot start
an install or product journey.

An already exact direct-APK installation is preserved. An absent package may
be installed without a reset. A different existing ShareItToo installation
requires the exact scoped reset confirmation; even then the runner can remove
only `com.shareittoo.app`, records the resulting app-local data reset and
installs only the hash-validated candidate. It cannot clear arbitrary packages
or device data.

After exact installed-byte verification, the runner invokes the existing
email-verified two-role product journey with the OnePlus device profile. It
requires owner UI publication plus server/public-catalog confirmation, renter
discovery, non-binding request and acceptance, renter-visible chat, controlled
FCM in foreground/background/terminated states, principal isolation, exact
listing/booking cleanup and protected-owner restoration. Its final result is
accepted only if it contains no account identity, credential, token, fixture
identifier, raw device identifier or private filesystem path.

## Verification and current blocker

Six focused tests pass candidate binding, installation classification,
argument/reset gating and complete sanitized-journey validation. A physical
negative probe against the connected Pixel rejected the non-OnePlus device
before package inspection, install, reset or product activity. `git diff
--check` and the complete scoped local technical regression pass.

Current evidence HEAD `dd834a195ecbc0f210c6a661c4bd6da4007eec49`
passes GitHub Regression `34645026777`, including the independent clean
checkout, and CodeQL `34645026767`. The repository was clean and synchronized
before WP117 preparation.

The MacBook/OnePlus transport remains the only blocker to executing this
prepared package. No Pixel, OnePlus, account, listing, booking, payment,
provider, Store, Production, Firebase, VPS/DNS or PR state changed during
preparation. A simultaneous two-physical-device result also remains unclaimed
until it is executed separately.
