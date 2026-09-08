# WP63 — backend dependency security and candidate refresh

Status: **SOURCE PREPARED; SIGNED CANDIDATE AND EXACT-HEAD CLOSURE PENDING**.

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

## Candidate consequence

Backend dependency files are deliberately classified as runtime-affecting by
the current-candidate gate. The existing Play/Internal candidate
`1.0.0+2026090711` remains immutable historical evidence and is not relabelled.
The security fix therefore reserves the strictly newer, previously unused
Internal Staging identity `1.0.0+2026090901` for a new signed candidate at the
eventual exact source-freeze commit.

No Store upload or activation is part of this source preparation. After the
source commit passes all non-candidate checks, build and verify one canonical
signed APK/AAB, update the current rollover binding to those exact bytes, rerun
the complete local and GitHub gates, and only then consider a separately gated
Google Play Internal update.

## Boundaries

No existing artifact, device installation, Google Play release, tester list,
Staging or Production runtime, Firebase/provider/payment configuration,
Cloud/VPS/DNS state or PR state changed. No workaround, advisory suppression or
audit exclusion is allowed.

Machine-readable preparation evidence:
`docs/evidence/release-readiness/wp63-backend-dependency-security-and-candidate-refresh-20260909.json`.
