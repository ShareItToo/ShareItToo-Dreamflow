# S4B support Trust & Safety guards - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`baa5dcc568eb55964fbc7bf3d803a7e11d9b081a`. This is a non-live impact-review
package for Drive scenarios `SUP-106` through `SUP-112`. It does not execute a
listing, booking or account measure, contact an authority, send an external
message, change production, Payment, Store, Firebase Console, Cloud/VPS/DNS or
activate a pilot.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenarios `SUP-106` through
  `SUP-112`.
- Support Master Handbook, Playbooks, Trust & Safety and Tech/Audit records in
  the current SIT Support Packet.
- Existing canonical support-case, administrator step-up, immutable decision,
  audit, Privacy and Retention boundaries.

The source documents require one linked listing and all affected bookings to be
considered for prohibited or dangerous items, a proportionate human decision,
safe access to genuine urgent reporting, protected logs and tamper-evident
audit. They do not authorize automatic action or represent SIT as a safety
certification or competent authority.

## Restricted impact review

Only open `simulation` or `internal_testing` cases of the exact types
`moderation_content/prohibited_or_restricted_listing` and
`trust_safety/dangerous_item_or_injury` can receive a review. Dangerous-item or
injury cases additionally require the existing safety flag and RED explicit
decision level. The route requires an active Administrator session and current
staff elevation.

The review snapshots the linked listing and a deterministic, bounded inventory
of its bookings. At most 200 bookings may be inspected and at most 49 may be
action-relevant. Current workflow states and historical states remain separate.
The snapshot deliberately excludes owner/renter identity, address and amount.
PostgreSQL computes its SHA-256 and makes the record append-only.

Recording the review changes no listing, booking or user row. It schedules no
notification, provider call or authority report. Both application and schema
force human review, an outstanding decision, proportionality, no automation,
no executed action and no external delivery.

## Exact decision binding

A later support decision for either safety case type is rejected unless it
binds the latest impact review by exact review identifier, case version and
recommendation identifier. Before accepting the decision, the workflow
re-reads the listing and every booking and rejects stale or changed scope.
Every action-relevant booking and the linked listing must be named as affected,
while unaffected areas must be explicit.

Even then, the only admissible recommendations are `temporary_safety_review`,
`moderation_review` and `no_measure`. This is still an immutable decision
record, not execution authority. No downstream action path was added.

## Protected intake, blocked contact and logs

Ordinary support intake retains the bounded 10-per-15-minute class. Genuine
safety intake uses a separate 30-per-15-minute class so ordinary abuse cannot
make the safety channel inaccessible. This does not remove authentication,
payload or case validation.

Blocking another user still denies direct messaging. The authenticated
canonical safety-support route remains available, so the block cannot suppress
a report. No direct contact exception is created.

Operational logging now maps failures to bounded safe error codes or safe
fallbacks. Raw exception messages and objects are not logged in the
notification, Firebase, credential-cleanup, database, mailer, watchdog or
server paths. Permanent wiring tests reject message/error-object regressions.

## Privacy, Retention and audit

The user privacy export explicitly excludes internal impact reviews. Retention
inventory counts them under `securityAudit`, without inventing a purge period
or destructive worker. The restricted case event and minimal audit projection
contain identifiers, versions, hashes and counts but no case narrative,
address, amount or participant identity fields. Existing `audit_log` and the
new review table both reject update and delete; schema rollback refuses to drop
stored reviews.

## Local verification

- 60 focused workflow, decision, support, messaging, observability and
  permanent-wiring tests passed.
- Privacy/Retention validators and their combined 106 tests passed; both
  manifests remain fail-closed drafts.
- The complete backend run passed 515 tests with one expected no-database skip;
  a fresh isolated PostgreSQL 16 integration then applied migrations through
  `052` and passed without a skip.
- Complete CI-equivalent technical regression accepted the 220-issue analyzer
  baseline, passed 369 Flutter tests with one documented skip, the separate
  Google-only profile test, Web build/loopback smoke and Android debug APK.
- Secret scanning found no high-confidence repository secret.

GitHub push and CI verification remain pending because the stored GitHub CLI
HTTPS credential is expired. No replacement OAuth token or SSH trust was
created automatically.

## Remaining gates

Professional legal/safety review, actual proportionality decisions, real
listing/account/booking measures, external messages, authority reports,
staffing, production, Payment, Store, signed candidate, deployment, PR merge
and public activation remain separate closed gates.
