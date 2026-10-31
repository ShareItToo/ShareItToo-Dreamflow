# P6-C2 owner participation API — source-only

This package adds three private owner routes over migration 104 without a
schema change. `PLANNER_SUPPLY_PARTICIPATION_ENABLED` defaults to `false`.
Enabling it requires the existing Planner core, inventory and demand technical
flags, and a development/test/staging environment; invalid values and missing
prerequisites fail startup. This package does not enable a runtime flag.

| Route | Input |
| --- | --- |
| `GET /v1/mission-supply-participation` | Authenticated current owner only |
| `POST /v1/mission-supply-participation` | `expectedRevision`, `status` (`active` or `withdrawn`) |
| `POST /v1/mission-supply-participation/items/:shelfItemId` | `expectedParticipationRevision`, `expectedRevision`, `needKey`, `availabilityStatus` (`confirmed_available` or `withdrawn`) |

Both POST routes require `Idempotency-Key`. The sole accepted need key is
`plant_container_equipment`. Root revision zero means initial creation; item
revision zero means its first confirmation/withdrawal. IDs, owner, actor,
timestamps and actual revision increments are server-owned. New commands return
201 and exact replays return 200; all route responses are private/no-store.

Responses separate the historical `commandResult` from the current
`participation` snapshot. Replaying an old activation after withdrawal reports
the old result and current withdrawn state without applying another change.
The item status records the owner's last statement only: root withdrawal does
not rewrite item history, and no matching/recipient eligibility is computed.
`matchingActivated` is always false.

Owner locking serializes first creation, different idempotency keys and
root/item revisions. Missing, foreign and deleted Shelf items use the same
404. Activation and confirmation require a private-use confirmation, clear
marketplace review and no active booking/account suspension. An active owner
can still withdraw under booking suspension or lost marketplace eligibility.
Inactive accounts, revoked/incomplete MFA sessions and account suspension
remain blocked. No requester, recipient or pairwise blocking target is added.

Account erasure explicitly deletes the owned participation graph before
deleting private Shelf items because the application tombstones user rows.
Tests cover populated hard-delete cascades and the application erasure path,
counting roots, revisions and both command families. The existing access-copy
export and count-only retention inventory remain authoritative.

Focused verification covers actual config import, default-off HTTP access,
strict payloads, owner isolation, concurrency, revision conflicts, rollback,
historical replay, withdrawal/reconfirmation, persisted account/session/MFA
checks, populated export privacy, owned-item/account deletion and unchanged
foreign-owner state and external-effect counts.

The P6-A injected synthetic resolver remains unchanged. Region/location,
matching, final legal wording, retention durations, UI, notifications,
publication, booking, contracts, payment, providers and live activation remain
outside this package. D3/D4 and professional review remain open.
