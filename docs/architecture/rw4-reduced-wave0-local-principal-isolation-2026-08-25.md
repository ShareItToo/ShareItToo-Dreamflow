# RW4 reduced Wave-0 local principal isolation

Status: **IMPLEMENTED — FULL TECHNICAL REGRESSION PASSED; CI PENDING**

## Decision

RW4 makes every reduced Stage-A local `Gemerkt`, Merkliste and `Mietkorb`
snapshot belong to exactly one opaque local principal. The principal is either
the explicit `guest` bucket or a stable SHA-256-derived token keyed from the
authenticated session identity. Email addresses, user IDs and session secrets
are never persisted in the principal registries.

`wishlist_state_v3` and `rental_cart_v2` are the canonical principal-scoped
documents. The earlier unscoped keys remain guest-only compatibility inputs and
mirrors. An authenticated account is never copied into them.

## Principal transition policy

| Transition | Read rule | Write rule | Event rule |
| --- | --- | --- | --- |
| Account A to guest | Guest reads only `guest` | The queued mutation keeps the principal captured for that operation | Login/logout announces saved IDs, wishlists and cart |
| Guest to account B | B reads only B; guest intent is a separate sync bucket | Guest sync binds the opaque B token before remote upserts and clears only after every upsert | Open surfaces reload through existing coalescing listeners |
| Account B to account A | A's last-known-good bucket is restored | B cannot overwrite A even if a queued B mutation finishes after the session changes | A fresh principal event prevents stale UI |
| Process recreation | The same identity derives the same opaque token | Registry revision advances atomically | No polling or timing dependency |

## Legacy and corruption policy

- Valid unscoped V1/V2 state can migrate only to `guest`, never to whichever
  account happens to sign in first.
- Malformed unattributed legacy bytes remain stored and are quarantined. An
  account can create its own independent state; guest fails closed.
- A malformed bucket with a valid opaque token is quarantined locally. Other
  principals retain read/write access and preserve the quarantined raw bucket
  byte-equivalently through later registry writes and process recreation.
- A malformed top-level registry fails closed for every principal and the UI
  preserves its last-known-good snapshot with an accessible retry state.
- The combined valid and quarantined registry is bounded at 12 principals. A
  thirteenth principal is rejected; existing state is not silently evicted.

## Export and deletion

The local privacy export is a current-principal snapshot. It identifies the
scope only as `authenticated-account` or `guest-device`, never by account ID or
email. Confirmed deletion removes only the active principal's saved/cart
bucket and its matching quarantined bucket. Other principals and unrelated
device preferences remain intact. A guest sync bucket is also removed only
when its opaque sync owner matches the account being deleted.

## Deterministic matrix

The RW4 matrix covers A to guest to B to A saved state and carts; guest-only
legacy migration; current-principal export and deletion; opaque token stability;
process recreation; corrupt unattributed legacy; login/logout surface events;
an immediately replaced session with already-invoked saved/cart mutations;
bounded capacity; isolated corrupt saved and cart buckets; and compact 320 by
568 dp at 200 percent text through account switch, corrupt top-level state and
recovery.

The proof uses invocation and persisted revision order, not scheduler timing.
No sleep, retry loop, timing threshold, serial test flag, reduced test
parallelism or rate-limit accommodation is a retained prerequisite.

## Boundaries

All fixtures are synthetic and local. RW4 changes no binding request,
contract, quote, acceptance, payment, refund, payout, handover, return, damage,
`needsReview`, provider, candidate, Pixel, Firebase/Play, Production, VPS, DNS,
Cloud, public-pilot, PR-merge, credential or Git-history state. The historical
GitGuardian owner review and every external/live gate remain unchanged.
