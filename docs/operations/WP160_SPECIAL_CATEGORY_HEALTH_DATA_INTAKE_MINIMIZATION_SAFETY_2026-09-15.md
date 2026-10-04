# WP160 — Special-category / health-data intake minimization safety

RESULT: Technical closure; legal gate remains open.

EVIDENCE: At baseline `c092cfe84965251f36a8f70525a49082f0959d63`, product
safety intake now separates an accident from an explicitly confirmed injury.
The combined UI wording no longer infers a health fact. Possible
special-category wording is detected technically, requires a versioned
necessity/warning/owner binding, remains case-bound, and cannot be copied into
unrestricted support messages, moderation text, decisions or appeals.
Evidence uploads require an explicit classification and inherit the case
binding before storage. Staff projection, audit metadata and privacy export
carry only the bounded classification and detection version; raw content is
not copied into those projections. The 079 migration accepts only the exact
technical handling shape and refuses rollback when such handling is present.
Existing account-erasure and retention rules remain unchanged and legally open.

Focused deterministic proof:

- special-category guard, support-case, evidence, moderation and message tests:
  **56/56 passed**;
- WP160 wiring and coordination-ratchet tests: **1/1 passed**;
- privacy disclosures validator: valid draft, approval disabled;
- retention/deletion readiness validator: valid draft, execution blocked;
- `git diff --check`: passed.

The coordination ratchet is recorded in `docs/current_work_package.md`: an
empty `items` or `latestAssistantMessageId` from a completed cross-task read is
not proof of a silent worker turn; before a mentor `FIX`, one exact
task-completion event or local rollout record must be verified. The existing
no-silent-turn rule remains active.

BLOCKER: `ASTRA_GATE_REQUIRED:SPECIAL_CATEGORY_ARTICLE9_BASIS`. The repository
does not select an Article 9 basis, legal purpose, controller role, provider
role or retention period. Owner/professional review is still required before
any special-category processing is enabled for production.

No provider, payment, Store, production or device state changed. No credentials
or raw sensitive content were read or recorded. Rollback is the normal
migration rollback only while no case carries `specialCategoryHandling`; the
down migration intentionally refuses to drop the constraint after such data
exists.
