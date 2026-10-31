# G5B technical compliance record - listing sets

Status: technical implementation candidate; public/live activation prohibited.

## Scope and boundary

`G5B-2026-08-21.1` implements optional same-owner SIT Sets and 1-Stop Sets
behind `LISTING_SETS_ENABLED=false` and
`SIT_LISTING_SETS_TECHNICAL_UI_ENABLED=false`. Backend production enabling is
rejected. Flutter release-mode access is impossible. No production, VPS,
OpenClaw, SSH, DNS, cloud console, real payment, Store, signing, external AI,
external analytics or provider-account action is part of this package.

## Persistence and lifecycle

- Migration `031_g5b_listing_sets.up.sql` adds stable owner aggregates,
  immutable sequential versions and normalized version-member snapshots.
- Two to twelve members are allowed and at least two are required. All member
  listing IDs are unique within a version.
- Workflow and database triggers independently enforce the same owner, current
  catalog schema, Germany, currency and exact stored member context.
- Active 1-Stop versions require one exact internal handover-location hash.
  That hash is not exposed to renters.
- Owner revisions lock the stable aggregate and require `expectedRevision`.
  Parallel stale writes fail instead of silently overwriting membership.
- Active, paused and ended lifecycle states are version events. An ended set
  cannot be revised again.

## Availability, quote and ranking truth

- Discovery and direct resolution re-read the current set version and current
  listing state for the selected period.
- The established booking quote preview runs with `persist:false` for every
  current member. No set quote or availability hold is stored.
- If any required member is inactive, moderated, context-drifted or unavailable,
  the set is not shown. Optional unavailable members are omitted and counted.
- Set totals are exact sums of the returned item quote allocations in one
  currency. Security deposit remains zero and no set discount exists.
- The only set-ordering signal is fewer handovers. Business status, price and
  hidden manipulation are explicitly absent from ranking.

## Contract and operational isolation

Set records are user intent, not transactional truth. Every member remains
individually bookable. Set management and resolution create no request, booking,
contract, payment, refund or damage case. Future group execution must continue
through the established G3/V5.2 item boundaries:

- price allocation: immutable item quote;
- handover and return: V5.2 item evidence;
- damage and `needsReview`: V5.2 item case;
- cancellation/refund: V5.1/V5.2 item obligation;
- audit: item booking and quote identifiers.

## Privacy, export, deletion and retention

- Set title, membership, role, order and immutable context snapshots are
  account-bound owner content.
- Account export includes all set aggregates, versions and members.
- Confirmed account erasure deletes owner listing-set intent before the retained
  listing records are minimized and the account is anonymized.
- The read-only retention inventory adds `listing_sets`,
  `listing_set_versions` and `listing_set_version_members` under `userIntent`.
- Privacy stays draft with 17 data types and nine services. Retention stays
  draft with all nine decisions open and execution blocked.

## Verification gate

Package closure requires focused same-owner, bounded membership, 1-Stop
location, optimistic revision, required availability, item allocation,
item-bound evidence/damage, ranking and disabled-gate tests. It also requires
the complete backend and Flutter regression, privacy/retention validators,
dependency/secret checks, web and Android debug builds, and exact green GitHub
Actions evidence at the implementation head.

## Migration and rollback

Migration `031` is additive and does not modify any historical listing,
booking, legal, evidence or payment object. The down migration removes only
empty G5B objects. Once any set intent exists it raises
`G5B rollback blocked: listing set data exists`. Source rollback before use is
a revert of the G5B implementation plus restoration of the exact
Privacy/Retention source-hash inventories.

## Remaining gates

Public/live activation, a set-specific legal presentation, real-money flow,
production migration execution, Store submission and any later Business/global
variant remain outside G5B authorization.
