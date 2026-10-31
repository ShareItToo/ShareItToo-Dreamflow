# SIT pilot and launch tiers

Status: **PILOT FREEZE — all tiers HOLD / NO-GO**

Machine source:
`docs/evidence/external-gates/pilot-launch-tier-matrix.json`

This matrix separates the smallest closed Android pilot from an Echtgeldpilot
and a public regional launch. It is a decision aid and validation contract. It
does not activate a tier or turn planning values into observed results.

## Evidence vocabulary

The following states are cumulative but never interchangeable:

1. **Technically implemented** — present in the repository.
2. **Technically tested** — supported by named, source-bound tests or CI.
3. **Externally evidenced** — supported by authentic sanitized external facts.
4. **Professionally approved** — reviewed by the responsible qualified person.
5. **Pilot approved** — covered by a separate explicit Stage A decision.
6. **Real-money approved** — covered by a separate explicit Stage B decision.
7. **Public-launch approved** — covered by a separate explicit Stage C
   decision.

SIT currently has broad technical preparation, but the aggregate external-gate
state remains 0/11 externally ready. No tier is approved.

## Three-stage matrix

| Dimension | Stage A — closed Android, no real money | Stage B — closed Echtgeldpilot | Stage C — public regional launch |
| --- | --- | --- | --- |
| Inheritance | Smallest independent candidate | All Stage A gates plus payment gates | All Stage A and B gates plus public-launch gates |
| Participants | Maximum 30 invited private adults | Still closed and separately approved | Public only after a separate activation decision |
| Region | Spiegelberg recommended; not configured | Approved closed-pilot region | Separately approved regional launch area |
| Planned volume | 30–50 fully documented flows | Authentic volume decided only after Stage B approval | Authentic capacity and economics required |
| Catalog | Cat8 Elektrowerkzeuge, Bohrmaschinen, Schleifer | Same unless separately reviewed | Only approved public catalog |
| Product | V5.2 single-item; Discover; non-reserving cart; Gemerkt; existing booking/handover/return/Support | Stage A plus reviewed Echtgeld paths | Stage B plus public Operations/Store scope |
| Payment | Synthetic or test-based only | Marketplace PSP, still disabled until explicit approval | Only the separately approved Stage B payment model |
| Distribution | Android, private/invited; no public Store launch | Closed distribution | Store approvals and separate public activation required |
| Public registration | Off | Off | Remains off until Stage C decision |
| External AI / Business / global | Off or excluded | Off unless separately gated | Separate later decisions remain required |
| Current state | `HOLD` | `HOLD` | `HOLD` |

The 30 participants and 30–50 flows are ceilings/planning values. The observed
count remains unknown until a separately activated pilot actually runs.

## Stage A — closed Android pilot without real money

The smallest recommended candidate contains only:

- private invitations, never public registration;
- no more than 30 adult participants;
- Spiegelberg as the recommended, currently unconfigured region;
- Cat8 Elektrowerkzeuge, Bohrmaschinen and Schleifer;
- V5.2 single-item rental, Discover, non-reserving cart, Gemerkt and the
  existing safe booking, handover, return and Support paths;
- synthetic or test-based payment, never Echtgeld or a live PSP;
- no public Store launch, multi-lender payment, vehicles, delivery, shipping
  or express.

Stage A still needs authentic professional V5.2 pilot review, the operator and
active-provider facts needed for the pilot, minimum Operations roles and
delegation, evidence for an exact signed Android candidate on a physical
device, the required Firebase owner controls, Stage-A Privacy/Retention/Legal
Hold decisions, the exact pilot envelope and a separate activation decision.
PF2 classifies which of the eleven aggregate external gates blocks this tier
and which can safely wait.

G3-G5 remain outside Stage A by default. They may enter only after professional
review of the new G3 legal/document version, the required Privacy and contract
decisions, and Walid's separate explicit expanded-pilot approval. SIT Business,
global expansion, production external AI and multi-lender payment remain out.

Exact decision gate: `PILOT_STAGE_A_DECISION`.

## Stage B — closed Echtgeldpilot

Stage B inherits every Stage A requirement. It additionally requires:

- a selected and contractually reviewed licensed Marketplace PSP;
- authentic KYC and onboarding facts;
- DPA, region, transfers and contract review;
- eight authentic sandbox E2E scenarios;
- refund, chargeback, payout and ledger evidence;
- confirmed tax and accounting logic;
- Walid's separate explicit Echtgeld approval.

The existing eight sandbox scenarios have zero authentic passes. Sandbox
success would still not authorize real money. Current real-money and live-PSP
flags remain false.

Exact decision gate: `PILOT_STAGE_B_REAL_MONEY_DECISION`.

## Stage C — public regional launch

Stage C inherits every Stage A and B requirement. It additionally requires:

- Store approvals;
- complete operator and consumer information;
- authentic Operations and Support staffing;
- assigned roles/delegates and passed absence tests;
- complete provider, Privacy and retention approvals;
- authentic Unit Economics;
- monitoring and incident runbooks;
- a separate public activation decision.

Public registration, public Store launch and public regional activation remain
false.

Exact decision gate: `PILOT_STAGE_C_PUBLIC_LAUNCH_DECISION`.

## Current truthful conclusion

Technically implemented and tested components exist, but no tier is externally
evidenced, professionally approved or activated as a whole. The current state
is `HOLD / NO-GO`. PF2 turns the existing eleven external gates into a tiered
execution board; it does not change this decision.
