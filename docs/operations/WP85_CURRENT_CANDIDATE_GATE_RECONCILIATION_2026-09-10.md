# WP85 — Current-candidate gate reconciliation

Status: **EVIDENCE RECONCILED; OWNER AND EXTERNAL GATES REMAIN OPEN.**

## Decision

WP79 was the last complete 32-item candidate matrix, but it predated the exact
Pixel WP83 replay and the WP84 Staging reproducibility correction. WP85
reconciles those later facts without changing a runtime state or treating a
later working-tree source as the signed candidate.

The result stays at **12 PASS / 11 PARTIAL / 9 OPEN**. The important change is
precision, not a cosmetic score increase:

- exact Pixel password change, server-confirmed session-empty truth, logout-all,
  cold start and Account-A-to-B isolation are now recorded; the remaining gap
  is the independent delayed-result proof and the e-mail-linked recovery flow;
- fresh registration now reaches the genuine e-mail-pending state on the exact
  candidate. The mailbox link itself remains owner-controlled and is neither
  read nor stored by Codex;
- the permission runner now demonstrably fails closed before mutation while
  that new account remains e-mail-pending;
- WP84 closes the local release-harness correction, but intentionally does not
  claim the required future Staging rollout/readback;
- the official Stripe connector was checked read-only again and still requires
  owner reauthentication. No payment, test money, object or configuration was
  touched.

## What remains next

1. The owner completes the normal ShareItToo Staging e-mail confirmation link
   without sending it to Codex. Then the exact Pixel login, cold-start and
   recovery replay can continue.
2. The owner reauthenticates the official Stripe connector before any sandbox
   inventory or test-money workflow.
3. A separately controlled exact-commit Staging rollout plus read-only
   persistence proof is needed before remote release reproducibility closes.

Facebook, Apple, real runtime image analysis, binding legal flows, TalkBack
and OnePlus work remain distinct requirements; none has been silently
promoted. The OnePlus was not contacted.

## Verification

The matrix is source-hash-bound to WP73, WP74, WP75, WP79, WP83 and WP84. The
pre-matrix source head `9d58d7ec7a72ff2da44093a23e978a391a07b64b` passes
GitHub Regression `34439905295` (Backend, PostgreSQL, Flutter and clean
checkout) and CodeQL `34439905287`; PR #7 is Draft/open/clean/unmerged with
zero open merge-reference Code Scanning alerts.

Machine-readable matrix:
`docs/evidence/release-readiness/wp85-current-candidate-gate-reconciliation-20260910.json`.
