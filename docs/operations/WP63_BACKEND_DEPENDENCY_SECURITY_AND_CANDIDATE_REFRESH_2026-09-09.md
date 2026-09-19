# WP63 — backend dependency security and candidate refresh

Status: **COMPLETE LOCALLY AND ON GITHUB; BUILD READY; PLAY INTERNAL UPLOAD
PENDING**.

## Trigger and decision

The final WP62 clean-checkout job performed a fresh registry audit and found
two advisories that were not present in the immediately preceding green run:

- `sharp <0.35.4`: `GHSA-rgj7-g3m4-5g8c`, high severity;
- `nodemailer <=9.1.0`: `GHSA-8m3c-c648-2xjj`, moderate severity.

Both packages are direct Backend production dependencies. Sharp processes
user-supplied listing images, so its reviewed high-severity libheif floor is
directly relevant. SIT does not use Nodemailer's affected legacy
`MailMessage.resolveContent(data, key, callback)` plugin path, but the patched
version is still required rather than relying only on current reachability.

The narrow remediation updates `sharp` to `0.35.4` and Nodemailer to `9.1.1`,
refreshes only their locked package graph, and adds deterministic floors plus a
negative legacy-path check. The production audit then reports no known
vulnerabilities; the focused tests and complete Backend suite pass.

A mandatory fresh registry audit before closure then found three high-severity
Multer advisories published after the first local candidate was built:
`GHSA-wc9g-mqfw-jrwm`, `GHSA-qfvm-cv95-jqjf` and
`GHSA-535w-7cp7-47q4`. Multer is directly reachable through listing-image
uploads, so `2.2.0` was replaced with the common patched floor `2.3.0` and
added to the deterministic dependency-floor guard. The audit and complete
Backend suite were rerun successfully.

## Candidate consequence

Backend dependency files are deliberately classified as runtime-affecting by
the current-candidate gate. The existing Play/Internal candidate
`1.0.0+2026090711` remains immutable historical evidence and is not relabelled.
The first local `1.0.0+2026090901` candidate was never uploaded. It is retained
only as superseded historical evidence and is permanently prohibited from
future upload because the Multer advisories arrived after its build.

The complete security fix therefore uses the next strictly newer, previously
unused Internal Staging identity `1.0.0+2026090902` for the canonical signed
candidate at source commit
`2055a5c508689596c0f776c2cdf38b54f7e106c3`.

The AAB is 109,599,360 bytes with SHA-256
`b1de03f47d8d185f6cbfe2e28b0db6bd56163e8d1aeeed5f9ebe289a40a3af5c`;
the APK is 136,761,953 bytes with SHA-256
`a30404283c92c2dd20e231d385af80e2dcbef510c12210a461f5469759f82dd6`.
Upload-certificate, package/version identity, ZIP integrity, Bundletool 1.18.1,
binary privacy and Firebase Android checks pass. The private archive is
non-overwriting and owner-only.

No Store upload or activation is part of WP63. The current rollover binding now
targets these exact bytes, while the active Play/OnePlus `2026090711` candidate
is retained in its own immutable snapshot. A later separately bounded package
may publish the exact Backend image, deploy it to Staging and replace the Play
Internal build only after fresh read-only preconditions and rollback checks.

## Historical Staging ratchet

The WP55 validator previously required the current Backend tree to remain
identical to the deployed WP55 tree forever. That correctly caught this
runtime-affecting security update, but could not distinguish reviewed successor
work from unbound drift. The deployed WP55 commit and Backend tree remain
strictly exact. A different current Backend tree is now accepted only when it
equals the tree at a newer signed Internal/Staging candidate source commit,
that source is an ancestor of the current HEAD, and the candidate retains exact
package, API, artifact-hash and fail-closed upload-pending boundaries. Six
focused WP55 tests cover acceptance and status/version/channel/hash/tree drift.
This records a pending Staging deployment; it does not claim parity or mutate
the existing runtime.

## Local closure verification

The complete local technical profile passes at binding HEAD
`f67cf5a6427d777cd5fd0a9f62064c0316b7e57c`, including all 2,473 tool tests,
the complete Backend and Flutter suites, isolated PostgreSQL, randomized
security profiles, analyzer with zero issues, Web/Wasm, loopback smoke and the
Android minSdk 24 build. The independent clean-checkout runner cloned the exact
detached HEAD without hardlinks, restored all dependencies into fresh isolated
caches, reran the complete gate and built Android twice. Both debug APKs are
byte-identical, source inventories remain unchanged, resource use stays inside
the deterministic bounds and all temporary inputs and artifacts are removed.
No timing, concurrency, cache or retry workaround was accepted.

Exact-head GitHub Regression `34291902058` passes all four required jobs at
`17d749895da3ac7723a8b855ee1ea004931b3b32`: Backend, PostgreSQL, Flutter and
independent clean-checkout reproducibility. CodeQL `34291902100` passes at the
same HEAD, and the current PR-merge ref has zero open code-scanning alerts. PR
#7 remains Draft, open, mergeable and unmerged. The two branch-ref alerts still
returned by GitHub point only to historical analysis commit `0048ece4`; their
findings were already corrected and the current PR-merge analysis is clean, so
they are not misstated as current candidate findings.

## Boundaries

No existing artifact, device installation, Google Play release, tester list,
Staging or Production runtime, Firebase/provider/payment configuration,
Cloud/VPS/DNS state or PR state changed. No workaround, advisory suppression or
audit exclusion is allowed.

Machine-readable candidate evidence:
`docs/evidence/release-readiness/wp63-backend-dependency-security-and-candidate-refresh-20260909.json`.
