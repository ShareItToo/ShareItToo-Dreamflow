# S4BS/S4BT support status and decision alignment

Status: technically verified, non-live. The exact implementation commits are
`daf7a79e6bdb36926dce46fea37756af0fb89b58` for the canonical status machine
and `5e6f99cf074b66d3dd9119f30903894bcb224350` for its complete decision path.

## Canonical source

The source is Drive file `10_status.json`, file ID
`1qj0md6DoHt7lDAfIvFtmMiT0vQ48KbYG`, Support Packet version
`SIT_SUPPORT_PACKET_V1_2026-08-20`, SHA-256
`3cc58111a6079f9f82ce90d9fed18d4a8b10bd27191777ed30130d03fbbf2f55`.
It defines exactly 11 statuses and 18 directed transitions.

The prior implementation had 12 statuses and 22 transitions. It included the
non-canonical `implementation_pending` state, admitted extra transition edges
and omitted canonical edges. That was structural drift, not an alternative
status-machine version.

## Exact 11/18 state machine

The domain, workflow, Flutter labels and PostgreSQL constraints now share the
canonical status set and graph. `implementation_pending` is removed from
active application behavior. Migration `064` refuses to proceed if any stored
case, event or action still contains a non-canonical state or transition. It
does not silently rewrite historical truth.

The old compatibility column is retained under a NULL-only constraint instead
of being destructively dropped. The down migration also refuses rollback when
new canonical states or transitions could not be represented safely.

Resolution remains stronger than a status-name check: the case must bind an
approved immutable decision, matching approval and decision hashes, verified
successful implementation and a recorded communication. None of those records
executes a real-world action.

## Complete green/yellow and red decision paths

The canonical `under_review -> decided` edge permits a green or yellow
decision without separate approval by a senior support reviewer. After the
11/18 alignment, the former draft function still rejected that path and would
have deadlocked such cases. S4BT closes that gap explicitly.

Green and yellow decisions can now be created directly only by an active
Administrator, the current application's bounded equivalent of the canonical
senior-reviewer role. The decision is inserted already approved with
`approval_path=direct_single_reviewer`, the exact immutable payload hash and
the same named reviewer as decider and approver. Distinct event and audit
actions preserve how approval occurred.

Red decisions use `approval_path=separate_review`, enter
`decision_pending_approval` and retain the existing distinct-reviewer
four-eyes rule. Application and database both reject a direct red decision or
self-approval on that path. PostgreSQL validates role, active-account state,
case status and approval level before accepting a direct decision.

Implementation and communication remain Administrator-only,
simulation/internal-testing-only and valid solely while the case is in
`decided`. Payload, approval, implementation and communication evidence remain
immutable and hash-bound.

## Safety and rollout boundaries

Migrations `064` and `065` are reversible only where doing so preserves stored
truth; they stop rather than delete or coerce incompatible data. Privacy,
Retention and P0B evidence inventories bind both migration directions. Privacy
and Retention remain draft/fail-closed, the invited pilot remains ineligible
and P0B remains `HOLD` / `NO-GO`.

This package authorizes no live support decision, message, refund, payout,
account or listing measure. It changes no production, PSP, Store, Firebase
Console, Cloud/VPS/DNS, signed release, pilot activation or PR merge state.
