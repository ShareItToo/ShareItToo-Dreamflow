# R17 reduced non-binding Heilbronn Wave 0

Status: **PREPARED — NOT BUILT — NOT UPLOADED — NOT ACTIVATED**

This correction resolves `R16-P1-WAVE0-SURFACE-001` without enabling hidden or
untested release surfaces. For the next Stage-A candidate it supersedes the
full R14/N9 G3/G4/G5 participant flow, while preserving the historical R14/N9
artifacts as the record of the broader plan.

## Honest release-buildable participant scope

The reduced three-adult wave may later cover safe listing drafts, explicit
closed-Staging listing creation, search, project/Saved, the non-reserving cart
and structured feedback. It may use only the manual/mock listing-analysis
fallback unless a separate external-provider gate is granted. It never covers
a binding rental.

These tasks are explicitly `not-run` for the reduced wave:

- rental request and contract creation;
- owner acceptance or rejection;
- Payment, cancellation, Refund or Payout;
- handover, return, damage and `needsReview`;
- G3 booking groups, G4 Planner, G5 supply follow-up and G5 listing sets.

The existing `!releaseMode` locks on G3/G4/G5 remain intact. No UI is enabled
merely to satisfy an obsolete test script. The authoritative participant
template is
`docs/templates/48H_R17_REDUCED_NON_BINDING_WAVE0_TESTER_INSTRUCTIONS_DE.md`.

## Gate truth

`BUILD_READY`, `PLAY_UPLOAD_APPROVED` and `HUMAN_PILOT_ACTIVATED` remain
separate and ungranted. In addition, the P0 GitGuardian owner gate must be
closed before any of them can be granted. A later reduced human pilot still
requires exact candidate/signature/hash evidence, Play Internal owner action,
three-adult consent/roster handling, privacy/retention checks, operator facts
and owner activation. None is inferred here.

## Stop and rollback

Stop the candidate if the non-binding flag is false, the rental-request button
is active, a contract/request is created, a locked surface appears, or any
live/public/provider/payment behavior occurs. Before upload, rollback is to
discard the unapproved artifact and keep the branch Draft. During a later
authorized Internal pilot, disable the test release, stop new collection and
preserve only minimized evidence. Do not uninstall or erase participant data
while an incident or data-rights request is being preserved.

No person, Play Console, Firebase, provider, Payment, Production, VPS, Cloud,
DNS or PR merge was touched while preparing this correction.
