# RW15 security interaction owner and route invariant

Date: 2026-08-25  
State: verified; local clean-checkout regression and exact-head GitHub
Regression/CodeQL passed

## Package identity and lineage

The active package is **RW15**, not RW12. RW12 was the earlier
password-result principal-epoch package. RW15 starts from the verified RW14
closure commit `fe59d9dab99b8517f61ec1c112a4ce50c877d7f6`.
The verified RW15 implementation HEAD is
`9db0b98981e3f8f7ae7f654193cfc00532799177`.

- RW10 implementation: `d72e18eb607bb3f9ed7baf09ab7212f3ef695ee5`
- RW10 closure: `5ad324704db716e39f8b79347167d24813f1596a`
- RW11 implementation: `7768651bf63d266fb8d98f75f2883536e77adde0`
- RW11 closure: `521f565a77faecd8de006f355c8fced4b363a8d6`
- RW12 implementation: `0a13df419f4abd5e30858503f4e93f23c9e9d9f1`
- RW12 closure: `fcfdbc352185d3bf50a735478f03e32ffe709767`

## Red-first findings

Two deterministic widget tests failed before the correction. A logout-all
confirmation opened under Account A performed one logout-all call after
Account B activated, and an already rendered Account A unknown-result popup
remained visible under B. A third service test proved that status-only 4xx
classification could turn an unstructured `request_failed` response into a
definite rejection.

## Permanent interaction invariant

Every guarded `SecurityScreen` action must synchronously capture an interaction
owner before its first `await`. The owner is the exact current principal
session ID plus the screen security epoch. The owner is checked again after a
confirmation and immediately before the service invocation. Result display and
navigation require either the same exact owner or, only for an exact
credential/logout-all finalization, a fail-closed proof that the local session
key is absent and that no later epoch has occurred.

The three guarded actions are password change, single remote-session
revocation and logout-all. Static wiring tests verify capture ordering, the
pre-remote owner gates, typed-result ordering and navigation guards.

## Exact dialog ownership

`TrackedDialogRouteHandle<T>` stores the concrete `Route<T>` instance pushed
for one dialog. Dismissal calls `NavigatorState.removeRoute` with that exact
route identity. It never pops the top of the navigator. Therefore a stale A
dialog can be removed even if a newer B-owned dialog sits above it, while the B
dialog remains untouched. `AppPopup` timers and close controls use the same
identity-bound mechanism, eliminating the former global `maybePop` race.

## Definite rejection contract

A response is a safe rejection only for these exact status/code pairs:

- common: `401 authentication_required`, `401 invalid_or_expired_session`,
  `401 account_not_active`, `429 rate_limit_exceeded`;
- password only: `400 password_too_short`, `400 password_too_long`,
  `400 password_too_weak`, `401 invalid_credentials`;
- single-session revocation only: `404 session_not_found`.

`408`, 5xx, `invalid_server_response`, `request_failed`, non-allowlisted or
wrong-status 4xx values and arbitrary transport exceptions are unknown
outcomes. A syntactically valid 4xx JSON object without an `error` field becomes
`request_failed` in `BackendHttp` and is therefore not a definite rejection.

The remote service call is enclosed in a narrow inner `try`. Its typed catch is
followed by a generic pre-remote catch, and all success processing is located
after both catches. UI work performed by a typed handler or a confirmed success
therefore cannot fall into the generic catch and be relabeled “not changed”. A
local-absence proof is repeated immediately before login navigation, so a
successor session appearing during result presentation blocks that navigation.

## Repository-wide action inventory

Logout-all is not the final repository location of this race class. The RW15
inventory also finds reachable owner-sensitive flows in profile logout,
account deletion, contact email change, phone verification, contact email
verification and LoginScreen session cleanup. Those flows are explicitly P0/P1
open and keep `BUILD_READY` closed. The old `ChangePasswordScreen` is a local
placeholder but is unreachable from account settings and remains protected by
the B10 reachability test.

The RW15 validator owns the exact call-site inventory. A new matching security
mutation call or a removed inventory entry fails the supported regression.
Future packages must move every reachable open entry to `guarded`; they may not
silently delete it from the inventory.

## Verification closure

The first implementation commit contained a synthetic test-password literal
that matched the existing high-confidence repository secret rule in Linux CI.
The current test constructs the synthetic value at runtime. The immutable old
commit, exact rule and test path are recorded in the reviewed-history baseline;
no value is retained and the scanner is not disabled or relaxed. The complete
history scan reports 15 exact reviewed findings and zero unexpected findings.

Local full regression and the independent clean-checkout proof passed on the
verified implementation HEAD. GitHub Regression `32877417222` and CodeQL
`32877417279` passed on that same HEAD with zero open code-scanning alerts.

## Boundaries

No backend route, production, VPS, DNS, Cloud, Firebase, Store/Play, payment,
live auth/provider/support traffic, external AI, pilot, real money,
legal-owner decision, PR merge, GitGuardian finding or Git history is changed.
