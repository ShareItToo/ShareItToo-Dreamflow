# WP31 Pixel candidate 2026090608 closure

Status: **COMPLETE ON THE PHYSICAL PIXEL** for the exact signed Internal
Staging candidate below. This is direct-device diagnostic evidence, not a
Google Play installation or Store-release claim.

## Exact candidate

- Branch: `codex/master-workflow-20260808`.
- Candidate source HEAD: `15f7766ef15c0be30cf96a743edc4d62d1a588e3`.
- Version: `1.0.0+2026090608`.
- Package: `com.shareittoo.app`.
- Channel/API: Internal Staging at
  `https://staging.shareittoo.com/api/v1`.
- AAB SHA-256:
  `0202dab3aecf41dbc4549fa6b5144899cdc9693109f3e38f94ad89e38a2f9eac`.
- APK SHA-256:
  `375e86a7d42af263420fed63007aab8390a57a2c181a81cbafec0be321e4e28f`.
- Canonical upload-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Privacy-report SHA-256:
  `bdd431311948b6894969f9af6e0d9f419245fe7ed83a82a0a7e776da29c82e9d`.

The owner-only archive contains exactly its manifest, privacy report, AAB and
APK. All recorded hashes match. AAB JAR signature, APK signature, package and
version, bundle structure and compiled privacy surface pass. Firebase Android
Staging is configured. Google sign-in is enabled; Apple and Facebook remain
disabled. The closed non-binding `heilbronn_wave0` envelope remains active,
provider state remains hold and real money remains disabled.

## Regression and reproducibility

- All 2,345 repository tool tests pass.
- All 900 active Flutter tests pass with 33 declared skips.
- Analyzer, backend, dependency and history audit, secret scan, isolated
  PostgreSQL, Web/Wasm, loopback and Android minSdk 24 pass in the complete
  local regression.
- Independent exact-head R10 passes all nine commands with fresh isolated
  caches and clean source before and after.
- Both R10 Android builds are byte-identical and contain the same 794 entries.
- Exact-source GitHub Regression `34044793109` passes Flutter, backend,
  PostgreSQL and R10 clean reproducibility.
- Exact-source CodeQL `34044793087` passes and open code-scanning alerts are
  zero.
- PR #7 remains Draft, open, mergeable and unmerged.

After successful R10 validation, an additional local readback attempted the
nonexistent field `android.reproducibility` instead of the actual
`android.reproduction`. That post-validation assertion failed without changing
source, archive or device. The corrected readback reused the same official-
validator-accepted evidence and confirmed byte identity; no retry or workaround
was introduced.

One later standard post-documentation tool invocation reported only parent-
runner failures for the `mobile_scanner` iPhone-floor and Web-PDFJS test files,
without a failed subtest. Both files immediately pass all eight tests together,
and the subsequent unchanged standard full inventory passes 2,345/2,345. No
parallelism, timing, cache or assertion was changed. This remains a recorded
non-reproducible local-runner observation, not a build prerequisite or waiver.

## Physical Pixel update

The connected unlocked Pixel received one strictly newer replace update:

- before: `1.0.0+2026090607`;
- after: `1.0.0+2026090608`;
- installed APK bytes and certificate match the private candidate;
- Android first-install time and app-data inode remain unchanged; and
- the ShareItToo foreground activity is verified.

No uninstall, data reset, downgrade, login or account mutation occurred. This
proves installation and retained app state only. The physical V5.2 return-case
journey is not inferred and remains the next separate package.

## Boundaries retained

WP31 did not upload to Google Play, modify tester lists or tracks, deploy a
backend, mutate Firebase Console, invoke payment/KYC, enable Production or
public registration, change Cloud/VPS/DNS, contact OnePlus, merge PR #7 or
rewrite Git history. It spent no money.

Machine-readable sanitized closure evidence:
`docs/evidence/release-readiness/wp31-pixel-candidate-2026090608-closure.json`.
