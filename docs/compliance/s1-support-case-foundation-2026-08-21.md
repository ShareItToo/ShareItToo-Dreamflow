# S1 support case foundation - technical compliance record

Status: implementation candidate, non-live and fail-closed. Public or
production support operation is not authorized.

## Bound source

The package implements the current Drive Support Packet start guide, master
policy, case taxonomy, case-handling SOP, automation approval specification,
source-of-truth summary and 167-scenario test matrix. The SOP requires safety
and privacy screening first, explicit evidence classification, human approval
at yellow/red boundaries, append-only audit and verified implementation before
success is communicated.

This record does not treat the Support Packet as professional legal approval,
an operator assignment, a retention schedule or permission to contact users.

## Implemented controls

- Exact 13-family taxonomy with database-enforced family/subtype pairs.
- Exact lifecycle states and transition graph; `paused` is impossible.
- Server-owned priority, severity, owner role, waiting target, flags and
  approval level.
- Red decision boundary for money, privacy, authority, account takeover and P0.
- Opaque case number, scoped idempotency, optimistic lock version and row lock.
- Active-case `nextAction` and bounded future `nextUpdateAt` invariants.
- P0 resolution and closure require admin authority.
- Append-only policy snapshots and case events.
- User/staff projection separation and IDOR-safe case reads.
- Linked booking/payment/refund/payout participant checks before intake write.
- Authenticated no-store user routes and Staff-Step-up queue/transition routes.
- Simulation-only application route and simulation/internal-testing database
  enum; no live mode exists.
- Account export includes only communicated/user-visible support data; draft
  outbound messages, uncommunicated decisions, restricted evidence, staff
  transition reasons and internal event payloads remain excluded.
- Retention inventory counts every new support dataset without applying a
  period or enabling deletion.
- Account erasure blocks on attached support records until retention treatment
  is professionally approved.

## Verification

Focused domain, workflow, route, migration, privacy and retention tests pass.
The complete backend suite passed with local synthetic configuration: 368
tests passed, zero failed and the PostgreSQL integration test was skipped
locally because `TEST_DATABASE_URL` is absent. GitHub Actions then executed the
PostgreSQL 16 integration path and complete regression successfully for exact
commit `64874b9eba0b6b2fca85f1c4f3cdfed0d702f095` in run `32491241853`.

The CI-compatible technical regression passes locally with all bound
validators, 321 Flutter tests, the Web build/smoke and Android debug APK build.
The run used only local synthetic configuration and produced no signed or
published artifact.

Both exact source-hash validators pass:

- Privacy: draft, `approvalAllowed=false`, final binary privacy scan open.
- Retention/deletion: draft, nine open decisions, execution blocked and Store
  gate open.

No credential value, raw device identifier, production endpoint, provider call
or external message was used.

## Explicit remaining work

- Record immutable support policy snapshots from approved source versions.
- Add bounded user message/evidence submission with malware, file, privacy and
  third-party-data controls.
- Add decision proposal/approval/communication and appeal workflows without
  coupling approval to irreversible implementation.
- Map all 167 Support Packet scenarios to executable coverage and evidence.
- Obtain professional retention/erasure treatment, operator assignments and
  communication authority before any live support use.
- Keep payment/refund, account restriction, public pilot, Store, Cloud and
  production gates closed until separately satisfied.
