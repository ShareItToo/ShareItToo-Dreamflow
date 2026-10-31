# RW16 session-transition principal/epoch invariant

## Decision

Profile logout and LoginScreen session clearing use one injectable
`SessionTransitionService`. Every action binds either an exact session owner or
a previously confirmed no-session epoch before its first `await`. No flow may
infer successful logout or guest state from an exception, a null read, or a
stale completion.

## Durable invariant

1. An authenticated owner is `(userId, sessionId, normalized email, local
   createdAt, auth epoch)`. Tokens are excluded from UI-owned values.
2. Every app-owned persisted-session write and removal runs through one FIFO
   mutation queue. A successful mutation increments the epoch.
3. Session removal compares the captured owner inside that queue immediately
   before removing the key. An already stored successor is preserved.
4. Current-profile removal independently compares user id and email inside the
   profile mutation queue. It never uses a broad clear after an asynchronous
   auth action.
5. A transition completion is presentable only while its completion epoch is
   still current and persisted session absence is definite before preview
   mutation and again before navigation.
6. Profile logout confirmation owns one `TrackedDialogRouteHandle`. An A-owned
   route is removed by identity after A to B; a newer B route is untouched.
7. Login bootstrap revalidates the owner after profile hydration, before stale
   session clearing, after preview mutation and before navigation. A null
   session becomes guest truth only with a stable epoch and definite key
   absence.

## State semantics

- `owner current`: exact persisted owner and unchanged epoch.
- `server-confirmed/local exact clear`: an owner-bound removal receipt exists.
- `confirmed empty`: the session key is definitely absent at an unchanged
  epoch.
- `unknown/stale`: any mismatch, malformed value, storage failure or changed
  epoch. The caller performs no success UI, guest mutation or navigation.

## Boundaries

RW16 changes only device-local session/profile transition coordination and its
tests/evidence. It does not change backend routes, production configuration,
Firebase configuration, Store state, payment, DNS, VPS, live traffic, legal
approval, PR merge state or external owner gates. Account deletion remains RW17;
contact and verification actions remain RW18.
