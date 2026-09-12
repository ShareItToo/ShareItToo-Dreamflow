# S4J non-acute harassment block-report - technical compliance record

Status: locally verified on 22.08.2026 at exact implementation commit
`3aff92398633876605db1b51c29207cad99e1e84`. This is technical non-live
evidence for Support Matrix scenario `SUP-094`; it is not legal advice, an
emergency service, a finding of guilt or approval for a live account measure.

## Matrix result

- Acute danger or uncertainty is diverted to the immediate safety guidance;
  the normal form and server endpoint do not accept it.
- A confirmed non-acute harassment report applies the reporter's direct-contact
  block in the same transaction.
- The report stays open for neutral human review.
- The block is self-protective and creates no account suspension, violation
  decision, external report or provider action.
- Exact retries do not duplicate the report, block or audit receipt.

## Enforced controls

- Authentication, active account and a dedicated request-rate limiter remain
  mandatory.
- Reason, normal priority and false immediate-danger state are server-owned.
- The generic user-report endpoint rejects harassment to prevent bypass.
- Different retry payloads and mismatched active reports fail closed instead
  of silently dropping new details or evidence.
- Migration `060` checks the exact eight-key neutral audit payload, its linked
  reporter/report and the active direct-contact block.
- Existing append-only protection and guarded rollback preserve the receipt.
- Privacy and Retention bindings cover every changed tracked source and remain
  draft/non-destructive.

## Verification observed

- 12 focused Node/Flutter tests.
- 68 combined Privacy/Retention validator tests plus 11 P0B gate tests.
- PostgreSQL 16 integration passed twice consecutively from fresh databases.
- Backend: 553 pass, one expected no-database skip, zero fail.
- Analyzer baseline accepted at 220 existing issues; 372 Flutter tests passed
  with one documented skip and the separate Google-only test passed.
- Web build/loopback smoke and Android debug APK passed.
- Secret scan found no new high-confidence secret.
- P0B remained PSP `0/8 HOLD` and pilot prerequisites `0/4 HOLD` / `NO-GO`.

No production moderation, authority contact, Payment, Store, Cloud/VPS/DNS,
signed candidate, deployment, PR merge or public activation occurred. GitHub
push/CI is not claimed; Draft PR #7 remains unmerged.

The reproduced general-limit collision and the accepted test isolation are
recorded under open `TD-RR-002`. Flutter serial execution and manual PostgreSQL
orchestration remain open under `TD-RR-003` and `TD-RR-004`; none may become a
release prerequisite.
