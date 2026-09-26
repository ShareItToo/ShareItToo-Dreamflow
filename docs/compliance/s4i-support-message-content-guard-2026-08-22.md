# S4I support-message content guard - technical compliance record

Status: locally verified on 22.08.2026 at exact implementation commit
`0f4ae3842b37945b31341ac1ae7d6c5265d185eb`. This is technical non-live
evidence for Support Matrix scenarios `SUP-044` and `SUP-045`; it is not legal
advice or approval for live support operation.

## Matrix result

- A synthetic API key in a free support variable is blocked before rendering.
- A synthetic counterparty email in a free support variable is blocked before
  rendering.
- Both attempts return the same bounded sensitive-content error.
- No message, case event, content copy or external delivery is created.
- The rejection is durably audited without the rejected content or its hash.

## Enforced controls

- Secret and personal-data detection classes are explicit and versioned.
- Only template placeholder names and template IDs enter the audit.
- Audit metadata has exactly eight database-validated keys.
- `inputStored`, `messageCreated` and `externalMessageSent` must all be false.
- A raw value, extra metadata key, unsupported actor or missing request ID makes
  the audit insert fail closed.
- The rejection audit is committed outside the rolled-back message transaction.
- Existing append-only audit protection blocks update/delete.
- Retained rejection evidence blocks destructive migration rollback.
- Privacy export does not expose the audit metadata.
- Existing authentication, staff elevation, assignment, non-live and
  rate-limit boundaries remain unchanged.

## Verification observed

- 12 focused support-message tests.
- 60 Privacy/Retention protection and validator tests.
- Fresh PostgreSQL 16 migration and HTTP integration passed twice.
- Backend: 551 pass, one expected no-database skip, zero fail.
- Analyzer baseline accepted at 220 existing issues; 370 Flutter tests passed
  with one documented skip and the separate Google-only test passed.
- Web build/loopback smoke and Android debug APK passed.
- Secret scan found no new high-confidence secret.
- Privacy remained draft; Retention execution remained blocked.
- P0B remained PSP `0/8 HOLD` and pilot prerequisites `0/4 HOLD` / `NO-GO`.

No production support operation, external message, Payment, Store,
Cloud/VPS/DNS, signed candidate, deployment, PR merge or public activation
occurred. GitHub push/CI is not claimed; Draft PR #7 remains unmerged.

## Residual gates and technical debt

The detector is a bounded technical guard, not a claim that every possible
identifier in every language is recognized. Wider identifier coverage,
redaction policy and any external DLP processor require explicit review. No
local workaround became a release prerequisite. Existing toolchain,
rate-limit isolation, Flutter parallelism, temporary PostgreSQL orchestration,
fixture cleanup and timing exit criteria remain open in
`docs/operations/TECHNICAL_DEBT_RELEASE_READINESS.md`.
