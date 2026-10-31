# G3L-DRAFT Multi-Item Legal/Document Preparation - Technical Evidence

Date: 2026-08-20
Decision: G3A Variant A
Activation: blocked; no professional approval claimed

## Source and historical integrity

- The package is bound to the G3A architecture decision, G3E evidence, V5.2
  Core Specification, V5.2 Rechtsmappe and the Growth project-cart source.
- `assets/legal/de/legal_manifest_g3l_draft.json` records the exact source IDs,
  parent-manifest hash and all nine V5.2 A-I hashes.
- The validator rereads every parent file and rejects any byte drift. No V5.2
  asset, snapshot, contract, declaration, receipt, booking or evidence row is
  migrated or relabelled.

## Draft package

- Version `G3L-DRAFT-2026-08-20.1` is a technical identifier only. Manifest,
  backend module and workflow use the same exact value.
- The change matrix covers platform/private-rental terms, cancellation/refund,
  payment/payout, handover/return/damage, `needsReview`/audit, privacy, account
  export, retention/deletion, receipts and evidence.
- The binding specification enumerates group, quote, ordered position,
  allocation, declaration, receipt and audit evidence required from a later
  professionally approved set.
- Fourteen decisions remain expressly open in the manifest. The professional
  checklist contains no checked item and does not infer law or retention time.
- The release document and machine gate require professional text approval,
  final hashes, declaration/partial-performance rules, privacy/retention,
  provider/real-money evidence, closed-pilot evidence and a new explicit
  activation decision.

## Technical fail-closed behavior

- `backend/src/booking_group_legal_document.js` is immutable and exposes no
  approval or activation switch. Its assertion rejects any other version.
- `backend/src/booking_group_workflow.js` loads the assertion before using the
  draft identifier for new technical groups. Existing stored versions remain
  append-only history.
- Backend `BOOKING_GROUPS_ENABLED` still defaults false and production enabling
  is rejected. Flutter technical/public sentinels default false and release
  mode never exposes the path.
- No route provisions a G3 contract, declaration, receipt, payment, refund or
  public legal document. Real money, Store, cloud and production are unchanged.

## Verification

- Focused validator tests cover approval claims, V5.2 mutation, draft drift,
  review-checklist closure, affected-scope removal, gate weakening, workflow
  bypass and Flutter/backend guard removal.
- Backend module tests cover immutability and rejection of missing, historical
  or approval-shaped document versions.
- The complete local backend suite passes with one expected PostgreSQL skip
  when `TEST_DATABASE_URL` is absent. Exact PostgreSQL integration and full
  Flutter/Web/Android regression remain the package-close CI gate.

## Risks, rollback and next package

The primary residual risk is legal, not hidden: no group contract wording,
partial-performance consequence, provider/payment path, receipt design or
retention schedule is professionally approved. A CI pass cannot close those
decisions.

Rollback reverts the G3L files and restores the prior internal technical draft
identifier for future disabled test data. It changes no historical V5.2 bytes
or external state and requires no migration rollback. When exact package CI is
green, V2.4 auto-continues to disabled deterministic G4A; public/live G3
activation remains a hard stop.
