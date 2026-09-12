# RW2 reduced Wave-0 local-state truth and recovery

Status: **VERIFIED — REGRESSION AND CODEQL GREEN**

## Decision

RW2 treats local participant data as untrusted but user-owned state. A corrupt
or unavailable wishlist, assignment, listing or rental-cart document must never
be rendered as a truthful empty collection, and a mutation is successful only
after the retained storage value has been verified. Only category reference data is safely reconstructible
from application-owned defaults.

## State policy

| State | Read behavior | Mutation behavior | Recovery |
| --- | --- | --- | --- |
| Category reference cache | Validate every document and entry | No user mutation | Rebuild only the category key from application reference data |
| Wishlist metadata | Fail closed on malformed documents, entries or duplicate IDs | Validate and verify the complete stored value | Persistent error plus explicit retry; never seed over corrupt bytes |
| Item assignments | Fail closed on malformed or orphan targets | Preserve prior bytes; verify the written map and target list | Persistent unknown state plus explicit retry |
| Listing cache | Propagate its existing fail-closed format error | No mutation in this path | Never translate to an empty wishlist result |
| Rental cart | Preserve the last canonical snapshot | Verify canonical and compatibility writes | Persistent retry; last-known-good state remains visible after later failure |

## Deterministic matrix

- malformed category reference data self-heals without touching users,
  current user, listings or reviews;
- malformed wishlist metadata remains byte-for-byte intact and rejects reads,
  add, rename and delete;
- malformed assignment maps reject reads, grouping, add/move and remove without
  being replaced by an empty map;
- syntactically valid assignments to missing folders fail closed;
- custom-list creation, assignment, rename and deletion are read back through
  the same validators;
- a persisted assignment survives a process-style local-store recreation;
- corrupt listing data cannot become an empty grouped wishlist;
- Mietkorb and folder detail use persistent, scroll-reachable, semantic 48 dp
  retry controls instead of empty-state copy;
- the compact 320 by 568 dp, 200 percent text path accepts rapid repeated retry
  activation through a single in-flight load;
- search disables unknown favorite state, reports failed mutation persistently
  and retains the previous bytes;
- rapid repeated save activation opens only one selection route;
- Explore, item cards, listing options and listing details expose unknown state
  and do not emit success copy after a failed write.

## Boundaries

All fixtures are synthetic and local. RW2 performs no candidate build, device
change, external request, AI call, payment, Firebase/Play, Production, VPS,
DNS, Cloud, public pilot, PR merge, credential inspection or history rewrite.
The historical GitGuardian owner review and every live gate remain unchanged.
