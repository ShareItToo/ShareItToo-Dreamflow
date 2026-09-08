# WP61 — current-branch CodeQL alert closure

Status: **LOCAL REGRESSION PASSED; EXACT-HEAD GITHUB AND ZERO-ALERT READBACK
PENDING**.

## Trigger and scope

WP60 implementation HEAD `d2c2fe28e220fd591efe876f33130addd6a98a2c`
passed GitHub Regression and CodeQL, but the explicit branch-alert readback
found three older open findings: `543` (`js/file-access-to-http`, medium), `544`
and `545` (`js/file-system-race`, high). None points to WP60 code. Security
findings take priority over the physical OnePlus run, so WP61 changes only the
three reported diagnostic-tool locations and their focused tests.

## Remediation

The two file-race locations now open the final file with `O_NOFOLLOW`, inspect
that same descriptor with `fstat`, read JSON from that same descriptor and
close it in `finally`. There is no longer a path-based metadata check followed
by a separate path-based read. Existing symlink and mode rejection remains,
and WP46 gains its own regular-file, symlink, permission and missing-file test.

Alert `543` represents the intentional independent credential-state probe for
one owner-authorized disposable Staging account. Its source was already a
non-empty owner-only regular file opened with `O_NOFOLLOW`; the destination is
now additionally constructed and checked as the exact compile-time HTTPS
origin `staging.shareittoo.com` and exact `/api/v1/auth/login` path, with no URL
credentials, query or fragment. The account and two-field payload shapes are
tested. A durable `SIT-INTENTIONAL-EGRESS` marker binds this exact reviewed
sink to individual GitHub triage as `used in tests`, following the established
WP24 pattern. There is no source suppression or query-wide exclusion. The
workflow, security-extended suite and every other finding remain enabled.

## Verification and boundaries

All 25 focused tests pass. The complete local regression passes all 2,471 tool
tests, 909 Flutter tests with 33 declared skips, mandatory randomized security
profiles, analyzer with zero issues, Web/Wasm, loopback smoke and Android debug
build at minSdk 24. No timing, cache, retry or parallelism workaround was
introduced.

No credential value was read or printed during WP61, no network request was
sent, and no device, Android binary, Staging, Store, Production, Payment,
Firebase/provider, Cloud/VPS/DNS or PR state changed. Closure requires exact-
head GitHub Regression, CodeQL success and a branch readback of zero open code-
scanning alerts.

Machine-readable evidence:
`docs/evidence/release-readiness/wp61-codeql-current-branch-alert-closure-20260908.json`.
