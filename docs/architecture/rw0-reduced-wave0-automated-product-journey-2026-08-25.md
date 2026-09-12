# RW0 reduced Wave-0 automated product journey

Status: **VERIFIED — LOCAL/SYNTHETIC — REGRESSION AND CODEQL GREEN**

## Decision

The highest-value independent package after R17 is one deterministic product
journey across the exact reduced Stage-A surface, not another isolated support
or launch document. It exercises the state transitions a first closed-pilot
participant would actually use while every binding and live boundary remains
closed.

The retained journey is compiled only with both
`SIT_STAGE_A_NON_BINDING_PILOT=true` and
`SIT_BLUE_OCEAN_LISTING_ASSISTANT=true`. The default test suite skips that one
profile-bound test and the technical regression invokes it explicitly.

## Exact surface matrix

| Area | Automated action | Required result |
| --- | --- | --- |
| Listing | Open new-listing Stage-A notice; edit a synthetic private draft; explicitly publish locally | Active local listing, private declaration retained, no transport option |
| Search | Render the synthetic result and operate its named 48 dp save action | Result remains findable and saved state is accessible |
| Gemerkt | Select `Demnächst benötigt` | Local non-binding assignment persists |
| Mietkorb/Project | Add a date range, create a project and assign the item | No reservation; complete cart survives restart |
| Quote | Open the single-item review | Informative Stage-A preview only |
| Feedback | Record `Zu teuer` | One local structured feedback record |
| Restart | Dispose all surfaces and rebuild from persisted state | Listing, saved assignment, project and cart remain coherent |
| Failure | Read missing, empty, malformed and interrupted local stores | Empty states stay empty, corruption is preserved fail-closed, canonical cart snapshot recovers |

## Excluded surface proof

The journey creates no rental request or contract and writes no Payment,
Refund, Payout, booking-selection, handover/return, damage-review or
`needsReview` store. The Stage-A request button is disabled and no legal
acceptance checkbox is built. G3 booking groups, G4 Planner and G5 supply/list
surfaces retain their release-mode locks.

## Red-first findings closed

1. A missing category cache invoked the all-demo initializer and could replace
   users, listings, reviews and `currentUser`. Category recovery now writes
   category reference data only.
2. Missing or empty item/user stores could enter destructive or recursive demo
   reseeding despite the runtime demo gate being false. They now remain empty;
   malformed listing JSON is preserved and fails closed.
3. The split local cart could combine item and project documents from different
   revisions. New writes place the complete cart in one atomic canonical
   document; the old project document is a compatibility mirror. Legacy torn
   revisions fail closed without mutation.
4. The project-name controller was disposed before the dialog reverse
   transition removed its `TextField`. The dialog body now owns and disposes
   the controller with its actual widget lifecycle.
5. The search-result favorite action lacked an explicit accessible state/name
   and a guaranteed 48 dp target. Both are now retained.
6. Exact GitHub CI correctly rejected the first commit because its synthetic
   local login used a static password-shaped property. The current fixture is
   generated at runtime. The immutable false-positive commit is recorded only
   by rule, commit and path in the repository's exact reviewed-history
   baseline; the working tree can never inherit that exception.

## Scale consequence

The canonical local cart snapshot is compatible with later account sync and
does not enable it. Business/Global work can later replace the storage adapter
behind the same non-reserving model, but must not reinterpret this Stage-A
evidence as contract, payment, availability or multi-owner transaction proof.

No candidate, Pixel, tester, provider, Firebase/Play, Payment, Production,
VPS, DNS, Cloud, public release, PR merge or credential was touched.

## Exact verification

Implementation and CI-correction head
`ce37ecc89af1a5176d4afaa608ddd1f3552d2512` passed GitHub Regression run
`32790896732` and CodeQL workflow `32790896756`, with zero open code-scanning
alerts. Backend, Flutter, PostgreSQL and the 14-minute clean-checkout
reproducibility job all passed. GitGuardian was skipped and remains the
separate owner-controlled historical review gate; it is not represented as a
passing check.
