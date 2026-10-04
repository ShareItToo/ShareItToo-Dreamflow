# RW3 reduced Wave-0 local concurrency and cross-surface consistency

Status: **VERIFIED — REGRESSION AND CODEQL GREEN**

## Decision

RW3 serializes each local Gemerkt and Mietkorb read-modify-write transaction.
Invocation order, not scheduler timing, decides the resulting revision. The
queue becomes idle after its final operation and a rejected mutation cannot
poison a later valid operation.

Wishlist metadata and item assignments now commit as one verified canonical
`wishlist_state_v2` document. `wishlists_meta_v1` and `wishlist_assign_v1`
remain compatibility mirrors only. Once the canonical document exists, reads
never combine it with a mirror from another revision. A process interruption
while updating a mirror therefore cannot create a torn visible state.

## Consistency policy

| Surface | Concurrency rule | Interruption rule | Visible refresh rule |
| --- | --- | --- | --- |
| Gemerkt assignments | Serialize complete read, target validation and canonical write | Preserve malformed input; canonical revision is authoritative | Announce only after the canonical commit succeeds |
| Gemerkt folders | Serialize add, rename and delete with assignment cleanup | Metadata and assignment changes share one canonical revision | Open folder, search, Explore, cards and details reload through a coalescing coordinator |
| Legacy saved IDs | Serialize and verify the complete list | Never reinterpret a failed write as success | Emit a separate saved-item event |
| Mietkorb items/projects | Serialize the complete local snapshot mutation | The existing atomic cart document remains authoritative over its project mirror | Open Mietkorb reloads after the committed cart event |
| Guest-to-account sync | Serialize snapshot ownership, upserts and final purge against local cart mutation | Purge remains after all idempotent upserts | A final cart event follows the local purge |

## Deterministic matrix

- three concurrently invoked item assignments survive in one revision chain;
- three concurrently invoked custom-folder additions remain distinct;
- one rejected target does not poison the next valid queue operation;
- a canonical saved-state snapshot survives process-style recreation with two
  deliberately stale, malformed compatibility mirrors;
- three concurrently invoked cart-item additions survive with revision three;
- committed Gemerkt and Mietkorb mutations emit their exact logical keys;
- an already-open search changes from unsaved to saved after an external local
  mutation without navigation or polling;
- an already-open Mietkorb shows an externally added project;
- compact 320 by 568 dp at 200 percent text fails closed on a corrupt canonical
  document and recovers after a valid revision event.

No sleep, retry loop, timing threshold, serial test flag, reduced test
parallelism or relaxed assertion is part of the implementation or matrix.

## Lifecycle and rollback

The local privacy export includes the canonical key and reads without seeding
or repairing participant data. Both confirmed account-deletion paths remove
the canonical key and all compatibility keys through the existing bounded
purge. Rollback must revert the canonical reader/writer, both mutation queues,
event keys, listeners, lifecycle manifest and permanent tests together.

## Boundaries

All fixtures are synthetic and local. RW3 performs no candidate build, device
change, external request, AI call, payment, Firebase/Play, Production, VPS,
DNS, Cloud, public pilot, PR merge, credential inspection or history rewrite.
The historical GitGuardian owner review and every live gate remain unchanged.
