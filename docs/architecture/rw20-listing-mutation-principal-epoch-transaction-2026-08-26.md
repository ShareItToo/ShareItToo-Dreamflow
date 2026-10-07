# RW20 listing mutation principal/epoch transaction

## Decision

Every repository-owned owner-listing mutation is one exact-subject
transaction. The UI loads a token-free listing context, captures its exact
principal plus a monotonically increasing screen-action epoch before the first
`await`, and revalidates both before a remote call, after every media or
assistant await, before a result surface and before navigation.

The listing mutation coordinator is the only user-facing write entry point.
Screens do not call legacy `DataService` or `BackendRepository` listing writes.
The exact owner flows through the coordinator and data layer into the
`ForOwner` repository methods, which acquire credentials only through
`AuthService.accessTokenForOwner`. A request prepared by Account A therefore
cannot acquire Account B's credential after a transition.

## Result truth

Results remain mutually exclusive:

1. `rejected` requires an exact checked-in HTTP status plus structured error
   code. `408`, intermediary failures, unstructured `4xx`, and non-allowlisted
   codes are never safe rejection evidence.
2. `remoteAccepted` records the expected backend response. A later owner
   transition, local commit failure or local verification failure cannot turn
   that truth into "not changed".
3. `outcomeUnknown` covers timeout, transport, malformed, intermediary and
   non-allowlisted responses where server commit cannot be proved either way.
4. `localUnavailable` means a local step failed; its `remoteAccepted` bit
   preserves whether the server had already accepted the change.
5. `principalChanged` suppresses stale A results under successor B.

Every affected UI handles `ListingMutationFailure` before its generic catch,
so these states cannot collapse back into a false success or false failure.

## Principal, local commit and event invariant

`ListingMutationContext` binds the loaded listing user to an exact token-free
session owner. `ListingMutationActionOwner` adds the screen action epoch. The
coordinator checks both sides of the data-layer call. The data layer checks the
same owner before payload construction, immediately before the backend request,
after remote acceptance and around the local preference commit. A failed
mid-write owner check rolls the local catalog back.

The last-create event is stored and consumed only for its exact owner. An A
event can never be interpreted as B's listing truth.

## Interaction and navigation invariant

Each mutation surface owns a `ListingMutationInteractionController`. Account
transition invalidates its context and action epoch. Dialogs and pushed routes
are tracked by their exact route object and removed only if still owned by the
stale A action. The controller never pops the globally current navigator route;
therefore invalidating A cannot dismiss an unrelated dialog or page opened by
B.

Create/edit, draft/publish, status changes, deletion, photo selection/upload,
Blue Ocean analysis/review, supply enrichment, created-result UI and owner
preview navigation all use this invariant.

## Existing backend contracts

RW20 binds to existing listing, Blue Ocean, upload and supply-enrichment
contracts. It changes no backend route, schema, provider or runtime setting.
Legacy data/repository methods remain only for separate trusted compatibility
paths; permanent inventory requires zero legacy listing write calls from UI
screens.

## Boundaries

RW20 changes repository-owned client transaction coordination, deterministic
tests, inventories and evidence only. It performs no Production, VPS, DNS,
cloud/Firebase, Store/Play, payment, real-provider, pilot, legal, PR-merge,
GitGuardian or Git-history action.
