# WP33 Pixel privacy-export payload

Status: **COMPLETE ON THE PHYSICAL PIXEL, LOCALLY AND ON GITHUB**.

## Provenance and candidate

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Candidate source HEAD:
  `dbcb8c79739ca9441a5e13b7b999346665a5dc96`.
- Technical closure HEAD:
  `a98786f7fd66ab40edabb2ae7ccd81fe48f70fec`.
- Version/package: `1.0.0+2026090609`, `com.shareittoo.app`.
- Internal Staging API: `https://staging.shareittoo.com/api/v1`.
- APK SHA-256:
  `ded1a7fe375e8f8562a5ca48f9d0220369e8dad0207a93dbe67dde2c781a0e77`.
- AAB SHA-256:
  `076897462084a646bbc11625bcee0b3de1f484cf2e4bc46df179c570a93d5624`.
- Canonical upload-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The owner-only archive contains only its manifest, privacy report, AAB and APK.
Hashes, signatures, package/version, Firebase Staging configuration, binary
privacy scan and the closed non-binding `heilbronn_wave0` envelope pass. Google
sign-in is enabled; Apple and Facebook remain disabled. Provider state remains
hold, real money and public registration remain disabled.

The Pixel received a strictly newer replace update from `2026090608` to
`2026090609`. Installed APK bytes and certificate match the candidate. First
install time and application-data identity were preserved; there was no
uninstall, reset or downgrade. All later commits affect only diagnostics,
tests, the exact historical secret-scan baseline and evidence. The maintained
drift check reports no post-candidate mobile-source change.

## Physical result

The rate-limited physical diagnostic was repeated once after the normal
one-hour window had fully elapsed. On the real Pixel 7 Pro it proved:

- a generated wrong password is definitely rejected before any share target;
- the correct protected credential produces exactly one Android share;
- the received JSON root and all principal-private sections belong to the
  current owner;
- the owner identity is present, the foreign account email is absent, and a
  foreign opaque identifier appears only in the permitted shared
  `operationalRecords` section;
- the exact six local sections are `accountProfile`, `operationalRecords`,
  `ownedListings`, `reviews`, `safetyPrivacy` and `savedItems`; and
- no credential- or session-shaped export key is present.

The sanitized export measurement is 1,552,413 bytes with SHA-256
`4c329acfa7cec7b33abfef2c03ffa7d82b56715c587c3978d5d9a16aaff918f5`.
The raw export, account identities, credentials and device identifier were not
printed or retained.

The temporary receiver had no Internet or external-storage permission, backup
was disabled and only its private file was readable. It, its data and its
temporary build were removed. Both temporary probe sessions were revoked, the
protected vault remained byte-identical and the exact protected owner remains
signed in. A separate readback confirms the receiver is absent and no private
export evidence file remains on the host.

## Corrections and verification

The original Android finding was retained native share-cache data. The app now
creates one controlled private source, removes it after sharing and purges only
exact ShareItToo privacy-export copies on cold start and safe resume. Unrelated
cache remains untouched.

The first direct candidate build correctly stopped because a global Flutter
selection bypassed the requested Android environment and exposed an SDK XML-v4
reader warning. Re-running through the maintained version-2 build profile used
the intended isolated SDK/configuration and passed without making that warning
or a local workaround a release prerequisite.

The first payload validation then correctly stopped on the only
password-shaped metadata key: `data.account.password_changed_at`. Source review
proved that this field is a non-secret account timestamp. The validator now
allows only that exact path and only `null` or a canonical ISO timestamp;
password, token, cookie, API-key, private-key, authorization and session-shaped
keys elsewhere remain forbidden. Thirteen focused tests cover the positive and
negative cases.

One historical synthetic rejection fixture briefly contained a literal
password property. GitHub's immutable-history scan found it. The current test
constructs the negative key at runtime, and the exact old commit/file/rule is
recorded in the reviewed baseline without rewriting history. The secret scan
now reports 23 exact reviewed historical findings and zero unexpected finding.
Every dependent evidence hash was advanced through RW20 and all 2,369 tool
tests pass.

The candidate-source complete local regression and its clean-checkout proof
pass; the latter runs all nine commands and produces two byte-identical
794-entry Android builds. On technical closure HEAD `a98786f7…`, GitHub
Regression `34065599328` passes Flutter, backend, PostgreSQL and independent
clean reproducibility. The default Flutter suite passes 904 tests with 33
declared profile skips, analyzer reports zero issues, and Web/Wasm, loopback
and Android minSdk 24 pass. CodeQL `34065599331` passes and open code-scanning
alerts are zero. PR #7 remains Draft, open, mergeable and unmerged.

## Separate remaining risk

A read-only Staging readiness check at `2026-09-06T23:45:02Z` returned HTTP
503/degraded. Database and mail are healthy, the watchdog is current, no P0 is
ownerless and no critical update is overdue; exactly one ordinary support
next-update deadline is overdue. This is an independent operational risk, not
a WP33 export failure. It should be the first input to an updated acceptance
and operations checkpoint before another broad hardening package.

WP33 changed no Google Play track or tester list, backend deployment, Firebase
Console, provider, payment/KYC, Production, public registration, Cloud/VPS/DNS,
OnePlus or PR merge state. No money was spent and Git history was not rewritten.

Machine-readable sanitized evidence:
`docs/evidence/release-readiness/wp33-pixel-privacy-export-payload-20260907.json`.
