# RW16 session-transition principal/epoch closure

## Scope

RW16 closes the two P0 inventory entries `profile.session.logout` and
`login.session-clear` without touching live systems. The verified predecessor
is RW15 closure `39fc576627e3fefed019efe8ff1787b3b16eec2a`.

## Red-first proof

Before implementation the focused RW16 test failed to compile because the
owner-bound transition service, exact session receipt, conditional profile
clear and screen injection points did not exist. This pinned the missing
contract before production code was added.

The implemented deterministic matrix proves:

- an A clear cannot remove an already persisted B session;
- an app-owned B sign-in is serialized after A cleanup and invalidates the A
  completion;
- an A profile clear cannot remove B's current profile;
- an A profile dialog is dismissed without closing a newer B dialog;
- a delayed A LoginScreen bootstrap cannot clear B;
- guest continuation cannot mutate preview or navigate after B appears.

## Verification state

Focused RW16 Flutter tests, the existing RW10/RW12/RW13/RW14/RW15 security
matrix and changed-file analysis pass. Full technical regression and exact-head
GitHub Regression/CodeQL are recorded only after their commands complete.

No timing retry, test exclusion, test-order dependency or reduced parallelism is
an accepted release prerequisite.

## Follow-up priority

RW17 owns the still-open account-deletion transaction. RW18 then owns contact
email change, phone verification and email-verification principal/epoch
boundaries. All live and owner gates remain closed.
