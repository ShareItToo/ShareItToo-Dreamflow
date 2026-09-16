# N29 — attempt-specific SMS retry display correction

Status: **SOURCE CORRECTION VERIFIED / PHYSICAL FOLLOW-UP OPEN**.
Base HEAD: `a06150cc5733d2168c83bae34c3f01479d2a0309`, branch
`codex/master-workflow-20260808`, checkout
`/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.

The preceding real-device facts remain in
`N29_PIXEL_SMS_RETRY_CHECKPOINT_2026-09-03.md`: fresh SMS acceptance,
verified cold restart and cleanup pass; original direct-dialog completion
does not. This follow-up has NOT been installed on Pixel. Frozen APK
2026090307 and its source/evidence remain unchanged.

## Narrow changes

- On a new manual confirmation, clear only that sheet's previous error while
  setting the pending state. Existing principal/epoch/route checks, confirmed
  truth handling and disabled repeated submission remain intact.
- A diagnostic observer no longer treats an unchanged prior rejection as the
  new attempt's result. A real pending-code-sheet transition, a changed error
  or a known confirmation is required. Missing/foreign surfaces do not count
  as a pending transition. Deadlines and command timeouts are not increased.
- Three maintained widget cases cover invalid-to-pending-to-success, a new
  rejection and an unknown result. Four diagnostic cases cover stale error,
  actual pending transition, foreign/missing surfaces and changed outcomes.

## Local verification

- The standalone widget reproduction failed before the change because the
  previous rejection remained visible during the new pending attempt. It
  passes after the correction; mocked success closes the sheet correctly.
- Maintained SMS widget tests: 13/13 PASS, including existing principal/route
  isolation and confirmed-versus-unknown cases. Targeted analyzer: zero issues.
- Diagnostic tests: 22/22 PASS. Complete repository Node tool inventory:
  2,148/2,148 PASS after exact bindings were refreshed.
- Backend: 795 PASS, two expected skips, zero failures; syntax checks PASS.
- Complete local technical regression exited 0 in the normal host lifecycle
  with the repository-documented `CI=true` metadata-only mode for historical
  archive/device handoff validators. The initial non-CI invocation stopped at
  the absent current-HEAD archive, as expected before building a new candidate.
  No device or artifact pass is inferred from metadata-only validation.
  Full Flutter inventory: 665 PASS, five expected skips, zero failures;
  additional configured profile/ownership suites PASS. Analyzer baseline PASS,
  Web debug build and Wasm dry run PASS, loopback-only smoke PASS. Android debug
  build and binary audit PASS: minSdk 24, 14 permissions, eight exported
  components. This is not a separate executed Wasm release or signed candidate.
  Exact correction source HEAD
  `239c5aa1f74e55cb2991f97832a1d855a7ae7e94` subsequently passed GitHub
  Regression `33806616812` with all four jobs, including clean checkout, and
  CodeQL `33806616843`. API image publication was skipped. This later evidence
  is specific to that source HEAD, not any subsequent provider-SDK correction.
- Local full-gate log SHA-256:
  `a97aef9490d733bd5606534f694b03649ae8af62878e0de0d47a0db1d59d16fd`.
  Separate Backend test/check log SHA-256:
  `17f47a8d33d658bdc34c23bd50cf9652436910b15da288be66df7fb6b3dd6412`.
- Working-tree secret scan and whitespace checks PASS. No new signed artifact,
  provider traffic or Pixel installation occurred in this local regression.

## Ratchet cause and audit

The only mobile behavior change is clearing the preceding SMS display at the
start of a new attempt. Its file hash changes the privacy source inventory,
then the active-provider evidence and dependent RW source inventories/ratchets.
The first tool runs correctly rejected incomplete transitive bindings. Those
failures were not suppressed or reclassified as passes.

All 19 changed JSON manifests were structurally compared with base HEAD after
excluding only the reviewed hash fields (`sha256`, `privacyManifestSha256`,
`activeProviderEvidenceSha256`): all other data is identical. Five validator
files change only the corresponding literal hashes, not assertion logic.
Legal/privacy approval state, provider decisions, external readiness, frozen
artifact provenance and historical verified HEADs are not promoted.

## Remaining work and risks

The audited source correction is committed and pushed. A new candidate and affected physical Pixel acceptance
are required before calling the display behavior device-proven. The stale
retry reproduction explains a concrete ambiguity in the old observation, not
every possible cause of delayed or missing physical-dialog completion.

WP01 and the encompassing Goal remain incomplete. The independent shared
social-SDK cleanup defect in `WP02_PROVIDER_READINESS_2026-09-03.md` remains
OPEN and is not fixed by this SMS UI change. Existing host-capacity,
Kotlin-metadata and the earlier bounded ADB-command failure remain explicit.
No additional SMS, provider activation, Store, production, real-money action,
OnePlus access or PR merge is authorized by this local correction alone.
