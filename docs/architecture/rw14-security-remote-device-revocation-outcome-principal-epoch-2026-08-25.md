# RW14 remote-device revocation outcome and principal epoch

Date: 2026-08-25
State: verified; implementation, full local regression and exact-head CI passed

## Decision

Revoking one remote session is a server-authoritative mutation with three
distinct results:

- an allowlisted structured 4xx is a definite rejection of this request;
- a completed server response followed by failed exact-principal verification
  is a confirmed server revocation with unsafe local finalization; and
- timeout, transport failure, 5xx or an invalid response is an unknown remote
  outcome.

Only the first result may say that the server rejected the request. A confirmed
result must preserve the server success even when the local Account A context
can no longer be trusted. An unknown result must never be presented as a
definite failure or invite a blind repeat.

## Prompt, target and response boundaries

The target session id is bound to the Account A device row and to the security
epoch before the confirmation dialog opens. If Account B activates while the
dialog is open, confirming the stale A dialog performs no service call.

The service binds every typed failure to the exact normalized target id and
records whether the invoking Account A session is still definitely current.
After a server-confirmed 204, failed principal verification becomes
`confirmedLocalFinalizationFailed`; it is not collapsed into a generic local
error. For rejection and unknown outcomes, current-principal proof is attempted
without mutating either A or B.

The UI presents a typed result only when target id, principal proof and operation
epoch all match. A later Account B activation also dismisses an already open
Account A revocation-result popup. No current-session key or successor Account B
credential is cleared by this single-target operation.

## Cache truth

Successful same-account revocation removes only the exact confirmed target from
the currently bound server list. Every safely presentable typed failure instead
invalidates the list into an explicit persistent error with an `Erneut laden`
action. It never converts rejected, confirmed-local-failure or unknown into an
apparently server-confirmed empty list.

The existing backend `DELETE /v1/auth/sessions/:id` route remains unchanged. It
updates the exact current user's non-revoked target session, revokes its refresh
tokens, deletes its push devices and writes the audit event in one transaction
before returning 204.

## Deterministic proof

Red-first execution produced two direct failures before the fix: the typed
three-way contract did not exist, and a stale Account A confirmation executed
one Account A target call after Account B had activated. Eleven focused RW14
tests now cover all three result types, structured rejection, timeout/5xx/invalid
response, confirmed and unknown A-to-B service containment, current-session
preflight, distinct UI wording, explicit cache invalidation, presentation
suppression without relying only on an event, stale-prompt suppression and
open-popup dismissal on account switch.

The combined RW10 + RW12 + RW13 + RW14 + B10 matrix passes 69 tests.

The supported full regression passed at implementation head
`38a89e67acefcdc1f756dabc7febd5f1ab9f9813` under standard parallelism: 1,897
repository-owned tool tests passed with zero skips, 558 Flutter tests passed
with the three documented profile skips, analyzer reported zero issues, and
Web/Wasm, loopback smoke and Android debug (448 tasks, `minSdk 24`) passed. No
timing, retry, worker-reduction or test-exclusion workaround was used.

GitHub Regression run `32868503103` and CodeQL run `32868503117` both passed
against that exact implementation head. The branch had zero open GitHub code
scanning alerts at closure recording time.

## Separation and exclusions

RW13 stays frozen at implementation head
`1011ef52d8c9f15b80798242cb5e0368b75af53e` and closure commit
`4b724c495278caf862906d69dceefb748428b463`. RW14 changes only the
single-remote-session client contract, its prompt/response presentation and
cache handling, deterministic tests, evidence and mechanical hash bindings.

No backend route, production, VPS, DNS, Cloud, Firebase, Store/Play, payment,
live auth/provider/support traffic, external AI, pilot, real money, legal-owner
decision, PR merge, GitGuardian finding or Git history is changed.

## Residual boundary

RW14 does not claim live-backend, process-termination, private release artifact,
Store or physical-device proof. A structured 404 proves that this request did
not mutate a row but cannot by itself distinguish an already absent target from
an unauthorized or stale target; the UI therefore requires a fresh list. The
separate logout-all confirmation-dialog prompt epoch remains a bounded next
security candidate.
