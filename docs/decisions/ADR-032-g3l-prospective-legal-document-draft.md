# ADR-032: Prospective G3L Legal/Document Draft

Status: accepted for inactive technical preparation on 2026-08-20; professional
legal approval and public/live activation remain open.

## Context

G3A Variant A and G3B-G3E now describe and technically exercise a same-owner
multi-item group. V5.2 is singular and binds each booking, quote, contract,
receipt and evidence set independently. Reusing its version for a group would
misrepresent the reviewed source and weaken immutable acceptance evidence.

G3L-DRAFT is authorized to prepare a delta matrix and technical document
machinery, but not to decide law, publish text, provision contracts, enable
real money or claim professional approval.

## Decision

- Preserve the V5.2 manifest and all nine A-I assets byte-for-byte as the
  historical parent set.
- Introduce `G3L-DRAFT-2026-08-20.1` only as an immutable internal technical
  identifier with status `draft-blocked`.
- Bind the technical booking-group compatibility envelope to that exact
  identifier. Any other, missing or approval-shaped identifier fails closed.
- Version and hash-bind four preparation artifacts: affected-scope change
  matrix, snapshot/document specification, professional-review checklist and
  hard release gate.
- Treat group totals as an exact view over position allocations. Contracts,
  acceptance, refunds, receipts and evidence must later retain group
  correlation and position precision.
- Keep privacy export coverage and retention inventory explicit. G3L creates no
  retention period, deletion rule, payment/provider decision or legal result.
- Require professional decisions for group contract structure, counter-offer
  semantics, partial performance, payment/refunds, receipts, evidence,
  privacy/export/retention and Business/global variants.
- Keep backend and Flutter disabled by default, reject backend production
  enabling, and hide the technical path in release builds.

## Consequences

Future implementation can distinguish historical V5.2 single-item evidence
from a prospective group document set without retroactive rewriting. A green
G3L CI result proves integrity and fail-closed controls only; it does not make
the draft legally effective. V2.4 may continue to disabled G4A, but every
public/live G3 activation remains a hard stop pending a new explicit gate.

Rollback is a normal code/artifact revert. No migration or external state is
created by this decision.
