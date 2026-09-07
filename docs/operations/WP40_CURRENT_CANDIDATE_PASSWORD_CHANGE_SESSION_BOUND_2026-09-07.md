# WP40 — current-candidate password change and bounded sessions

Status: **COMPLETE ON THE PHYSICAL PIXEL, LOCALLY AND ON GITHUB**.

## Exact candidate and physical result

The unchanged installed Pixel 7 Pro candidate is exactly
`com.shareittoo.app` `1.0.0+2026090610`, source
`2fd793bac970866aa94a2940f28d6bbc3e04e377`, APK SHA-256
`07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`
and canonical signing-certificate SHA-256
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The final protected run proves the complete reversible transaction:

- the original credential was accepted before mutation;
- the password screen waited for one server-confirmed current session;
- the app presented the definite `Passwort geändert` result;
- the invoking local session was cleared;
- the old credential was rejected and the prepared replacement accepted;
- the replacement login survived a terminated-process cold start;
- Account A to protected Account B isolation passed;
- the original credential was restored and independently accepted;
- the replacement credential was no longer accepted;
- the protected owner was restored; and
- every accepted diagnostic session was revoked.

The owner-only journal remains outside Git with mode `0600`, status
`original-password-restored`, `rollbackRequired=false`, no retained
replacement credential and SHA-256
`49bbf4c31f7d2457573c9e3a9b3e72b619199fde4106b23d885c2e21f8fe5fcd`.
The protected account vault remains byte-identical with SHA-256
`dc2bb6de55ac354624afe0260517796b67e6024d22d9179e5e0f7084cd336273`.
No credential, token, account address or raw device identifier was written to
the repository or printed as evidence.

## Retained red-first finding and root cause

Initial runs stopped safely before mutation because the password action did
not yet have server-confirmed session truth. A direct sanitized Staging read
then found 274 active sessions for the isolated synthetic renter while the
strict client inventory accepts at most 100. The action therefore could not
prove its current-session owner and correctly refused to continue.

The intended Staging-only `logout-all` path was used once for that synthetic
renter. It invalidated the prior token. A fresh verification login then showed
one current session; that verification session was revoked and its token was
confirmed invalid. Production, the protected owner and every other account
were unchanged.

This was not merely test-fixture drift: unbounded successful logins could make
the security-session screen unavailable to any long-lived account. Commit
`146e0d29b81089768959ee8473ac73ac3f63e627` therefore:

- serializes session issuance under an account row lock;
- revokes the oldest excess active sessions before a new session is issued;
- revokes their refresh tokens and removes their associated push devices;
- keeps the resulting active inventory at or below 100; and
- excludes refresh rotation because it reuses an existing session.

The Pixel diagnostic now also distinguishes a not-yet-loaded inventory from a
server-confirmed session list and will not mutate until exactly one current
device is proven. It retains typed safe failures without exposing transport or
identity material.

## Ratchets and verification

Commit `55ea4e5b85cb4b2f936d11559036c391eba2883a` refreshes only reviewed
SHA-256 source bindings after the three session-limit source files changed.
Forty evidence and validator files contain 150 hash replacements; gate states,
provider states, legal states and evidence claims are unchanged. All 2,378
tool tests pass after the complete hash chain is recalculated.

The exact pinned Backend toolchain (`pnpm@11.16.0`) passes 850 tests: 848
passed, two declared skips and zero failures. The complete local technical
regression passes, including Flutter, analyzer, Web/Wasm, loopback,
PostgreSQL and the Android debug build with minSdk 24.

Independent clean-checkout R10 at technical HEAD
`55ea4e5b85cb4b2f936d11559036c391eba2883a` passes all nine commands. Its
complete gate took 639 seconds and the second Android build 32 seconds. Both
231,444,311-byte, 794-entry APKs are byte-identical with SHA-256
`aef03672baaeffd301a2beb186b08de5e9d9aa7da99934b4bed65ec717d79476`.
The isolated checkout began and ended clean, used no private input and was
removed together with its isolated caches. Private R10 report SHA-256:
`d719c370ef639f38544514b563695a19e14ba81df084edfbaf692ccd312e89f2`.

GitHub Regression run `34086350422` passes all four required jobs at the exact
technical HEAD, including independent clean-checkout reproducibility. The API
image publication is correctly skipped. CodeQL run `34086350502` passes and
the independent readback reports zero open code-scanning alerts. PR #7 is
Draft, open, mergeable and unmerged.

## Boundaries

No candidate binary was rebuilt or installed on the Pixel. No OnePlus access,
Google Play change, tester change, Firebase/provider configuration, backend
deployment, Production, VPS/Cloud/DNS, payment, real money, account deletion
or PR merge occurred. The only remote mutation was the bounded session cleanup
and reversible password transaction for the isolated Staging renter. PR #7
remains Draft and unmerged.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp40-current-candidate-password-change-session-bound-20260907.json`.
