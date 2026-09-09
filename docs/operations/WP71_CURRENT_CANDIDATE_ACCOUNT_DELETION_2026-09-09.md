# WP71 — current-candidate account deletion

Status: **IMPLEMENTED ON PIXEL; LOCAL AND GITHUB VERIFICATION PENDING**.

## Exact scope

WP71 closes the privacy deletion lifecycle on the unchanged signed Internal
Staging candidate `com.shareittoo.app` `1.0.0+2026090904`, source
`12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0`. The installed Pixel APK, private
archive hashes and canonical signing certificate match. No mobile or Backend
runtime path changed after the candidate source.

The deletion target was the fresh disposable verified Staging account retained
by WP70 for this one purpose. It was durably bound before mutation and proved
distinct from both protected synthetic roles. A new fail-closed preflight also
proved that the protected recovery owner was still independently login-ready
before deletion became armed.

## Physical result

The Pixel 7 Pro completed the whole lifecycle:

- exact target and protected-recovery credentials were active before mutation;
- deletion preflight returned clear with no blockers or retained records;
- an intentionally wrong password received only the exact structured
  `401:invalid_credentials` rejection and an independent probe proved the
  account remained active;
- the correct private password produced the exact in-app deletion confirmation;
- an independent Staging login then returned only the exact structured
  `401:invalid_credentials` deletion truth;
- a terminated-process cold start displayed the Guest profile without either
  account identity;
- the protected Account B session was restored; and
- the deleted target's private address and credential were scrubbed only after
  independent deletion truth.

The owner-only recovery journal is terminal with
`recoveryRequired=false`, target state `deleted`, protected owner restored and
SHA-256
`3edaba9b32a5e2d2844dd27323ff854940adfbb23851b7bd128be70a03182952`.
No private path, account identifier, credential, token or raw device identifier
is stored in repository evidence.

## Closure and boundaries

Combined with WP70's current-candidate private no-store export, privacy export
and account deletion is now `PASS`. Physical Pixel report submission remains
`PARTIAL`; Stripe sandbox payment/refund/simulated payout remains `OPEN` behind
its official owner setup.

One harmless read-only setup error used the current-HEAD archive CLI instead of
the immutable candidate API and stopped before any server or device mutation.
The correct private-candidate validation passed immediately afterward. No
retry, timeout, clock, cache or device workaround is a release prerequisite.

The first complete local regression then correctly stopped because the
candidate rollover guard treated root `AGENTS.md` guidance as runtime drift.
The guard now excludes only that exact non-binary path; a similarly named file,
Android, `lib` and Backend runtime still fail closed, with explicit regression
coverage. A separate direct handoff-validator invocation without the normal
rollover context stopped on its unavailable default private AAB and is not used
as acceptance evidence. The complete standard profile is rerun unchanged.

Only the disposable Staging account was deleted. No protected owner,
Production, app or Backend runtime, deployment, Google Play, tester, Firebase,
external identity provider, payment provider, money, Cloud/VPS/DNS, OnePlus or
PR-merge state changed.

Machine-readable evidence:
`docs/evidence/release-readiness/wp71-current-candidate-account-deletion-20260909.json`.
