# SIT pilot-freeze baseline

Status: **PILOT FREEZE — HOLD / NO-GO**

Baseline date: 2026-08-23

This file records the verified source and CI baseline at the moment SIT entered
pilot-freeze mode. It is a scope-control record, not a pilot activation, legal
approval, Store submission, payment authorization or launch claim.

## Verified baseline

| Field | Verified value |
| --- | --- |
| Repository branch | `codex/master-workflow-20260808` |
| Baseline source HEAD | `e1c69a6ad3086061cfaedf14d2bc63537ad82650` |
| Remote divergence at verification | `0` ahead / `0` behind |
| Working Tree at verification | clean |
| Pull request | GitHub PR #7, open, Draft, unmerged |
| Base branch | `main` |
| Exact regression run | `32627029742`, success |
| Exact CodeQL run | `32627029780`, success |
| External-gate aggregate | 11/11 technically prepared, 0/11 externally ready |
| Activation state | `HOLD` / `NO-GO` |

Both GitHub runs above are bound to the exact baseline source HEAD. The
regression passed PostgreSQL, Backend and Flutter/Web/Android. CodeQL passed
the JavaScript/TypeScript `security-extended` analysis. Signing, Store
publication and production deployment were not performed.

## Frozen product scope

The first recommended pilot candidate remains limited to:

- invited private adults only, with a hard planning ceiling of 30;
- Spiegelberg or another separately approved pilot region;
- Cat8 `Elektrowerkzeuge`, `Bohrmaschinen` and `Schleifer` only;
- 30 to 50 fully documented planned test flows;
- synthetic or test-based payment only;
- V5.2 single-item rental plus Discover, non-reserving cart and Gemerkt;
- the existing safe booking, handover, return and Support paths.

These are planning boundaries, not observed participant counts, completed
flows or authorization to begin a pilot.

G3, G4, G5, SIT Business, multi-provider payments, external AI, public
registration, vehicles, delivery, shipping, express and global expansion stay
disabled or out of scope. G3-G5 cannot enter the first pilot unless the new
G3 legal/document version and required privacy/contract decisions receive
professional review and Walid separately approves the expanded pilot scope.

## Change policy for PR #7

From this baseline onward, PR #7 may receive only:

1. P0/P1 security, legal, privacy or data-integrity fixes;
2. concrete blockers of an approved pilot flow;
3. reproducible build, CI, test or release fixes;
4. preparation and validation of existing external gates;
5. defects found by authentic pilot or physical-device testing;
6. documentation and evidence needed to operate this freeze safely.

No new feature family, larger product/Support/Compliance/Infrastructure
subsystem, speculative hardening package or unmeasured P2-P4 improvement may
be added automatically. P2-P4 findings belong in a prioritized backlog until
authentic pilot evidence justifies them.

## Evidence levels

Every subsequent report must keep these states separate:

- **technically implemented:** present in the repository;
- **technically tested:** supported by a named, source-bound test or CI run;
- **externally evidenced:** supported by authentic, sanitized external facts;
- **professionally approved:** reviewed by the responsible qualified person;
- **pilot approved:** covered by a separate explicit pilot decision;
- **real-money approved:** covered by a separate explicit payment decision;
- **public-launch approved:** covered by a separate explicit activation
  decision.

One level never implies another.

## Unchanged hard boundaries

This baseline does not authorize production, a public pilot, real money, a
live PSP, Store publication, PR merge, DNS/VPS/Cloud/provider changes, a paid
membership, subscription or contract, invented operator/legal/role/cost facts,
signing, physical-device installation or irreversible data mutation.

The canonical external-gate sources remain:

- `docs/evidence/external-gates/technical-setup-manifest.json`;
- `docs/operations/EXTERNAL_GATE_TECHNICAL_SETUP_RUNBOOK.md`;
- `docs/evidence/p0b/pilot-go-no-go-dossier.json`;
- `docs/operations/P0B_PILOT_GO_NO_GO_DOSSIER.md`.

The next authorized work is PF1-PF5 documentation, validation and external-gate
preparation. Activation remains a later `PILOT_STAGE_A_DECISION` gate.
