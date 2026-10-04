# 48H R14 Heilbronn Wave 0 operations

Status: **PREPARED — NOT ACTIVATED — NO TESTER INVITED**

This is the day-of operations package for the later owner-authorized
`heilbronn_wave0`. It refines the verified N9 envelope without changing it:
three invited adults, three required and at most two optional listing tasks per
slot, Android first, closed, non-binding, private and no real money. Use only
the opaque slots `HW0-A`, `HW0-B` and `HW0-C`; real names and roster data stay
outside Git, screenshots, logs and feedback exports.

Nothing in R14 authorizes an invitation, account, installation, provider call,
Play Console action, human-data collection, physical meeting or pilot start.
The existing activation gates in
`docs/operations/BLUE_OCEAN_HEILBRONN_WAVE0_RUNBOOK.md` remain authoritative.

## Coordinator preflight — stop if any item is not green

1. Owner has separately supplied `HEILBRONN_WAVE0_ACTIVATION_GO` for the exact
   candidate and the three-adult private roster/consents exist outside Git.
2. R15 handoff identifies one exact signed Internal Testing candidate; all
   three devices show that same build. A placeholder or a different build is a
   stop, never a best-effort continuation.
3. Operator, Privacy, export/erasure/retention, physical-safety and private
   support gates are recorded green for that exact candidate.
4. External Listing AI has its own provider/budget approval. Otherwise select
   only the clearly labeled manual/mock fallback and never imply that AI ran.
5. Real Payment, KYC, money, public signup, public Store release, Analytics,
   Crashlytics, FCM and Support evidence upload remain off.
6. The coordinator has a private contact route and can stop all three slots.

R14 itself satisfies none of these gates.

## Three-tester task cards

Choose only an item the participant owns or is authorized to photograph. The
examples are variety suggestions, not permission to bypass an app category
block. Never buy, borrow, transport, power on or physically hand over an item
for this test. Skip defective, recalled, prohibited, sharp, pressurized,
flammable or otherwise unsafe items.

| Slot | Task | Required | Suggested object and evaluation focus |
|---|---|---:|---|
| `HW0-A` | `HW0-A1` | yes | Clearly recognizable cordless drill or comparable project tool; type/category cues |
| `HW0-A` | `HW0-A2` | yes | Visibly used but functional small project tool; condition and unsupported-claim correction |
| `HW0-A` | `HW0-A3` | yes | Tool with case/accessories; explicit included/excluded accessory review |
| `HW0-A` | `HW0-A4` | optional | Small household cleaning device; category and price comprehensibility |
| `HW0-A` | `HW0-A5` | optional | Hand-tool set; multi-object boundary and manual fallback |
| `HW0-B` | `HW0-B1` | yes | Clearly recognizable household/project device; first-draft usefulness |
| `HW0-B` | `HW0-B2` | yes | Visibly used but functional camping/event object; condition and duration |
| `HW0-B` | `HW0-B3` | yes | Object with removable accessories; completeness and owner confirmations |
| `HW0-B` | `HW0-B4` | optional | Unpowered garden hand tool; category correction and photo guidance |
| `HW0-B` | `HW0-B5` | optional | Different eligible project tool; price explanation and edit direction |
| `HW0-C` | `HW0-C1` | yes | Clearly recognizable garden/project object; category and brand/model cues |
| `HW0-C` | `HW0-C2` | yes | Visibly used but functional household object; truthful condition wording |
| `HW0-C` | `HW0-C3` | yes | Object with case/accessories; exact scope and missing-accessory handling |
| `HW0-C` | `HW0-C4` | optional | Different eligible power tool, unplugged/battery removed; manual review |
| `HW0-C` | `HW0-C5` | optional | Camping/event object; Planner, search and Mietkorb comprehension |

Minimum execution is `A1–A3`, `B1–B3` and `C1–C3`: nine tasks. Optional tasks
run only after the required tasks are safe and stable, for at most fifteen.
An unavailable safe object becomes `not-run`; it is not replaced with a risky
or out-of-scope object.

## Copies shown before the first task

Pilot/no-binding/no-money notice:

> Pilot-Simulation: Es entsteht keine verbindliche SIT-Miete. Es erfolgen keine
> echten Zahlungen, Erstattungen oder Auszahlungen. Nichts ist öffentlich;
> Anzeigen bleiben im geschlossenen Pilot.

AI disclosure before an authorized analysis:

> SIT analysiert deine ausgewählten Bilder mit einem externen KI-Dienst, um
> einen bearbeitbaren Anzeigenentwurf zu erstellen. Es wird nichts automatisch
> veröffentlicht.

The participant must actively start an authorized analysis and must review all
claims. No AI or fallback output is an owner confirmation, authoritative price
or automatic publication. Use the manual/mock fallback when the provider gate
is closed.

## Exact sequence per task

1. Read the separate safe-photo one-pager and confirm the Stage-A notice.
2. Select one to four safe object photos through the app picker. Do not export
   original photos, EXIF or raw AI output to feedback or Git.
3. Start authorized Listing AI explicitly, or select the labeled manual/mock
   fallback. Record only `provider-used`, `manual-fallback` or `not-started`.
4. Review and, where needed, edit category, brand/model, condition,
   accessories, claims, replacement-value band, suggested price and duration.
5. Answer all required clarifications and owner confirmations. Confirm that an
   edit invalidates readiness until the changed draft is reviewed again.
6. Stop at technical preview unless the exact candidate and human-pilot gates
   are green. Nothing may publish automatically.
7. For the wave as a whole, cover Planner, search, non-reserving Mietkorb,
   request, one acceptance, one rejection and one simulated completion with
   test data only. No real Payment/refund/payout action is allowed.
8. Simulate handover/return only with `Pilot Treffpunkt A`, `Pilot Treffpunkt B`
   or `Pilot Treffpunkt C`. These are labels, not addresses; no physical meeting
   is part of R14.
9. Exercise the G5 follow-up once. A follow-up failure must not remove or alter
   the main listing.
10. Complete the structured task questions and severity result. Store no raw
    participant wording or identity in Git.

## Issue severity and action

| Severity | Meaning | Required action |
|---|---|---|
| `P0` | Immediate safety, credential/personal-data exposure, real-money/provider-billing event, public exposure or destructive loss | Abort the whole wave, turn test flags off, preserve minimized evidence, create a pending gate and contact the owner |
| `P1` | Wrong-role access, unauthorized publication, systemic data corruption, inability to export/erase human data or repeated primary-flow failure | Abort the whole wave; no retry, replacement tester or scope expansion |
| `P2` | One recoverable task is blocked, misleading or inaccessible without confirmed data loss/exposure | Pause that flow, record a bounded issue code and resume only after owner-confirmed cause and safe state |
| `P3` | Minor copy/layout/friction issue with a safe usable path | Finish only the current safe flow and record a bounded issue code; do not silently reclassify upward-risk symptoms |

When uncertain between two severities, use the higher one. Never repeatedly
retry, weaken a check, switch to a public/live path or add participants to work
around a problem.

## Feedback and closeout

Use one temporary copy of
`docs/templates/BLUE_OCEAN_HEILBRONN_WAVE0_FEEDBACK_FORM.md` per flow outside
Git. The coordinator may later commit only reviewed anonymous aggregate counts
using `docs/templates/blue_ocean_heilbronn_wave0_evaluation_sheet.csv`.
Planning targets and unanswered rows are never human-test results.

At closeout, stop new flows, confirm no real money/public/provider surprise,
retain only minimized approved evidence, and follow the exact candidate's
export/erasure/retention instructions. Account or app removal during an
incident must not destroy required safety evidence or override a participant's
data rights.
