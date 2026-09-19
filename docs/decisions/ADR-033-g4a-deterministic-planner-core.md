# ADR-033: G4A Deterministic Planner Core

Status: accepted for inactive technical implementation on 2026-08-21.

## Context

The Growth runway calls for a short project questionnaire that produces useful
item-type guidance before G4B resolves real inventory. The current private
pilot has a strict server allowlist and excludes vehicles, delivery, shipping,
drones and several safety-sensitive domains. No production external
generative AI is authorized, and G4A must not invent a listing, availability,
quote, price or reservation.

## Decision

- Use a pure deterministic rules engine at version `G4A-2026-08-21.1` with no
  network, database, model or provider dependency.
- Start with exactly five reviewed templates: terrace cleaning, renovation,
  garden, move, and event/camping.
- Require every template to ask three to six bounded single-choice questions;
  the current templates ask four or five. Unknown, missing or extra answers
  fail closed.
- Emit only required, recommended and optional item types. Every catalog target
  is validated at module load against the authoritative current private-pilot
  category/subcategory keys.
- Include explicit deterministic assumptions, compatibility rules and safety
  boundaries in every first plan. Conditional items and assumptions depend
  only on the validated answer set.
- Mark listing, owner, current availability, current quote and current price as
  unresolved server facts for G4B. G4A performs no inventory query and creates
  no reservation.
- Keep the backend and Flutter flags default-off. Production backend enabling
  is rejected, release mode cannot expose Flutter access, and external
  generative AI plus inventory resolution have no enabling switch in G4A.
- Add no route, UI entry, persistence, migration or telemetry in this package.

## Consequences

The first plan is repeatable and hash-stable for the same template and answers,
and every emitted category is already within the current legal/safety
allowlist. It is deliberately incomplete until G4B resolves real eligible
inventory and current server truth. The planner cannot present category
matching as proof of suitability; users must verify the exact item, interfaces,
instructions, conditions and competence.

Rollback is a code/config revert. No user or external state exists to migrate.
