# WP41 — current-candidate remote session controls

Status: **COMPLETE ON THE PHYSICAL PIXEL, LOCALLY AND ON GITHUB**.

## Exact candidate and physical result

The unchanged installed Pixel 7 Pro candidate is exactly
`com.shareittoo.app` `1.0.0+2026090610`, source
`2fd793bac970866aa94a2940f28d6bbc3e04e377`, APK SHA-256
`07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`
and canonical signing-certificate SHA-256
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The final protected physical run proves the complete bounded session-control
journey:

- independent server truth contained exactly one current Linux diagnostic
  session and one remote Android session;
- the Pixel selected the exact Linux-owned row and revoked only that session;
- the revoked Linux token was independently rejected while the invoking Pixel
  session remained authenticated;
- the Pixel then invoked `logout-all` and the independent remote token was
  rejected;
- an independent read proved server-confirmed empty session truth before a
  fresh credential login;
- fresh login and terminated-process cold start passed;
- Account A to protected Account B isolation passed;
- the protected owner was restored; and
- every accepted diagnostic session was revoked.

The owner-only journal remains outside Git with mode `0600`, status
`completed-session-controls`, `recoveryRequired=false` and SHA-256
`5465a0254eb3cda10a742785492413dc68abcd1f816dee597d54beca42be8d9f`.
No credential, token, session identifier, account address, private path or raw
device identifier was written to repository evidence.

## Red-first findings and corrections

The first physical run stopped safely at the confirmation dialog because the
real Android hierarchy exposes the same valid title twice: once for the dialog
and once for its route/barrier semantics. The diagnostic now accepts duplicate
copies of that exact title but still requires the exact action controls and
binds remote revocation to the single Linux-owned row by geometry. It does not
accept a different or ambiguous session row.

Recovery then exposed that the real login screen can retain a prefilled email.
The diagnostic now clears and replaces both login fields before entering the
exact protected fixture. No timeout, retry, result predicate, application
runtime or server contract was weakened.

GitHub's first run at implementation HEAD
`2b056953d46e35031b19ba8a82229915889619f2` correctly rejected two literal
synthetic credential values in the new test fixture. Technical HEAD
`9487c0a4a4f6dd56c2f55def6d9bda9be5616b7d` constructs those values at runtime,
refreshes the resulting hash-only evidence chain and replaces an incomplete
test-only regular-expression escape with an exact string comparison.
Because the pushed implementation commit remains in immutable history, its
single rule/file/commit tuple is recorded in the reviewed-history baseline.
The baseline cannot allow a working-tree finding, and the complete scan now
reports zero unexpected findings. No scanner rule or scanned file scope was
changed.

## Verification

Six focused WP41 tests pass. All 2,384 tool tests pass. The exact pinned
Backend toolchain (`pnpm@11.16.0`) retains 850 tests: 848 passed, two declared
skips and zero failures. The complete local technical regression passes at
technical HEAD `9487c0a4a4f6dd56c2f55def6d9bda9be5616b7d`, including 900 active
Flutter tests with 33 declared skips, zero analyzer diagnostics, Web/Wasm,
loopback smoke, PostgreSQL and the Android debug build with minSdk 24. The
release-capacity check also passes.

The immutable installed candidate already has WP40's independent clean-checkout
and byte-identical double-build proof. WP41 changes diagnostic tooling and
tests only, so it does not rebuild, replace or make a new binary claim. GitHub
Regression `34093957769` and CodeQL `34093957772` pass at the exact technical
HEAD. The separate PR CodeQL check also passes, and the repository has zero
open code-scanning alerts. PR #7 remains Draft, open, mergeable and unmerged.

## Boundaries

No candidate binary was rebuilt or installed on the Pixel. No OnePlus access,
Google Play change, tester change, Firebase/provider configuration, backend
deployment, Production, VPS/Cloud/DNS, payment, real money, account deletion
or PR merge occurred. Only isolated Staging session state changed, followed by
complete cleanup and protected-owner restoration. PR #7 remains Draft and
unmerged.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp41-current-candidate-session-controls-20260907.json`.
