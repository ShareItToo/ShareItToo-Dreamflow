# WP44 — current-candidate password recovery

Status: **COMPLETE ON THE PHYSICAL PIXEL, LOCALLY AND ON GITHUB**.

## Exact candidate and scope

The unchanged installed Pixel 7 Pro candidate is exactly
`com.shareittoo.app` `1.0.0+2026090610`, source
`2fd793bac970866aa94a2940f28d6bbc3e04e377`, APK SHA-256
`07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`
and canonical signing-certificate SHA-256
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
No mobile or Backend runtime source changed and no deployment occurred.

WP44 repeats the password-recovery journey because the authentic WP15 proof
belongs to candidate `2026090505`, not to the installed immutable candidate.
It uses one fresh disposable Staging identity and restores the protected owner
at the end. SMS, social login, OnePlus, Store, payment and live provider work
are outside this package.

## Physical Pixel result

The protected end-to-end run proves:

- registration through the real candidate UI with the complete consent set;
- exactly one verification mail, exact verification success and exact
  single-use replay rejection;
- verified credentials accepted on the Pixel and after a terminated-process
  cold start;
- a neutral password-reset request with exactly one reset mail;
- reset submission through the exact Staging action form;
- the old password receiving only the exact structured
  `401:invalid_credentials` rejection;
- the new password being accepted on the Pixel and after another cold start;
- later read-only replay receiving the exact consumed-link rejection;
- Account A state not appearing after restoration of protected Account B; and
- final deletion of the disposable account, independent rejection of its
  credentials, terminated-process Guest truth and restoration of the protected
  owner.

The owner-only reset journal remains outside Git with mode `0600`, status
`pixel-password-reset-login-complete` and SHA-256
`75ca848d4ec5279a4c8b6509edf40a6b2f26c9f895798ddd6538aeff82b978f9`.
The successful cleanup journal also remains outside Git with mode `0600`,
status `completed-account-deletion`, `recoveryRequired=false` and SHA-256
`8bfc22074748b7ec48ca92f8978f9eaf1e8eabe53aa3f7e3f2751b375a60a3b7`.
The disposable address, credentials, mail links, tokens and account identifiers
are absent from repository evidence and were scrubbed after deletion truth was
independently established.

## Fail-closed diagnostic corrections

The first post-registration UI observer encountered an already visible Android
software keyboard. Backend credential truth was checked independently, the
probe session was revoked and the candidate was restarted before the successful
Pixel login. The shared session-restoration diagnostic now dismisses the
keyboard only when both authoritative Android input-method flags say it is
shown, then requires the actual enabled and clickable `Anmelden` node.

Immediately after confirmed reset submission, the single-use replay check met
the existing shared 15-minute action rate limit. The reset was not resubmitted.
Instead, exact old-credential rejection established server confirmation, the
new credential passed Pixel login, and a later read-only replay established
consumed-link truth. The mail-action helper now preserves confirmed submission
when replay alone receives the exact structured `429:rate_limit_exceeded` with
a bounded `Retry-After`, reports reconciliation as still required and provides
a separate read-only consumed-link verifier. Transport failures, HTTP 408,
unstructured/intermediary 4xx and unrelated 429 responses never become success.

One preliminary cleanup attempt produced no authoritative deletion surface.
Recovery correctly proved that the target was still active and restored the
protected owner without claiming deletion. A fresh recovery-backed cleanup run
then completed the exact transaction above. These are timing/rate-limit
observations, not permanent prerequisites or weakened acceptance conditions.

Implementation HEAD `173faf82cdba176da9152eff19b97e15846d1466` adds only the
private-input mail-action helper and its tests. Technical HEAD
`0fa3ad9257c00a6275c47857601fff6a5128d871` adds the fail-closed replay
reconciliation and exact Android keyboard ownership check. Neither helper
prints or persists a mail action URL, token, password or account identity.

## Verification

Focused helper and lifecycle tests pass, all 2,409 tool tests pass and the
complete local technical regression passes at technical HEAD
`0fa3ad9257c00a6275c47857601fff6a5128d871`, including the pinned Backend
suite, Flutter suite, zero analyzer diagnostics, Web/Wasm, loopback smoke,
PostgreSQL, Android debug with minSdk 24 and release capacity. The full secret
scan retains only its exactly reviewed historical findings and reports zero
unexpected findings.

GitHub Regression `34115059330` passes all required jobs at the exact technical
HEAD, including Backend history audit and independent clean-checkout
reproducibility. CodeQL `34115059258` passes at the same HEAD; open code-
scanning alerts are zero. PR #7 remains Draft, open, mergeable and unmerged.

## Boundaries and rollback

Only disposable Staging account/session state changed, followed by confirmed
deletion, cleanup and protected-owner restoration. The physical deletion is
intentionally irreversible. Code rollback consists only of removing the
diagnostic helpers and tests.

No candidate binary was rebuilt or installed. No OnePlus access, Google Play
or tester change, provider/Firebase Console configuration, Backend deployment,
Production, Cloud/VPS/DNS, payment, real money or PR merge occurred.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp44-current-candidate-password-recovery-20260907.json`.
