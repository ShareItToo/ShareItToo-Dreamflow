# S4H account-measure approval - technical compliance record

Status: locally verified on 22.08.2026 at exact implementation commit
`a8fcbf8f395e6ee3a5ede67c704c2120596af3c1`. This is technical non-live
evidence for Support Matrix scenarios `SUP-095` and `SUP-096`; it is not legal
advice or authority for a live restriction.

## Matrix result

- An immediate account-wide restriction is finite and explicitly provisional.
- Its user notice says that it is not a finding of guilt or a violation.
- A permanent or unbounded restriction cannot take effect through the direct
  suspension route.
- One immutable exact-payload proposal requires an independent Administrator.
- Rejection has no account effect; approval applies the reviewed effect once.
- Account state, sessions, refresh tokens, decision and audit truth change in
  one transaction.

## Enforced controls

- Direct account measures require `provisional=true` and a finite end time.
- Existing account restrictions and inactive target accounts fail closed.
- The canonical no-guilt copy is supplied by the server and database-bound.
- Proposal payload, hash, version and identity cannot drift after creation.
- One account can have at most one pending permanent-measure proposal.
- Proposer and reviewer must be distinct verified administrators.
- Review rechecks the exact account and proposal state under row locks.
- Direct SQL cannot create a new legacy unapproved permanent restriction.
- Approval is atomic with moderation decision, suspension, account state,
  session and refresh-token revocation and append-only audit evidence.
- Privacy export omits internal notes and staff identifiers.
- Retained decision or proposal evidence prevents destructive rollback.

## Verification observed

- 19 focused domain, Privacy and Retention tests.
- 62 validator and protection tests.
- Fresh PostgreSQL 16 migration/integration: one pass, zero fail.
- Backend: 550 pass, one expected no-database skip, zero fail.
- Analyzer baseline accepted at 220 existing issues; 370 Flutter tests passed
  with one documented skip and the separate Google-only test passed.
- Web build/loopback smoke and Android debug APK passed.
- Secret scan found no new high-confidence secret.
- Privacy remained draft; Retention execution remained blocked.
- P0B remained PSP `0/8 HOLD` and pilot prerequisites `0/4 HOLD` / `NO-GO`.

No production moderation, live account action, external support message,
Payment, Store, Cloud/VPS/DNS, signed candidate, deployment, PR merge or public
activation occurred. GitHub push/CI is not claimed; Draft PR #7 remains
unmerged.

## Residual gates and technical debt

Legal policy approval, staffed independent review, identity proof, appeal
operations, retention approval and all release gates stay separate. The
suite-wide rate-limit isolation exposed during S4H remains open as `TD-RR-002`;
the workflow-level PostgreSQL tests are evidence for S4H, not a permanent
substitute for isolated HTTP threshold tests. Local toolchain, Flutter test
parallelism, temporary-database orchestration, fixture cleanup and timing exit
criteria remain open in
`docs/operations/TECHNICAL_DEBT_RELEASE_READINESS.md`.
