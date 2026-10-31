# ADR-039: P0B NO-GO and bounded future pilot scope

Status: accepted for the non-activating P0B decision package on 21.08.2026.

## Context

P0A established strong current-source technical evidence but deliberately
closed as HOLD. Professional legal approval, operator/provider facts, sandbox
payment evidence, current signed-device evidence, operating assignments,
absence tests and normalized unit economics remain incomplete or unavailable.
The V2.4 source package requires P0B to make one honest readiness decision and
then end the autonomous runway.

## Decision

Decide **NO-GO now**. Do not activate a pilot and do not change production,
public registration, payment/provider, real-money, Store, signing, Cloud/VPS,
account permissions or currently disabled G3-G5 features.

If separate later gates become green, recommend a 30-person invited private
test cohort completing 30-50 synthetic-payment flows in exactly Spiegelberg,
Rems-Murr-Kreis, limited to `cat8/Elektrowerkzeuge`,
`cat8/Bohrmaschinen` and `cat8/Schleifer`. Only V5.2 single-item and
non-reserving G2 product surfaces are in that candidate scope. The region and
pilot remain unconfigured and inactive.

Record five ordered authorization tokens, each non-executing and independently
bounded. End the runway with `autoContinue=false` and stop for Walid.

## Rationale

A broader region, catalog or feature set would mix density, legal, operations
and product risk before the base C2C flow is proven. Spiegelberg is one exact
municipality inside the Growth Master's Rems-Murr starting corridor, and the
three cat8 subcategories are already covered by the authoritative private
allowlist. The compact scope can test repeatable handover/return and dispute
operations without introducing G3 grouping, multi-provider contracts, Business
classification, external AI or real money.

A GO would be unsupported: technical CI cannot approve legal language; disabled
configured cost classes cannot prove positive economics; FI1 schemas cannot
stand in for assigned people and absence tests; and a debug build cannot stand
in for a current signed device candidate.

## Rejected alternatives

1. Start the pilot from technical CI alone. This collapses independent legal,
   payment, device, operations and activation gates.
2. Enable G3-G5 in the first cohort. Their technical implementation remains
   default-off and lacks public/legal authorization.
3. Use real money before a licensed marketplace PSP sandbox path and contract
   are evidenced. This exceeds both authorization and readiness.
4. Expand to the whole initial corridor or all categories. That prevents a
   controlled density and operational proof.
5. Continue automatically to the first recommended token. P0B is the explicit
   end of the V2.4 runway.

## Consequences

- No pilot begins and no live state changes.
- Ten blockers remain visible rather than being converted into assumptions.
- Walid receives one exact later candidate and an ordered evidence path.
- SIT Business and global work remain downstream of successful German C2C,
  positive economics, operational independence and their own legal gates.

## Rollback

Revert the P0B dossier, validator, tests and documents. There is no runtime,
database, provider, device, account or infrastructure rollback.
