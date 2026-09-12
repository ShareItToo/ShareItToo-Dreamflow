# G4A Deterministic SIT Planer Core - Technical Evidence

Date: 2026-08-21
Activation: disabled; no route or public UI
External generative AI: disabled and unused

## Reviewed templates

| Template | Questions | Allowed catalog scope | Explicit exclusions |
| --- | ---: | --- | --- |
| Terrace cleaning | 4 | Hand-/Elektrowerkzeuge, Gartengeräte, Bewässerung, generic non-consumable Zubehör | No chemicals or pressure-setting advice; surface, water and electrical suitability unresolved. |
| Renovation | 5 | Bohrmaschinen, Schleifer, Sägen, Handwerkzeuge, Staubsauger, Werkstatt | No structural, mains-electrical, gas, asbestos or professional-work decision. |
| Garden | 5 | Rasenmäher, Heckenscheren, Bewässerung, Gartengeräte, Pflanzkisten, Handwerkzeuge | No tree felling, chainsaw selection, pesticide, chemical or living-thing recommendation. |
| Move | 5 | Rucksäcke/Koffer, Lager, Zubehör and hand tools | No vehicle, driver, delivery, shipping, transport, rigging, hoisting or professional moving service. |
| Event/camping | 5 | Eventtechnik, tables/chairs, pavilion, decoration, tents, sleeping bags, outdoor/camping-kitchen equipment | No food, drink, fuel, generator, staffed catering, venue, emergency, security or transport service. |

Every target is checked against `privatePilotAllowedCatalogKeys` from the
server-owned private-pilot domain. A future allowlist change that invalidates a
template fails module initialization and tests rather than silently widening
scope.

## First-plan contract

- Missing, invalid and unexpected answers fail before a plan is returned.
- The same answer set produces the same ordered items and SHA-256 plan hash.
- Every valid plan contains at least one required, recommended and optional
  item type plus explicit assumptions, compatibility and safety rules.
- The output contains no listing ID, owner ID, availability claim, quote ID or
  hash, price, monetary total, provider call or reservation.
- `serverTruth` records that eligible listing, owner, current availability,
  quote and price remain unresolved until G4B.
- All 468 possible bounded answer combinations across the five current
  templates are exercised for deterministic, priority-complete output.

## Activation and privacy boundaries

- `PLANNER_CORE_ENABLED` defaults false in backend config and both Compose
  profiles. Production enabling throws before startup.
- Backend public release, external generative AI and inventory resolution are
  fixed false. No planner route imports or exposes the core.
- Flutter `SIT_PLANNER_TECHNICAL_UI_ENABLED` defaults false; public release,
  external AI and inventory resolution remain fixed false, and release mode is
  unavailable.
- No questions or answers are persisted, exported, retained or sent to a
  provider in G4A. Existing privacy and retention manifests remain draft and
  their changed config source hash is re-bound exactly.
- No production, cloud, Store, VPS, payment, provider or external-AI state is
  changed.

## Verification, rollback and next package

Focused backend and Flutter tests cover template count, question bounds,
authoritative catalog keys, all answer combinations, conditional selection,
injection-shaped extra answers, prohibited output fields, safety exclusions and
all activation controls. Full backend/Flutter/Web/Android regression and exact
commit-bound CI are required before package close.

Rollback removes the pure planner module, test/config files and default-off
Compose entries, then restores the two manifest source hashes. There is no
migration or external state. When exact CI is green, V2.4 auto-continues to
G4B; the planner remains non-live and disabled.
