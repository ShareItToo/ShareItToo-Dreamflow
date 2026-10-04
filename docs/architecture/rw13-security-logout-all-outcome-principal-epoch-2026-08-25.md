# RW13 security logout-all outcome and principal epoch

Date: 2026-08-25
State: verified; implementation, full local regression and exact-head CI passed

## Decision

Logout-all is a server-authoritative security mutation with three materially
different results. The client must preserve those results instead of mapping
every exception to a definite failure:

- a structured allowlisted 4xx is a definite server rejection;
- a completed server response followed by failed principal verification,
  exact-session clearing or definite-absence proof is a confirmed server logout
  with failed local finalization; and
- timeout, transport failure, 5xx or an invalid server response is an unknown
  remote outcome.

Only the first result may say that the server rejected the logout. The second
must say that the devices were server-side logged out. The third must say that
the result is unknown and must not invite a blind repeat.

## Server and local truth

The existing backend `/v1/auth/logout-all` route revokes all auth sessions and
refresh tokens for the authenticated user, deletes that user's push-device
registrations and writes the audit event inside one database transaction before
returning 204. RW13 does not change that route or its response schema.

After a confirmed 204, the client verifies that the invoking Account A marker
is still current, conditionally removes exactly that marker and requires the
stored auth-session key to be definitely absent. A valid successor, malformed
bytes, opaque bytes or unreadable storage is never interpreted as signed out.

After an unknown remote result, Account A may already be revoked. The client
therefore attempts the same exact conditional A removal. If Account B replaced
A, the comparison fails and B is preserved. No broad logout or successor-token
operation is used.

## UI principal epoch

The screen captures the success epoch only after the service returns because a
legitimate exact A clear emits its synchronous security-state event before that
return. It then requires definite local absence and the unchanged post-service
epoch immediately before login navigation.

Typed failure UI uses the same rule. An exact A clear may advance the epoch
before the service throws an unknown result, so the failure captures its epoch
after the throw. If the service did not definitely clear A, the original
operation epoch must still match. Account B activation therefore suppresses
Account A's result and navigation.

Confirmed or unknown outcomes also discard the cached device list because it is
no longer trustworthy. A definite rejection retains the list but tells the user
to reload it.

## Deterministic proof

The red-first widget test completed Account A's logout-all service, emitted the
expected exact-clear event and activated Account B before the UI continuation.
Before the fix, the screen navigated to Login under B. After the fix, B remains
on the security screen and no A navigation occurs. A paired control proves that
same-session confirmed logout still navigates after definite absence.

Twelve focused RW13 tests cover the red-first race, the same-session control,
all three service outcomes, exact Account A containment, Account B preservation,
three distinct UI messages and unknown-outcome epoch handling. The combined
RW10 + RW12 + RW13 + B10 matrix passes 58 tests, and changed-file analysis has
zero issues.

The supported full regression passed at implementation head
`1011ef52d8c9f15b80798242cb5e0368b75af53e` under standard parallelism: 1,887
repository-owned tool tests passed with zero skips, 547 Flutter tests passed
with the three documented profile skips, analyzer reported zero issues, and
Web/Wasm, loopback smoke and Android debug (448 tasks, `minSdk 24`) passed. No
timing, retry, worker-reduction or test-exclusion workaround was used.

GitHub Regression run `32862708601` and CodeQL run `32862708673` both passed
against that exact implementation head. The branch had zero open GitHub code
scanning alerts at closure recording time.

## Separation and exclusions

RW12 stays frozen at implementation head
`0a13df419f4abd5e30858503f4e93f23c9e9d9f1` and closure commit
`fcfdbc352185d3bf50a735478f03e32ffe709767`. RW13 changes only logout-all
client result truth, exact-session containment, UI navigation/cache handling,
deterministic tests, evidence and mechanical hash bindings.

No backend route, production, VPS, DNS, Cloud, Firebase, Store/Play, payment,
live auth/provider/support traffic, external AI, pilot, real money, legal-owner
decision, PR merge, GitGuardian finding or Git history is changed.

## Residual boundary

RW13 does not claim live backend, process-termination, release artifact, Store or
device proof. The separate single-remote-device revocation path still has a
binary error presentation and remains a bounded future candidate.
