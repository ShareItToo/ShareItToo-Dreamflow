# WP155 — Processing transparency, purpose/basis and recipient parity

Status: **FULL LOCAL REGRESSION PASSED; EXTERNAL GATES HOLD**.

## Decision

WP155 adds one fail-closed processing-transparency register to the existing
privacy draft. It covers the complete current inventory with exactly fourteen
processing activities and binds each activity to data types, technical sources,
purpose-specific legal-basis candidates, recipient classes, retention decision
references, automated-decisioning truth and unresolved gates.

This is a technical disclosure draft, not professional legal advice or legal
approval. The register deliberately keeps all eight decisions open:

- exact purpose and legal-basis mapping;
- legitimate-interest assessments;
- statutory-obligation mapping;
- Article 9 special-category basis;
- controller and recipient identity;
- processor contracts, regions and transfers;
- retention schedule and legal-hold periods;
- exact released-candidate parity.

The in-app copy names Articles 6(1)(a), (b), (c) and (f) only as the current
technical interpretation. Consent controls are explicit and revocable where
used. Payment remains provider-disabled and memory-only; social providers,
maps, push and crash paths retain their exact candidate or external-fact holds.
No external AI recipient is introduced.

Official sources used for the technical draft:

- GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- European Commission principles: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en
- European Commission obligations: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/obligations_en
- EDPB transparency guidance: https://www.edpb.europa.eu/system/files/2023-09/wp260rev01_en.pdf

## Fail-closed rules

The validator rejects an incomplete activity inventory, a consent purpose
without an explicit revocable control, an unbalanced legitimate-interest
purpose, an unbound statutory purpose, an Article 9 activity without its own
professional-review gate, a service recipient absent from the register, and
any approval-shaped state while a required decision remains open. It also
requires the in-app legal-basis/recipient copy, the privacy-draft markers and
the permanent regression registration.

No processing approval, provider activation, payment, money movement,
production, Store/Firebase/Cloud/VPS/DNS change, device action, credential read,
PR merge or public activation is part of WP155.

## Focused verification

The focused closure remains **FOCUSED CLOSURE PASSED**; the complete local
regression is now closed below.

- privacy disclosure tool tests: **28/28 passed**;
- privacy manifest validator: **valid, 18 data types, 11 services, 14 activities**;
- legal-readiness validator: **valid draft, approval closed**;
- retention/deletion validator: **valid draft, execution blocked**;
- legal privacy and legal terms Flutter tests: **2/2 passed**;
- analyzer for changed privacy files: **0 findings**;
- `git diff --check`: **passed**.
- complete CI-equivalent technical regression: **exit 0**; Web/Wasm,
  loopback smoke, Android debug/minSdk 24 and the release-host capacity gate
  all passed.

The local closure gate is complete. GitHub Regression and CodeQL remain
pending until the closure commit is pushed at its exact head.

## Remaining gates and risks

The public privacy text, controller/processor roles, AVVs, regions/transfers,
retention/legal-hold periods, Article 9 basis, DSA/moderation classification and
exact released-candidate parity require their named external or professional
decisions. The register must remain draft and fail-closed until those facts are
actually evidenced. No historical WP149–WP153 claim is rewritten; only their
deterministic source-hash bindings may be refreshed when current source files
change.
