# RW18 contact and verification principal/epoch transaction

## Decision

Email change, phone verification, contact-email verification and login-email
verification are exact-subject transactions. The UI captures a token-free
principal or normalized login-email owner plus a monotonic action epoch before
the first `await`. Every prompt transition, credential acquisition, provider
step, backend request, refresh, result surface and navigation revalidates that
owner. A delayed Account A result is never displayed or executed as Account B.

## Result semantics

The four flows preserve these mutually exclusive truths:

1. `rejected`: only an exact status-code plus structured backend error-code
   contract proves that the operation was refused. `408`, intermediary,
   unstructured and non-allowlisted `4xx` responses are not rejections.
2. `accepted` or `confirmed`: the backend returned the exact expected success
   shape. A later local problem may not turn that truth into "not changed",
   "not sent" or "not verified".
3. `confirmedRefreshDeferred`: phone confirmation succeeded, or an email link
   may already have been confirmed, but the current profile could not be
   refreshed. Backend unavailability is never rendered as an unverified
   server truth.
4. `outcomeUnknown`: timeout, transport, intermediary, malformed success or any
   non-allowlisted response cannot prove whether the request committed. The UI
   advises checking current state before retrying.
5. `principalChanged`: the captured owner or action epoch is no longer current.
   No stale result is presented under the successor.

Email-verification request remains enumeration-resistant: a valid request is
accepted without asserting account existence or delivery. Login resend is
bound to the exact normalized input and action epoch that produced the failed
login result.

## Phone-provider invariant

The phone challenge contains Account A's exact auth owner and a phone-attempt
epoch. Before Firebase invocation, credential conversion, token acquisition and
backend confirmation, both are rechecked. The temporary Firebase identity is
also bound to its exact UID and attempt epoch. Cleanup signs out only when both
still identify that attempt; it cannot sign out a newer B attempt, including a
newer attempt that happens to resolve to the same UID.

If the backend confirms phone verification but local Firebase sign-out fails,
the typed result retains `remoteAcceptedOrConfirmed = true` and tells the user
that local security cleanup is incomplete. It is never collapsed into a clean
success or an assertion that the number was not verified.

## Route and navigation invariant

1. Every contact dialog and modal sheet has an exact tracked route handle.
2. Account-change cleanup removes only the route owned by the stale action.
3. It never calls a global `Navigator.pop` or removes the current top route.
4. A newer B-owned dialog or navigation element therefore remains intact.
5. Login verification-result dialogs use the same exact-route rule and are
   invalidated by any normalized-email/action-epoch change.

## Backend contract binding

RW18 binds to the existing repository backend only. It does not change routes
or schema. Email change expects `202 {accepted:true}`; email verification
request expects enumeration-resistant `202 {accepted:true}`; phone status must
report `firebase-phone`; phone confirmation expects `{verified:true,user}`.
Exact structured failure allowlists are maintained in the client and verified
against the checked-in backend implementation. All other responses remain
unknown or locally unavailable according to whether a remote mutation could
have occurred.

## Boundaries

RW18 changes local client coordination, deterministic synthetic tests,
inventory and evidence only. It sends no email or SMS, signs into no live
provider, and changes no backend runtime, Production, VPS, DNS, cloud/Firebase
configuration, Store/Play state, payment, pilot, legal decision, PR merge,
GitGuardian content or Git history.
