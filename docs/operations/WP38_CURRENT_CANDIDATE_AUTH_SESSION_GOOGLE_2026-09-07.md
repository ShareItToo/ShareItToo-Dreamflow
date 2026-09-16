# WP38 current-candidate authentication, session and Google

Status: **COMPLETE ON THE PHYSICAL PIXEL, LOCALLY AND ON GITHUB**.

## Provenance

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Installed signed candidate source:
  `2fd793bac970866aa94a2940f28d6bbc3e04e377`.
- Candidate: `com.shareittoo.app`, `1.0.0+2026090610`, Internal Staging.
- Candidate APK SHA-256:
  `07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`.
- Canonical upload-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Diagnostic implementation HEAD:
  `3feae7b18ba3daea08158f8cc3ed5455c07ab96d`.

The installed candidate and all mobile runtime source remained immutable.
WP38 changes only local Android diagnostic entrypoints and tests.

## Provenance correction

The first authenticated-session invocation stopped before device interaction
because its explicit candidate-directory route still loaded candidate identity
from the older tracked `store/device-validation.json`. A valid newer private
archive therefore failed with a stale version-code comparison.

The authenticated-session and Google diagnostics now require an explicit
private candidate archive unless the separate current-source debug route is
requested. They validate the archive's exact four owner-only files, manifest,
privacy report, APK/AAB hashes, package, version, commit, Internal Staging
channel, Firebase binding and canonical certificate before examining the
installed app. Google also accepts an explicit ADB path. A new binding test
rejects a non-Internal profile, and CLI parsing tests reject missing or unknown
arguments. No tracked Store manifest is treated as truth for a different
private candidate.

No app logic, authentication policy, provider configuration, timeout, retry or
assertion changed.

## Physical Pixel result

The exact installed `2026090610` APK passes all of the following:

- authenticated profile access after two force-stop/cold-start cycles while
  online;
- authenticated profile access after two force-stop/cold-start cycles with
  both Wi-Fi and mobile data disabled and verified no-connectivity;
- restoration and independent verification of the original online network;
- selection of the exact private Google account without retaining its address;
- Google first login, force-stop/cold-start persistence and repeat login;
- one identical Staging profile fingerprint across all three Google
  observations and no duplicate account observed; and
- restoration of the protected synthetic owner after the Google sequence.

The Google test does not infer whether the backend originally created or
linked the profile. Apple and Facebook remain disabled and unused.

The protected source vault remains owner-only, byte-, mode- and timestamp-
identical with SHA-256
`dc2bb6de55ac354624afe0260517796b67e6024d22d9179e5e0f7084cd336273`.
Three private profile hierarchies remain outside Git, each owner-only and
identical by SHA-256
`499ec3fda6a206349484543f5f5a65e59bf689f9f15b26998f5cfe4ff781d874`.
Repository evidence contains no account address, credential, token, raw device
identifier or private filesystem path.

## Regression and reproducibility

- Focused authentication/session checks: 20/20 passed after correction.
- Repository tool tests: 2,375/2,375 passed.
- Secret scan: 23 exact reviewed historical findings and zero new
  high-confidence secret findings.
- Complete local technical regression: passed, including Flutter profiles,
  analyzer, Web/Wasm, loopback smoke, backend, PostgreSQL and Android minSdk
  24.
- Initial independent R10 capacity gate: safely refused before work because
  temporary capacity was below its fixed minimum.
- Only reproducible project build output and the exact Gradle cache were
  removed; source, candidate archives, evidence and app data were untouched.
- Independent clean-checkout R10 then passed all nine commands.
- Two 231,444,311-byte APKs are byte-identical with 794 entries and SHA-256
  `0bf32a8560026ea57d9d5c6a0a6642c839fbe492b57fd7fdbc7281b38278af8b`.
- R10 payload inventory SHA-256:
  `b20309b281483f055f598cd6f25a7f1e9ae3032e6140157776a6f08c8ba6e072`.
- R10 report SHA-256:
  `a3bbac64ec8bfa775545f8b75afc164dcd7a2bdc4983a9d94d40a78e6389c28a`.
- GitHub Regression `34078229911`: all required jobs passed at exact
  diagnostic HEAD; image publication remained skipped.
- GitHub CodeQL `34078229819`: passed at exact diagnostic HEAD.
- Open code-scanning alerts: 0.
- PR #7: Draft, open, mergeable and unmerged at exact diagnostic HEAD.

The local cache removal was capacity hygiene, not a release prerequisite or a
timing workaround. R10 restored dependencies from locks and removed its own
isolated checkout, caches and APK copies.

## Boundaries

WP38 did not create an account, change a password, request SMS, call payment,
contact OnePlus or change Google Play, Production, tester lists, Firebase
Console, Google provider configuration, backend deployment, public
registration, Cloud/VPS/DNS or PR merge state. No money was used.

Machine-readable sanitized evidence:
`docs/evidence/release-readiness/wp38-current-candidate-auth-session-google-20260907.json`.
