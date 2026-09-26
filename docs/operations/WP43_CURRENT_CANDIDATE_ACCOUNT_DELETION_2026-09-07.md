# WP43 — current-candidate account deletion

Status: **COMPLETE ON THE PHYSICAL PIXEL, LOCALLY AND ON GITHUB**.

## Exact candidate and scope

The unchanged installed Pixel 7 Pro candidate is exactly
`com.shareittoo.app` `1.0.0+2026090610`, source
`2fd793bac970866aa94a2940f28d6bbc3e04e377`, APK SHA-256
`07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`
and canonical signing-certificate SHA-256
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
No mobile runtime source changed after that candidate. WP43 changes no Backend
runtime source and performs no Backend deployment.

This package repeats the privacy-critical deletion journey because the
authentic prior WP16 proof belongs to candidate `2026090505`, not to the
installed immutable candidate. It uses only fresh disposable, verified
Staging identities and preserves the protected owner. No production account
or owner identity is used as a deletion target.

## Physical Pixel result

The final protected run proves the complete transaction:

- deletion preflight is clear;
- an intentionally wrong current password receives the exact structured
  `401:invalid_credentials` rejection;
- an independent credential probe proves that this definite rejection leaves
  the disposable account active;
- the real Pixel UI accepts the correct private password and displays the
  exact deletion success state;
- direct Staging relogin with the deleted credentials is rejected by the same
  exact structured contract;
- a terminated-process cold start opens the exact Guest profile state;
- Account A state and identity do not appear under the restored protected
  Account B; and
- the protected owner session is restored at the end.

The owner-only recovery journal remains outside Git with mode `0600`, status
`completed-account-deletion`, `recoveryRequired=false` and SHA-256
`2954dd3e6ab5d2d150d9707718b497119729cb15415a35be5169736a747683b6`.
The protected source vault is unchanged. The deleted target address, password,
registration material and verification material were scrubbed only after
independent deletion truth was established. No private address, password,
mail link, token, account identifier, device identifier or private path is
retained in repository evidence.

## Fail-closed diagnostic corrections

Three preliminary runs stopped without weakening any acceptance condition:

- direct ADB text injection could not enter the German umlaut in `LÖSCHEN`;
- a keyboard-focus transition briefly made the confirmation-field state
  ambiguous; and
- the first guest observer checked the home surface even though authoritative
  Guest truth belongs to `Mein SIT`.

The diagnostic now binds the umlaut tap to the exact verified Pixel/German-
Gboard geometry, waits for and rechecks each owned field state, navigates to
the profile surface before asserting Guest truth and fails closed on any
different geometry or ambiguous state. It does not change the app, keyboard,
server contract, timeout or outcome semantics. Recovery restored the
protected owner after each interruption. One preliminary disposable target
had already reached independently confirmed deletion before the observer
stopped; its terminal journal was closed and credentials scrubbed, then a
fresh disposable identity was used for the clean end-to-end rerun.

Implementation HEAD `42ea6dc4206ed791081bec0433f0eb3890e3f046` adds only the
recovery-backed diagnostic and its tests. Its first GitHub Regression correctly
flagged the intentional wrong-password template as a high-confidence static
password pattern in immutable history. Technical HEAD
`2ad0e7b1c516605f78732c351b46d8a0a31292c9` builds the mismatch at runtime,
binds the historical false positive to the one exact commit/rule/file tuple
and refreshes the dependent SHA-256 evidence chain to convergence. A dedicated
test proves the current diagnostic is scanner-clean and the baseline is exact.
No scanner rule, scanned scope, current-tree allowance or historical result
was weakened.

## Verification

Twelve focused WP43 checks and all 2,401 tool tests pass. The exact pinned
Backend toolchain (`pnpm@11.16.0`) retains 850 tests: 848 passed, two declared
skips and zero failures. The complete local technical regression passes at
technical HEAD `2ad0e7b1c516605f78732c351b46d8a0a31292c9`, including 900
active Flutter tests with 33 declared skips, zero analyzer diagnostics,
Web/Wasm, loopback smoke, PostgreSQL, Android debug with minSdk 24 and release
capacity. The full secret scan reports 25 exactly reviewed historical findings
and zero unexpected findings.

GitHub Regression `34108042530` passes all required jobs at the exact technical
HEAD, including Backend history audit and independent clean-checkout
reproducibility. CodeQL `34108042626` passes at the same HEAD; open code-
scanning alerts are zero. PR #7 remains Draft, open, mergeable and unmerged.

## Boundaries and rollback

Only disposable Staging account and session state changed, followed by
confirmed deletion, cleanup and protected-owner restoration. The physical
deletion itself is intentionally irreversible; code rollback consists only of
removing the diagnostic, its tests and the exact scanner-baseline entry.

No candidate binary was rebuilt or installed. No OnePlus access, Google Play
or tester change, provider/Firebase Console configuration, Backend deployment,
Production, Cloud/VPS/DNS, payment, real money or PR merge occurred.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp43-current-candidate-account-deletion-20260907.json`.
