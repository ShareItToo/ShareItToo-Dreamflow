# ADR-044: P0B Invited Synthetic Pilot Envelope

Status: accepted as a non-activating preparation package on 2026-08-21; pilot
eligibility remains false because all four prerequisite gates are open.

## Context

P0B recommended one later test cohort: 30 invited private adults in Spiegelberg
using three Cat8 tool subcategories and 30 to 50 synthetic-payment flows. The
ordered token is authorized, but its recorded condition requires the legal,
operations, signed-device and PSP-sandbox gates to be green first.

At present, professional legal approval is absent; real assignments and human
absence tests are absent; iOS signed/physical evidence is absent; and the
contracted-provider sandbox E2E has not run. A recommendation or conditional
authorization cannot make those facts true.

## Decision

- Freeze the exact cohort, region, catalog, product and non-live boundaries as
  a machine-validated envelope.
- Bind each prerequisite to its current source artifact and derive eligibility
  from all four booleans, never from CI or prose.
- Keep `spiegelberg` unconfigured and create no roster, personal data, account,
  invite, listing or participant flow while a prerequisite is false.
- Preserve target KPIs as unobserved targets, never pilot results.
- Keep public registration, live provider traffic, real money, production and
  Store changes false even after a future synthetic-pilot eligibility result.

## Consequences

The future pilot can be evaluated without scope drift, but it is not running:
zero of four prerequisites pass, no participant data exists and zero flows have
executed. The package produces no deployment, migration, account or provider
state.

Rollback is a normal source revert with no external cleanup.
