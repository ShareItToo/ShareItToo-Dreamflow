# Blue Ocean Heilbronn Wave 0 runbook

Version: `N9-HEILBRONN-WAVE0-2026-08-24.1`

Status: **PREPARED — NOT ACTIVATED — OWNER AND EXTERNAL GATES OPEN**

This runbook prepares `heilbronn_wave0` for a later owner-authorized closed,
invited, non-binding Android product-and-process pilot. It does not authorize
an invitation, account, tester enrollment, image/provider call, installation,
Play Console action, data collection or participant flow.

## Fixed envelope

- Three invited adults: one founder/owner slot and two adult-friend slots.
- No names, email addresses, phone numbers, account identifiers or roster are
  stored in Git. The future roster stays in an approved owner-controlled place.
- Three to five object listings per person; nine required tasks and up to six
  optional tasks, for nine to fifteen listings total.
- Prefer private power tools, drills, sanders and household/project equipment.
- Android first; Google Play Internal Testing is the preferred later channel.
- V5.2 + G2 + G3 + G4 + G5 + Blue Ocean listing assistant, all within the
  closed test configuration and default-off for public/release use.
- No real money, PSP traffic, KYC, payment, refund, payout, public signup,
  public Store release or binding SIT rental.
- Firebase Analytics, marketing analytics, Crashlytics collection and FCM stay
  off initially. Support evidence upload stays off.
- The earlier Spiegelberg scope remains unchanged and inactive.

## Activation gates

All of these remain open until separately evidenced and authorized:

1. owner token `HEILBRONN_WAVE0_ACTIVATION_GO`;
2. exact signed Android candidate and internal-test release approved by the
   owner through the separate N10/Store gate;
3. external operator values `SIT_OPERATOR_LEGAL_NAME`,
   `SIT_OPERATOR_POSTAL_ADDRESS` and `SIT_OPERATOR_CONTACT_EMAIL`, verified by
   `node tool/check_stage_a_operator_config.mjs` without printing their values;
4. three-adult roster and consent captured outside Git, chat and logs;
5. privacy/export/erasure/retention readiness revalidated for the exact
   candidate and all human-data paths;
6. external AI/provider/budget gate separately approved, or the pilot is
   explicitly limited to the safe manual/mock fallback without pretending that
   external analysis ran;
7. physical safety, pause/abort and owner-support readiness acknowledged.

Missing operator values do not block technical preparation. Even complete
operator facts never activate the pilot by themselves.

## Participant slots and object tasks

Use only opaque slots `HW0-A`, `HW0-B` and `HW0-C` in sanitized operational
evidence. Each slot receives three required tasks:

1. one clear tool or project-equipment object with readable type/brand cues;
2. one visibly used but functional object with owner-confirmed condition; and
3. one object with accessories that must be explicitly included or excluded.

Optional fourth and fifth tasks per slot should cover, in this order where
available: drill, sander, other power tool, cleaning machine, garden machine,
ladder/hand tool, event/camping object, then accessory. Do not buy, borrow or
transport an object solely to satisfy coverage. Defective and prohibited items
remain outside scope.

## Safe-photo instructions and consent

Before selecting one to four photos, the tester must:

- use only an object they own or are authorized to list;
- remove or crop faces, children, unrelated people, documents, labels showing
  an address, bank/card data, credentials, private messages and sensitive
  background material;
- disable location tagging where practical and verify the frame before use;
- avoid identity documents, health documents, official documents, passwords,
  PINs, OTPs, TANs and recovery codes entirely;
- accept the exact disclosure before explicitly starting analysis:

> SIT analysiert deine ausgewählten Bilder mit einem externen KI-Dienst, um
> einen bearbeitbaren Anzeigenentwurf zu erstellen. Es wird nichts automatisch
> veröffentlicht.

If the approved external provider gate is not open, the UI must use the safe
manual/mock fallback and must not imply that an external service was called.
No original photo, EXIF, face or raw model output enters the evaluation sheet.

## Required in-app Stage-A notice

The default-off Blue Ocean surface displays:

> Pilot-Simulation: Es entsteht keine verbindliche SIT-Miete. Es erfolgen keine
> echten Zahlungen, Erstattungen oder Auszahlungen. Nichts ist öffentlich;
> Anzeigen bleiben im geschlossenen Pilot.

This notice supplements, and never weakens, the explicit AI disclosure and the
exact `Anzeige veröffentlichen` owner action.

## Synthetic handover locations

Use only these labels in the test plan and sanitized evidence:

- `Pilot Treffpunkt A`
- `Pilot Treffpunkt B`
- `Pilot Treffpunkt C`

They are scenario labels, not addresses. A real meeting arrangement, if later
authorized, stays outside Git and the aggregate evaluation export.

## Planned flow per listing

1. Show the Stage-A notice and confirm the participant understands that the
   run is non-binding, private and no-money.
2. Select one to four safe photos and either explicitly start the authorized AI
   action or exercise the documented fallback.
3. Review object/category, brand/model, condition, accessories, claims,
   replacement-value band, price, duration rules, V5.2 simulated total and all
   eleven confirmations.
4. Record draft time, publish-ready time, edits, clarifications and fallback as
   bounded enums/counts in the evaluation sheet.
5. Exercise preview and explicit closed-pilot publication only if the exact
   human-pilot activation and candidate gates are green; otherwise stop at the
   technical preview.
6. Cover project/search/cart/request/accept/reject and one simulated completion
   across the wave, never with real money.
7. Exercise G5 follow-up; its failure must not remove the main listing.
8. Use only a Treffpunkt label for handover/return simulation and record
   support need without raw messages.
9. Complete the structured feedback form. Store only approved aggregate output
   in the repository handover.

## Pause and abort procedure

Pause the affected flow immediately for a recoverable P2 usability,
accessibility, timeout or comprehension issue. Preserve only sanitized state,
open no retry loop and resume only after the owner confirms the cause and safe
state.

Abort the whole wave for any P0/P1 event: real-money/live-provider signal,
public exposure, personal/sensitive-data leak, wrong-role access, unauthorized
publication, data loss/corruption, unsafe physical event, inability to erase
human data, systemic primary-flow failure or loss of exact candidate evidence.
Turn all test flags off, stop new data collection, preserve minimized evidence,
record one pending gate and do not replace participants or expand scope.

## Feedback and evaluation artifacts

- Structured feedback form:
  `docs/templates/BLUE_OCEAN_HEILBRONN_WAVE0_FEEDBACK_FORM.md`
- Aggregate-safe evaluation sheet:
  `docs/templates/blue_ocean_heilbronn_wave0_evaluation_sheet.csv`

Both are blank templates. They are not pilot results. Free text is kept outside
the repository unless reviewed, minimized and anonymized. Planning targets are
never reported as observed human outcomes.

## Completion boundary

Completing this preparation does not authorize activation. A later pilot does
not authorize public registration, production, real money, Store publication,
provider billing, Firebase telemetry, expansion beyond three invited adults or
the reuse of participant data for model training.
