# WP29 Pixel candidate 2026090607 closure

Status: **COMPLETE ON THE PHYSICAL PIXEL** for the exact signed Internal
Staging candidate described below. This is direct-device diagnostic evidence,
not a Google Play installation or Store-release claim.

## Exact candidate

- Branch: `codex/master-workflow-20260808`.
- Candidate source HEAD: `0708609f66ecebee75e7d3786130c5231e578148`.
- Version: `1.0.0+2026090607`.
- Package: `com.shareittoo.app`.
- Channel/API: Internal Staging at
  `https://staging.shareittoo.com/api/v1`.
- AAB SHA-256:
  `b09de31d67fe752a3232529ca24a8ed4d1cf5313c64ba205e493861ef009b8e1`.
- APK SHA-256:
  `b108ef36362e947d9de2f0c335d1f3fdeef1713327ba50a42745658e8163054e`.
- Canonical upload-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The candidate remains in the owner-only private archive. The archive contains
exactly the manifest, privacy report, AAB and APK; all recorded hashes match.
The AAB JAR signature, APK signature, package/version identity and compiled
privacy surface passed the normal release lifecycle. Firebase Android Staging
is configured. Google sign-in is enabled; Apple and Facebook remain disabled.
The closed non-binding `heilbronn_wave0` envelope and technical G3-G5 surfaces
remain enabled. Provider state remains hold and real money remains disabled.

## Reproducibility and regression

The independent clean-checkout proof ran against detached exact HEAD
`0708609f66ecebee75e7d3786130c5231e578148` with isolated dependency caches.
Backend restore/tests/syntax, dependency audit, secret scan, isolated
PostgreSQL, analyzer, Flutter, Web/Wasm, loopback and Android all passed. Two
equivalent Android debug builds were byte-identical and their extracted
794-entry payload inventories were identical. The temporary checkout, isolated
caches and APK copies were removed by the runner.

Preparation validation also passed all 2,341 repository tool tests. Exact-head
GitHub Regression `34038653430` passed all four required jobs: Flutter,
backend, PostgreSQL and R10 clean reproducibility. Exact-head CodeQL
`34038653410` passed, and the repository has zero open code-scanning alerts.

One post-documentation local invocation terminated after an incomplete
2,335-test inventory with two failures. No reduced concurrency, retry waiver or
release workaround was introduced. Five subsequent unchanged runs using the
standard test parallelism each passed the complete 2,341-test inventory; the
independent local R10 run and GitHub's separate standard runners also pass.
This remains a recorded non-reproducible local-runner observation, not a
permanent build prerequisite.

## Physical Pixel update

The already connected, unlocked Pixel 7 Pro was updated by a replace install:

- before: `1.0.0+2026090606`;
- after: `1.0.0+2026090607`;
- no uninstall, reset or downgrade was used;
- installed APK bytes and signing certificate match the private candidate;
- Android first-install time and CE data inode remained unchanged;
- the ShareItToo foreground activity was verified after the update.

The device evidence contains no raw device identifier, private filesystem path,
personal account data, token or secret. No login, account mutation or product
journey was performed by this installation step. The WP28 return-case journey
therefore remains a separate WP30 physical claim.

## Boundaries retained

WP29 did not upload to Google Play, modify tester lists or tracks, deploy a
backend, mutate Firebase Console, invoke payment/KYC, enable public registration
or Production, change Cloud/VPS/DNS, contact OnePlus, merge PR #7 or rewrite Git
history. PR #7 remains Draft, open, mergeable and unmerged.

Machine-readable sanitized closure evidence:
`docs/evidence/release-readiness/wp29-pixel-candidate-2026090607-closure.json`.
