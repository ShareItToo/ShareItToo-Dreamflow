# RW17 account-deletion principal/epoch transaction

## Decision

Account deletion is one exact-principal transaction. The UI captures Account A
and its auth epoch before the first `await`; preflight, remote mutation, result
presentation and navigation each revalidate that owner. A later Account B is
never treated as the subject of A's request and never receives A's result UI.

## Result semantics

The service exposes five mutually exclusive results:

1. `rejected`: the backend returned one allowlisted structured rejection:
   `401 authentication_required`, `401 invalid_or_expired_session`,
   `401 account_not_active`, `401 invalid_credentials`,
   `409 account_deletion_blocked`, or `429 rate_limit_exceeded`.
2. `confirmed`: the backend confirmed deletion and exact-A local finalization
   completed with a stable, definitely empty local auth session.
3. `localFinalizationFailed`: the non-backend local QA path partially failed.
   It never claims a server confirmation and never says that no work started.
4. `confirmedLocalFinalizationFailed`: the backend confirmed deletion, but
   exact-A local cleanup or verification did not complete. The UI may not say
   that the account was not deleted.
5. `outcomeUnknown`: transport, timeout, intermediary, malformed or any other
   response cannot prove whether the backend committed. `408` and unstructured
   4xx responses are deliberately not safe rejection evidence.

Preflight has a separate unavailable/invalid-response failure. Failure to load
preflight is never converted into a server-confirmed empty blocker list.

## Durable invariant

1. The interaction owner is captured synchronously before the first `await`.
2. Owner and epoch are checked before preflight, before remote deletion, before
   every result surface and immediately before navigation.
3. A server-confirmed A deletion purges A's principal-scoped saved, safety and
   convenience data by explicit identity. It anonymizes A's cached profile;
   an already active B profile, session, Firebase installation and local state
   remain intact. A stable B is a successful A-finalization with navigation
   deliberately disabled, not a local-cleanup failure.
4. An unknown remote result attempts only an exact-A sign-out. It never clears
   B and never upgrades uncertainty to deletion success.
5. Success navigation requires both a stable completion epoch and definite
   persisted-session absence. A generic catch cannot merge typed outcomes.
6. Every deletion dialog is represented by its exact tracked route handle. An
   A-to-B transition removes only A's route identity; it never pops the current
   navigator route or a newer B-owned dialog.
7. A prior A deletion marker is cleared only when a later authenticated B
   profile is durably persisted, so it cannot suppress B hydration.

## Boundaries

RW17 changes device-local coordination, manifests that describe the improved
technical deletion semantics, deterministic tests and evidence only. It does
not change backend routes, production, VPS, DNS, cloud or Firebase
configuration, Store state, payment, live traffic, legal approval, PR merge or
external owner gates. Contact and verification actions remain RW18.
