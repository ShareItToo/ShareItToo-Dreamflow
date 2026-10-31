# S4K booking exact-address reveal - technical compliance record

Status: locally verified on 22.08.2026 at exact implementation commit
`59d8f1eee2d72111d1bc97034bf2114123897622`. This is non-live technical
evidence for Support Matrix scenarios `SUP-046` through `SUP-048`; it is not
legal advice, professional approval or authorization for launch.

## Matrix result

| Scenario | Enforced result |
| --- | --- |
| `SUP-046` exact address more than six hours before the confirmed appointment | Hidden; only approximate location remains. |
| `SUP-047` appointment confirmed later than six hours before it | Revealed immediately after effective counterparty confirmation, if no safety hold exists. |
| `SUP-048` unauthorized address access | Same non-enumerating `404` as a missing booking; denied attempt is audited without address or booking-party metadata. |

Pickup and return are separate policy segments. Counterparty identity,
confirmation instant, rental-date/timezone match, workflow state, exact-address
presence and safety state are server checked. Backend failure and ambiguous
state fail closed.

## Enforced privacy and audit controls

- The response is authenticated, participant-only and `private, no-store`.
- Safety flags and active account holds prevent automatic disclosure.
- Exact address, coordinates, owner ID and renter ID are forbidden from S4K
  audit metadata.
- Participant audit has exactly nine keys; denial audit has exactly five.
- PostgreSQL independently rejects forged reveal evidence and preserves valid
  evidence through append-only and rollback guards.
- Privacy and Retention manifests cover all new and changed tracked sources;
  both remain draft and non-destructive.
- Structured chat location sharing uses the same reveal authority. Arbitrary
  user-authored free text is not presented as a system-controlled disclosure
  channel and is not subjected to an unreliable address heuristic.

## Verification observed

- Focused: 13 Node and seven Flutter tests.
- Privacy/Retention: 58 tests; P0B protection: 37 tests.
- PostgreSQL 16: successful fresh-database integration including migration
  `061`, safety hold, early/late gates, denial, audit forgery and rollback.
- Backend: 561 pass, one expected no-database skip.
- Full gate: analyzer baseline 220 accepted; 373 Flutter tests passed with one
  documented skip; Google-only, Web loopback smoke and Android debug build
  passed.
- No high-confidence secret pattern was found in the diff.

P0B remains PSP `0/8 HOLD` and pilot `0/4 HOLD` / `NO-GO`. No production,
Payment, Store, Cloud/VPS/DNS, signed candidate, deployment, PR merge, support
disclosure or public activation occurred. GitHub push/CI is not claimed.

No local timing, limiter or request-source workaround became an acceptance
criterion. Existing temporary Node resolution, Flutter serial execution and
manual PostgreSQL lifecycle remain open release debt and must be replaced by
the deterministic exit evidence in `TECHNICAL_DEBT_RELEASE_READINESS.md`.
