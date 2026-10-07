# P0B pilot GO/NO-GO dossier

Date: 21.08.2026

Decision: **NO-GO now**

Next state: **HOLD for Walid's decision**

This dossier closes the V2.4 rolling-autonomy runway. It is a readiness
decision, not a pilot activation. It authorizes no production, public, Cloud,
VPS, Store, signing, payment/provider, real-money or account-permission change.

The machine-readable source of truth is
`docs/evidence/p0b/pilot-go-no-go-dossier.json`. The validator rejects a GO,
real-money scope, public activation, invented legal approval, invented staffing,
invented positive economics, missing repository evidence and automatic
continuation.

## Decision basis

The source and CI evidence is strong enough to define a tightly bounded future
pilot, but not to start one. P0A verified the current source at commit
`540583829361a402066f85c81716ba60d7d475cc` with GitHub Actions run
`32433274526` and synthetic merge
`6bff2509868afd3be4f5ac8ad3829d589e7f186d`. That evidence is technical only.
Ten launch blockers remain open.

The dossier is also bound to the following Drive source versions:

- `02_CODEX_WORK_PACKAGES_SIT_V2.4.md`, file
  `1d3JJLq-X36u9IwfhyhtNm1QYH38urVEq`, modified
  `2026-08-20T19:13:40.661Z`;
- `01_V5.2_CORE_SPECIFICATION.md`, file
  `1HQR2EWJg6FUcU41l5uwditfFzNoCe6Zx`;
- `02_V5.2_RECHTSMAPPE_PRIVATLAUNCH.pdf`, file
  `1kKuZl9OJ4nb9F02E8fepTxY8O-GZBkn2`;
- `01_SIT_MASTER_V2_DEUTSCHLAND_ZU_GLOBAL.pdf`, file
  `1z9GdNlilUrpq1P34lrXdqv6RmJHYSQfJ`;
- the Growth product/project-basket document, file
  `1R_JeRkFXTsFVusKlqeM5wS2-MZAV0fdx`;
- the SIT Business strategy/growth gate, file
  `1UdwK9GB79Zlt1jIKcWoG43J8LQezJDdE`.

## Feature matrix

| Scope | Technical state | Runtime/release state | P0B result |
| --- | --- | --- | --- |
| V5.2 single item | Implemented and regressed | Hold; no activation | Hold |
| G2 navigation, cart and Gemerkt | Implemented, non-reserving | Inherits core gates | Hold |
| G3 same-owner booking groups | Technical implementation | Disabled; production default off | Hold |
| G4 planner and inventory | Technical implementation | Disabled; production default off | Hold |
| G5 supply enrichment | Technical implementation | Disabled; production default off | Hold |
| G5 listing sets | Technical implementation | Disabled; production default off | Hold |
| U0 pilot cockpit | Read-only, Staff-Step-up | No public UI; economics incomplete | Hold |
| FI1 delegation | Schemas and runbooks only | No assignments or passed absence test | Blocked |
| P0A readiness | CI-verified technical matrix | Physical current-source device cell open | Hold |
| SIT Business | Strategy only | Not implemented or authorized | Not authorized |
| Multi-provider projects | Not implemented | Separate later G6 gate required | Not authorized |
| External AI/control tower | Not production-implemented | Disabled | Not authorized |
| Global country launch | Strategy only | Germany PMF gates absent | Not authorized |

Only V5.2 single-item and the non-reserving G2 surfaces are recommended for a
later bounded pilot. G3, G4, G5, Business, multi-provider, external-AI, public
registration and real-money scope remain excluded.

## Hard blockers

1. Professional V5.2 and G3 legal approval is absent. Technical tests cannot
   satisfy this gate. Public content hashes and approved URLs are absent, and
   the Store manifest remains draft with V5.1 interim metadata while V5.2
   machinery exists.
2. Registered-operator, imprint, provider, hosting, SMTP, PSP and related
   contractual facts are incomplete or unapproved.
3. The licensed marketplace-PSP model, owner onboarding/KYC and sandbox E2E for
   authorization, capture, payout, refund and chargeback are not evidenced.
   Real money, rent collection into an SIT account and damage capture are not
   authorized.
4. The recommended municipality is not configured. Both Compose profiles keep
   `PRIVATE_PILOT_ALLOWED_REGIONS` empty by default.
5. Current-source physical Pixel evidence is blocked because the retained app
   has another signature and its installed data was intentionally preserved.
6. No current signed candidate, final-binary binding or complete current
   physical Android/iOS evidence matrix exists.
7. The six functional roles have no evidenced owner or delegate; all four FI1
   processes remain on hold, with no passed absence test or company RBAC proof.
8. Provider fees, VAT component, cloud costs, founder hours and founder
   replacement rate are unavailable. Profitability is therefore
   `undetermined`, never silently positive or zero-cost.
9. Privacy, retention/deletion and Store readiness remain draft or fail-closed.
10. The future pilot's explicit activation decision is absent.

Residual technical risks are one transitive moderate dependency advisory with
no high/critical advisory, plus the bounded analyzer baseline of 222 findings.

## Required legal review scope

Professional review must cover the operator and marketplace role; V5.2 parts
A-I; quote, checkout button, declarations, acceptance and contract formation;
withdrawal, cancellation, no-show and actual-loss rules; PSP/payment, payout,
refund and chargeback structure; handover/return, damage and `needsReview`;
privacy, processors, transfers and Firebase/Maps/SMTP/hosting/PSP facts;
retention, deletion, legal holds and incidents; DSA/moderation/ranking/reviews;
the G3 same-owner multi-item delta; and future Business/B2C and country variants.

## Recommended future pilot, after separate gates

P0B recommends only this candidate for a later explicit decision:

- 30 invited adults acting privately, no public registration;
- 30 to 50 complete test-payment flows, no real money or live provider traffic;
- exact region: **Spiegelberg, Rems-Murr-Kreis**, allowlist code
  `spiegelberg`; this is a recommendation and is not currently configured;
- exact catalog: `cat8/Elektrowerkzeuge`, `cat8/Bohrmaschinen` and
  `cat8/Schleifer`;
- product scope: V5.2 single-item plus G2 navigation, non-reserving cart and
  Gemerkt only.

The Growth planning values EUR 45-55 AOV, at least 95% successful handover,
at most 2% severe disputes and at least 25% 90-day repeat are targets, not
observed results.

## Recommended authorization sequence

These tokens are recommendations only and must never execute automatically:

1. `P0B_NEXT_LEGAL_V52_REVIEW_ONLY`
2. `P0B_NEXT_OPS_ROLES_BACKUP_ABSENCE_ONLY`
3. `P0B_NEXT_SIGNED_DEVICE_EVIDENCE_ONLY`
4. `P0B_NEXT_PSP_SANDBOX_E2E_ONLY`
5. `P0B_NEXT_INVITED_SYNTHETIC_PILOT_SPIEGELBERG_CAT8_30`

Each token is independently bounded. Token five is eligible for a decision
only after gates one through four have evidence and still does not authorize
real money, a public pilot or production activation unless a later instruction
states that scope explicitly.

## Final gate

**NO-GO now.** P0B ends the runway with every production-impacting gate
unchanged and `autoContinue=false`. The repository must stop for Walid's next
decision.
