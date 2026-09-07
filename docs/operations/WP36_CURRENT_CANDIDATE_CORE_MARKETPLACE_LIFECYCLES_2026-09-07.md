# WP36 current-candidate core marketplace lifecycles

Status: **COMPLETE ON THE PHYSICAL PIXEL, LOCALLY AND ON GITHUB**.

## Scope and provenance

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Immutable installed candidate source:
  `2fd793bac970866aa94a2940f28d6bbc3e04e377`.
- Candidate: `com.shareittoo.app`, `1.0.0+2026090610`, Internal Staging.
- Candidate APK SHA-256:
  `07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`.
- Canonical upload-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Diagnostic implementation HEAD:
  `474d87339371d3f70b032dbc55fbd14c44413490`.

WP36 deliberately kept the installed signed candidate immutable. The only
repository change is sanitized diagnostic classification in the physical
listing-lifecycle runner plus its test. It does not alter mobile runtime code,
the candidate binary, server behavior or a product assertion.

## Physical Pixel acceptance

Three serial, isolated two-role lanes pass against the exact installed
`2026090610` candidate:

1. **Listing lifecycle**: owner draft edit, publish, renter visibility, pause
   with three stable absence observations, reactivation and visibility, end
   with three stable absence observations, monotonic revisions, cleanup and
   protected-owner restoration.
2. **Search and saved listings**: exact unique search, coarse-category search,
   detail open, save for later, persistence across process restart, three
   stable owner-isolation observations, renter restoration, exact removal and
   three stable absence observations.
3. **Rental cart and project**: two submissions of the exact same intent leave
   one server item with a stable idempotent client identifier, create no
   reservation or request, then create and assign a project with server and UI
   confirmation, preserve it across restart, isolate it from the owner, restore
   it for the renter and remove the exact temporary item while preserving the
   unrelated cart baseline.

The first listing-lifecycle attempt completed edit, publish, pause and
reactivation but timed out when the late owner listing surface did not appear.
Cleanup and owner restoration succeeded and zero active isolated journeys
remained. The cause was not inferred. A diagnostic-only classifier was added
to report counts for the expected screen, tab, title, status action, load
failure, empty state and progress indicator without retaining the private
listing title. The exact unchanged physical lane then passed completely. This
is recorded as a one-off owner-listing surface timeout, not a reproduced app
defect. No timeout, retry, assertion or acceptance condition was weakened.

After every lane, the protected account was restored and an independent
inventory reported zero active isolated product journeys. The protected
source vault remained byte-, mode- and timestamp-identical. No private title,
identity, credential, fixture identifier or device identifier is retained in
repository evidence.

## Regression and reproducibility

- Focused diagnostic tests: 4/4 passed; combined related tests: 11/11 passed.
- Repository tool tests: 2,373/2,373 passed.
- Secret scan: 23 exact reviewed historical findings, zero new
  high-confidence secret findings.
- Complete local technical regression: passed, including Flutter profiles,
  analyzer, Web/Wasm, loopback smoke, backend, PostgreSQL and Android minSdk
  24.
- Independent clean-checkout R10 at diagnostic HEAD: all nine commands passed.
- Two clean Android APK builds: byte-identical, 231,444,151 bytes, 794 entries,
  SHA-256
  `cd5e8a13945fc3509cbdac362f600b588c8feaaf589ae70868eaaf13fcc565f8`.
- R10 payload inventory SHA-256:
  `06c2d60e310068e60c15924bf6f7467cac412e39aed1b234883225f70dd1a4fc`.
- R10 report SHA-256:
  `8801e92c7f90bfb2a2dfc2b14ef5b554f2f028b0c2bf1775b0144a2314cd83b5`.
- GitHub Regression `34075140223`: passed at exact diagnostic HEAD.
- GitHub CodeQL `34075140221`: passed at exact diagnostic HEAD.
- Open code-scanning alerts: 0.
- PR #7: Draft, open, mergeable and unmerged at the diagnostic HEAD.

Generated build capacity used during the clean proof was removed through
normal reproducible cleanup only. The signed candidate archive, source and
evidence were untouched. No timing/cache/rate-limit workaround became a
release prerequisite.

## Boundaries

WP36 did not contact OnePlus and did not change Google Play, Production,
tester lists, Firebase Console, provider configuration, backend deployment,
payment/KYC, public registration, Cloud/VPS/DNS or PR merge state. It created
no contract, reservation, binding request or monetary effect.

Machine-readable sanitized evidence:
`docs/evidence/release-readiness/wp36-current-candidate-core-marketplace-lifecycles-20260907.json`.
