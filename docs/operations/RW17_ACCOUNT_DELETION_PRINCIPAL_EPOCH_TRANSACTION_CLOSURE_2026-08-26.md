# RW17 account-deletion principal/epoch transaction closure

## Scope

RW17 closes the P0 inventory entry `account.deletion` without touching a live
system. Its verified predecessor is RW16 closure
`5b2862ad40f79fe2287977868660f348806d68ae`.

## Red-first proof

The focused RW17 test initially failed to compile because there was no typed
deletion context, no rejection/confirmed-local-failure/unknown result model,
no stable completion and no injectable service boundary. That failure pinned
the missing contract before implementation.

The deterministic matrix now proves:

- only the explicit structured allowlist is a safe backend rejection;
- `408`, intermediary and unstructured 4xx failures remain outcome-unknown;
- backend-confirmed deletion and failed local finalization remain distinct;
- a partial local-only QA deletion has a non-server typed failure;
- failed preflight transport is unavailable, never an empty blocker truth;
- confirmed A cleanup removes A by explicit identity while B remains active;
- a stable successor B is preserved success, not failed A finalization;
- a later authenticated B profile clears an A-only deletion marker;
- delayed A confirmation, preflight and deletion results cannot act under B;
- removing an A-owned route preserves a newer B-owned dialog.

## Verification state

Focused RW17 Flutter tests, the adjacent RW5/RW6/RW9/RW10/RW12-RW16 matrix
and changed-file analysis pass. Full technical regression and exact-head
GitHub Regression/CodeQL are recorded only after their commands complete.

No retry, timing relaxation, test exclusion, test-order dependency or reduced
parallelism is an accepted release prerequisite.

## Ratchet cause

Privacy, retention and G2 lifecycle wording changes because confirmed deletion
now targets the deleted principal explicitly and preserves a successor. This is
a technical truth refinement, not a legal approval, retention-period decision,
provider choice or external gate change.

## Follow-up priority

RW18 owns contact email change, phone verification and email-verification
principal/epoch boundaries. All live and owner gates remain closed.
