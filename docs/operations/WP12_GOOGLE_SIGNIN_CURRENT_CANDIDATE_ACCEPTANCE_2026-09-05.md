# WP12 — Google Sign-In current-candidate acceptance

Status: **COMPLETE** for Google Sign-In on the exact frozen Pixel Staging
candidate. This package changed diagnostic tooling only; it did not change the
runtime application, candidate, Firebase, provider configuration, deployment,
Play, Stripe, payment, production or PR state.

## Exact candidate and physical result

The installed Pixel 7 Pro package is exactly `com.shareittoo.app`
`1.0.0+2026090503`, built from frozen candidate source
`96b97b55983111d9e0ae8d8fcc91e9e241a2cb6f`. The installed APK and signing
certificate match the protected candidate archive. It uses the Staging API,
has Google enabled and keeps Apple and Facebook disabled.

Using the exact private owner-selected Google account, the real device passes:

- first Google login into the existing ShareItToo principal;
- terminated-process cold-start session persistence;
- logout and repeat Google login;
- the same private profile fingerprint in all three observations;
- no duplicate account; and
- restoration of the protected synthetic owner session after the diagnostic.

Raw profiles remain outside Git in owner-only local evidence. Repository
evidence contains no E-mail address, account identifier, token, credential or
raw UI hierarchy.

## Reproduced diagnostic gap and correction

The first current-candidate run failed safely: the maintained diagnostic did
not see its generic main-navigation marker and did not claim a successful
login. It still restored the protected owner. The result did not distinguish
an authenticated profile from login, consent, chooser, provider-unavailable or
backend-error surfaces, which made an actionable failure look like one generic
timeout.

Implementation commit
`4237cbd7a98148c15e35c7bd52ea2f31b3438239` adds a sanitized, closed surface
classification and preserves the original failure across owner restoration.
On future failure, raw hierarchy is retained only in the protected local QA
directory; emitted and committed output contains only the classification and a
boolean private-capture indicator. Four focused diagnostic tests pass. No app
runtime code was changed.

The corrected second physical run then passed every Google cell above. This is
an evidence-quality correction, not a timeout, retry, parallelism or local
toolchain workaround.

## Regression and reproducibility

- Firebase/OAuth configuration and 31 focused configuration checks pass.
- Google-only Flutter profile passes 3/3; Firebase social-auth Backend profile
  passes 4/4; all three provider SDK ownership, initialization and native
  profiles pass.
- Complete local regression passes: 2,252 tool tests, 836 Backend tests,
  default Flutter 859 passed plus 33 documented skips, analyzer zero issues,
  Web/Wasm, loopback smoke and Android minSdk 24 build.
- Exact detached clean R10 passes at the implementation commit. Its complete
  gate took 624 seconds and the second Android build 31 seconds. Both
  231,344,595-byte APKs are byte-identical with SHA-256
  `d6db11703cb3378f186b01e9c2db2c40acaee0357b56596d915ede11d9b6461c`;
  all 794 extracted entries match. Both checkout states are clean, resource
  bounds pass and temporary output is removed.
- GitHub Regression
  `https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/33958820805`
  passes all four required jobs, including independent clean R10. API image
  publication is correctly skipped.
- GitHub CodeQL
  `https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/33958820859`
  passes; open code-scanning alerts are zero.
- PR #7 remains Draft, open, mergeable and unmerged.

The local strict Store-handoff lane continues to fail closed because the
historical private `2026090204` archive is no longer present after the recorded
disk cleanup. It was not recreated, relabelled or inferred. The existing
supported candidate-rollover CI metadata lane passes; exact candidate0503
archive identity and physical Pixel acceptance were proved separately. This
retained historical-artifact absence is not made a permanent runtime or test
prerequisite.

## Remaining boundaries

WP12 closes current-candidate Google Sign-In only. Facebook and Apple remain
separate provider packages. External Listing AI still requires owner OpenAI
Platform authentication and a dedicated Staging credential; `codex_local_dev`
remains developer-only. Stripe test mode still requires truthful owner business
profile completion and personal terms acceptance. Binding V5.2 remains
draft-blocked. Production, public Store, live money, OnePlus and PR merge remain
closed.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp12-google-signin-current-candidate-acceptance-20260905.json`.
