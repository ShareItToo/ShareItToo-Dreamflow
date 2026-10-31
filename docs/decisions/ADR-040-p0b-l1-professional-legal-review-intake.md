# ADR-040: P0B-L1 Professional Legal Review Intake

Status: accepted as a fail-closed intake package on 2026-08-21; professional
approval remains external and open.

## Context

P0B correctly ended the prior runway with NO-GO and recommended a bounded
V5.2/G3 professional legal review as the first next token. Walid then
explicitly authorized that token and the ordered continuation. The repository
contains a complete technical G3 draft but neither professional approval,
verified operator identity nor a concrete Marketplace-PSP contract.

Current official sources also contain post-source changes, including 2026
changes to DDG/ZAG and the 2025 discontinuation of the EU ODR platform. Reusing
older generic text or treating CI as approval would be unsafe.

## Decision

- Create immutable intake version `P0B-L1-LEGAL-REVIEW-2026-08-21.1` without
  changing V5.2 or G3L-DRAFT history.
- Bind exact repository hashes and live Drive IDs/modified times.
- Provide an official-source register dated 2026-08-21 as a research baseline,
  not legal advice.
- Expand the fourteen G3-only issues into eighteen combined V5.2/G3 decisions,
  including operator identity, checkout/durable confirmation, withdrawal and
  marketplace transparency.
- Define strict external reviewer identity, source, decision, final-hash and
  authentication evidence requirements.
- Reject all inferred, informal or incomplete approval and keep public,
  production, Store and real-money gates false.
- Continue only independent non-live backlog while external legal review is
  unavailable.

## Consequences

SIT now has a counsel-ready, auditable packet and a deterministic import
contract, but no legal issue has been substantively approved. The legal gate
remains a hard stop. Operations preparation may proceed independently; it
cannot activate the product or cure legal/payment gates.

Rollback removes only the P0B-L1 intake files, validator, tests and references.
There is no migration or external-state rollback.
