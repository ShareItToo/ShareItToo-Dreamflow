# S4C support duplicate-case linking - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`b0b5b77d4d793b82c71f40378eac7d0a9977753c`. This is the non-live technical
implementation of Drive scenario `SUP-015`. It records a reviewed relationship
between two support cases; it does not merge case rows, move evidence, decide a
case, contact a user externally or enable production, Payment, Store, Cloud,
VPS, DNS or a pilot.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenario `SUP-015`.
- Support Master Handbook, Playbooks and Tech/Audit records in the current SIT
  Support Packet.
- Existing canonical support-case status, event, Privacy, Retention, audit,
  administrator-session and Staff-Step-up boundaries.

The Playbook permits a duplicate relationship only when the core facts,
people/objects and decision question are the same, no separate legal deadline
is lost and no Privacy or DSA case disappears. The closed duplicate must retain
the leading-case reference and users must be informed.

## Human-reviewed exact link

Only an active elevated Administrator can create a link. The duplicate must
already be `resolved`; the leading case must still be active. Both cases must
use the same non-live mode, type, subtype, reporter, affected-user set and exact
booking/listing/payment/refund/payout references. The request must explicitly
confirm all five source conditions:

1. same core facts;
2. same participants and objects;
3. same decision question;
4. no loss of a separate deadline;
5. Privacy and DSA separation preserved.

Privacy, DSA/moderation and legal-authority cases, as well as any case carrying
a Privacy, DSA or authority flag, are ineligible. Those lanes remain separate
instead of relying on a heuristic deadline comparison.

The request binds both optimistic case versions and one exact idempotency key.
Both cases are locked in deterministic identifier order. A duplicate can have
only one `duplicate_of` relationship; retries replay the exact stored result
and conflicting reuse fails closed.

## No automatic merge

Creating the link inserts an immutable `support_case_links` record and two case
events. It does not update either case, transfer messages/evidence, create a
decision or send a notification. The duplicate receives a `user_visible` event
containing only the leading human-readable case number and bounded relationship
flags. The leading case receives an internal reverse-reference event.

PostgreSQL independently requires the active Administrator session and
elevation, current versions, exact scope and all five confirmations. Both
application and database force `human_reviewed=true`,
`automatic_merge_executed=false` and `external_delivery_enabled=false`.

Closing a linked duplicate requires the explicit `duplicate_merged` closure
reason and the user-visible leading-case event. Conversely, `duplicate_merged`
cannot close a case without that immutable link and event. Normal support
appeal configuration remains mandatory. The leading case is unchanged.

## Privacy, Retention and audit

The stored assessment contains case numbers, type/subtype, versions and the
five confirmations, but no free-text summary, message, address, amount or
email. PostgreSQL derives its SHA-256. Link rows reject update/delete, and the
down migration refuses to drop retained rows.

The reporter's data export includes the duplicate and leading case numbers,
relation, snapshot hash and creation time. Retention inventory counts
`support_case_links` under communications while the existing period and purge
decisions stay open and execution-disabled. Audit records only the two case
numbers, snapshot hash and non-live flags.

## Local verification

- 35 focused domain, workflow, closure and permanent-wiring tests passed.
- Privacy/Retention validators and their combined 58 protection tests passed;
  the additional three S4C wiring tests passed and both manifests stayed
  fail-closed drafts.
- The backend run passed 521 tests with one expected no-database skip.
- A fresh isolated PostgreSQL 16 integration applied migrations through `053`
  and passed the HTTP, schema, append-only, export, Retention, closure and
  guarded-rollback path.
- The complete CI-equivalent technical regression accepted the 220-issue
  analyzer baseline, passed 369 Flutter tests with one documented skip, the
  separate Google-only test, Web build/loopback smoke and Android debug APK.
- P0B PSP and invited-pilot evidence stayed HOLD/NO-GO after source-hash refresh.

GitHub push and CI are not claimed in this local record. Draft PR #7 was not
merged. No production, Payment, Store, Firebase Console, Cloud/VPS/DNS,
external delivery, real support mutation or public activation occurred.
