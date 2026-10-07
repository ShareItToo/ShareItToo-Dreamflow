# PF5 — Closed Android pilot test and measurement plan

Status: **PLANNING ONLY — HOLD / NO-GO**

This plan defines the smallest real Stage A test lane. It records no observed
participant, flow or metric result and authorizes no invitation, account,
installation, signing, Store action, provider change, real payment or pilot
activation. Execution starts only after the seven Stage A gates in
`docs/operations/EXTERNAL_GATE_EXECUTION_BOARD.md` are authentically closed,
an exact candidate is approved and Walid separately issues
`PILOT_STAGE_A_DECISION_GO`.

## Fixed Stage A envelope

- At most 30 invited private adults in Spiegelberg, managed outside Git and
  chat under opaque participant references.
- 30–50 planned, fully documented flows across Cat8 Elektrowerkzeuge,
  Bohrmaschinen and Schleifer.
- Android only; V5.2 single-item rental, Discover, direct search, Gemerkt,
  non-reserving Mietkorb and existing request, handover, return and Support.
- Synthetic/test payment only. No live PSP, real money, public registration,
  public Store launch, G3–G5, SIT Business, external AI, vehicles, delivery,
  shipping or express.
- The Pixel 7 Pro has no cellular-data route. The offline/resume test therefore
  uses two separately approved WLANs. Network names, BSSIDs, passwords, IPs
  and route identifiers must never enter evidence.

The participant ceiling and flow range are planning values, not actual counts.
An unexecuted case is `not-run`, never `passed`.

## Roles and run prerequisites

Use invited adults under the pseudonymous run roles `owner-A`, `renter-A` and,
where conflict isolation is required, `renter-B`. `observer-operator` records
only sanitized structured outcomes. `privacy-disposable-A` is an isolated
synthetic account that contains no protected or real participant data and may
be deleted only under the separately authorized run procedure.

Before the first case, bind the exact source commit, candidate build, private
distribution channel, staging backend version and evidence-template version.
Verify `livemode=false`, public registration off, external AI off,
`Support file upload off`, approved backup/rollback, adult roster/consent outside Git, named
Operations cover, and all Stage A release tokens except the final activation
decision. Candidate signing, private installation and participant setup remain
separate Walid gates; this plan performs none of them.

Every case runs with a fresh scenario reference and declared pre-state. Do not
reuse a booking whose state is unclear. A failure is preserved and classified;
it is not rerun until green merely to obtain a pass.

## Evidence and data-minimization contract

Each case records only: scenario reference, opaque role references, candidate
commit/build and sanitized artifact hash, UTC start/end rounded to the minute,
expected and enumerated actual outcome, pre/post state enum, error class,
abort-reason enum, Support-needed boolean, observer minutes, understanding
score, rebooking-intent enum and sanitized evidence references. Screenshots or
logs are cropped/redacted before admission and must not contain free text when
an enum is sufficient.

Never store passwords, OTP/2FA/passkeys, tokens, secrets, email addresses,
telephone numbers, raw account/device/ADB identifiers, exact addresses,
precise location, WLAN names/BSSIDs/passwords/IPs, real bank/card/payment data,
identity documents, faces, photo EXIF, unrelated notifications or raw chat and
Support free text. Evidence photos, if a separately approved candidate run
requires them, use synthetic objects and the governed private booking-evidence
path; originals never enter Git, Drive, Telegram, Maximus or the measurement
export.

## Error classification and stop decision

| Class | Meaning | Required action | Pilot blocker |
| --- | --- | --- | --- |
| P0 | Security, legal, privacy or data-integrity defect; real-money/live-provider signal; sensitive-data disclosure; unsafe physical event | Stop all participant activity, preserve sanitized evidence and invoke the named incident/legal/privacy owner | Yes, entire Stage A |
| P1 | Primary Stage A flow cannot complete, false success, state corruption, auth/role bypass, unrecoverable offline state or missing mandatory evidence | Stop the affected lane; stop the whole pilot when the core path or multiple users are affected | Yes |
| P2 | Reproducible comprehension, accessibility or conversion problem with a safe workaround and correct durable state | Record against denominator and backlog; do not expand scope to fix speculatively | No, unless reclassified by review |
| P3 | Automation or founder-independence gap without participant or state risk | Backlog only during pilot freeze | No |
| P4 | Comfort or rare edge case without material pilot impact | Backlog only | No |

The observer chooses only a provisional class. Security, Legal, Privacy or
Operations may raise it. No one may lower P0/P1 without documented review. A
case marked `not-run`, `blocked` or `evidence-invalid` cannot support a GO.

## Stage A scenario matrix

### A01 — Create listing

- **Role/prerequisites:** `owner-A`; clean synthetic Cat8 item, approved generic
  location text, non-identifying test images and an available time window.
- **Steps:** create one listing; select exactly one allowed Cat8 path; enter
  synthetic description, price and availability; preview and publish only
  inside the authorized private candidate.
- **Expected:** one discoverable listing with the exact sanitized fields and no
  forbidden transport, deposit, protection or live-payment option.
- **Evidence:** listing-state enum, allowed category, availability checksum and
  sanitized preview reference; no original image.
- **Error/blocker:** wrong persistence, public exposure, category escape or
  false publication is P1; leakage of location/identity or public access is P0.
- **Never store:** exact address, coordinates, owner contact, face, EXIF or raw
  listing free text. **Pilot decision:** P0/P1 blocks; otherwise record result.

### A02 — Direct search and Discover

- **Role/prerequisites:** `renter-A`; A01 listing indexed and a second synthetic
  out-of-scope control item present.
- **Steps:** start from Discover; run a direct Cat8 query; apply the approved
  region/category context; open the intended detail; clear and repeat once.
- **Expected:** the in-scope item is findable and opens consistently; the
  control item cannot silently enter the eligible Stage A result set.
- **Evidence:** search-start event, result-count band, selected opaque item ref,
  filter enum and outcome; no query free text.
- **Error/blocker:** no safe route to an eligible item or scope leakage is P1;
  ranking/comprehension friction with correct scope is P2. **Never store:** raw
  query, location, profile/contact data or unrelated results. **Pilot decision:**
  P0/P1 blocks.

### A03 — Gemerkt

- **Role/prerequisites:** `renter-A`; A02 detail open.
- **Steps:** add to Gemerkt; leave and reopen the app; verify persistence; remove
  the item and verify cleanup.
- **Expected:** state persists for the same account, is clearly non-binding and
  creates neither reservation nor request.
- **Evidence:** opaque item ref, saved-state transitions and non-reservation
  marker.
- **Error/blocker:** cross-account exposure or unintended reservation is P0/P1;
  label confusion with correct state is P2. **Never store:** account identifier,
  contact data or item free text. **Pilot decision:** P0/P1 blocks.

### A04 — Non-reserving Mietkorb

- **Role/prerequisites:** `renter-A`; eligible listing available.
- **Steps:** add once, attempt duplicate add, restart, inspect date/price intent,
  remove and restore through the normal UI if offered.
- **Expected:** one persisted cart intent, explicit “not reserved” meaning, no
  availability lock and no money/provider action.
- **Evidence:** cart-add event, deduplication outcome, persistence enum and
  reservation/payment flags both false.
- **Error/blocker:** hidden reservation, duplicate durable line or payment side
  effect is P1/P0; wording friction is P2. **Never store:** exact user/item IDs,
  payment data or raw notes. **Pilot decision:** P0/P1 blocks.

### A05 — Send rental request

- **Role/prerequisites:** `renter-A`; A04 intent, fresh eligible availability and
  a reviewed synthetic/test quote.
- **Steps:** select dates; review declarations and immutable quote; submit once;
  repeat the final action once to test idempotency.
- **Expected:** exactly one pending request bound to the displayed snapshot;
  duplicate submission cannot duplicate state or money.
- **Evidence:** request-start/submitted enums, opaque request ref, quote hash,
  duplicate-result enum and `livemode=false`.
- **Error/blocker:** duplicate request, stale/changed quote, false success,
  missing declarations or any live payment signal is P1/P0. **Never store:**
  declarations containing personal facts, full quote document, token or payment
  data. **Pilot decision:** P0/P1 blocks.

### A06 — Owner accepts request

- **Role/prerequisites:** `owner-A`; one fresh pending A05 request.
- **Steps:** open request; verify dates/item/quote; accept once; repeat the action
  and observe renter status.
- **Expected:** one accepted booking, server-owned availability transition and
  consistent views for both roles; no capture or payout.
- **Evidence:** before/after status enums, opaque booking ref, availability
  checksum and synthetic-payment marker.
- **Error/blocker:** unauthorized acceptance, double transition, inconsistent
  state or money action is P1/P0. **Never store:** participant identity, raw
  messages, address or financial data. **Pilot decision:** P0/P1 blocks.

### A07 — Owner rejects request

- **Role/prerequisites:** `owner-A`; a separate pending synthetic request.
- **Steps:** reject using an allowed structured reason; repeat action; verify the
  renter result and item availability.
- **Expected:** one terminal rejection, no booking, no reservation and no money
  action; reason exposure stays within approved wording.
- **Evidence:** status transition, reason enum and availability checksum.
- **Error/blocker:** accepted-looking UI, blocked availability or unauthorized
  disclosure is P1/P0; unclear wording is P2. **Never store:** raw rejection
  explanation, identities or contact data. **Pilot decision:** P0/P1 blocks.

### A08 — Availability change and conflict

- **Role/prerequisites:** `owner-A`, `renter-A`, `renter-B`; one accepted window
  and one overlapping pending attempt on the same item.
- **Steps:** owner changes only an unbooked window; both renters refresh; attempt
  overlapping dates; verify accepted snapshot is immutable and conflicting
  request fails safely.
- **Expected:** no silent mutation of the accepted contract, no double booking,
  and all roles converge on authoritative availability.
- **Evidence:** opaque window/checksum, conflict enum and role-view consistency
  enum.
- **Error/blocker:** double booking, accepted-contract drift, lost update or
  divergent durable state is P0/P1. **Never store:** exact schedules tied to
  people, address, IDs or messages. **Pilot decision:** P0/P1 blocks.

### A09 — Handover

- **Role/prerequisites:** both roles; accepted booking, confirmed appointment,
  synthetic item and separately approved governed evidence capture.
- **Steps:** owner starts handover; record the required four synthetic evidence
  positions; renter completes the role-bound confirmation once; try a repeated
  or wrong-role confirmation.
- **Expected:** only the correct two-party sequence moves the booking to running;
  missing evidence, replay and wrong role fail without state mutation.
- **Evidence:** step enums, evidence-slot completeness only, confirmation method
  and final state; no image original.
- **Error/blocker:** bypass, replay, wrong-role success, evidence loss or false
  running state is P0/P1. **Never store:** faces, EXIF, codes, exact location,
  raw device data or originals in the measurement export. **Pilot decision:**
  P0/P1 blocks.

### A10 — Return, damage and needsReview

- **Role/prerequisites:** both roles; one running booking, confirmed return time
  and synthetic normal/damage variants.
- **Steps:** renter starts return; capture four synthetic evidence positions;
  owner confirms normal return; in a separate run mark one substantiated item
  issue and verify `needsReview` holds completion without affecting unrelated
  bookings.
- **Expected:** normal return completes exactly once; review variant remains
  auditable and unresolved without automatic money/refund/payout action.
- **Evidence:** return-step enums, slot completeness, final/review state,
  affected opaque item ref and unrelated-position isolation result.
- **Error/blocker:** completion without required evidence, lost damage flag,
  cross-item contamination or automatic money action is P0/P1. **Never store:**
  raw damage narrative, faces/EXIF, exact location or real valuables. **Pilot
  decision:** P0/P1 blocks.

### A11 — Cancellation and withdrawal

- **Role/prerequisites:** owner and renter; separate synthetic requests/bookings
  for pre-acceptance, accepted-before-handover and post-handover boundaries.
- **Steps:** exercise requester withdrawal, renter cancellation and owner
  cancellation at the allowed boundaries; verify disallowed post-handover path;
  inspect synthetic refund obligation without executing money.
- **Expected:** policy/timestamp snapshot determines the only allowed transition;
  audit is append-only and refund/payout remain synthetic, separated states.
- **Evidence:** actor-role, boundary enum, policy hash, resulting status and
  synthetic refund-obligation enum.
- **Error/blocker:** wrong actor/amount/state, mutable policy or real payment is
  P0/P1; explanation friction is P2. **Never store:** raw reason, bank/card data,
  contact details or exact user timestamps beyond rounded evidence. **Pilot
  decision:** P0/P1 blocks.

### A12 — Support and safety routing

- **Role/prerequisites:** participant plus `observer-operator`; text-only Support
  enabled, arbitrary file upload disabled, named on-call route available.
- **Steps:** open one normal booking-linked case; verify status/deadline updates;
  run one clearly labelled synthetic safety-routing case without harmful real
  content; attempt attachment and confirm it remains unavailable.
- **Expected:** authenticated, least-privilege, auditable routing with no generic
  bypass; safety route escalates without the app claiming to decide facts;
  arbitrary upload stays off.
- **Evidence:** case category/status/deadline enums, booking-link boolean,
  escalation enum and upload-disabled boolean.
- **Error/blocker:** access bypass, missed safety escalation, sensitive leak or
  enabled arbitrary upload is P0/P1; confusing copy is P2. **Never store:** raw
  Support/chat free text, third-party facts, images, contacts or sensitive
  allegations in the measurement export. **Pilot decision:** P0/P1 blocks.

### A13 — Privacy export and deletion request

- **Role/prerequisites:** `privacy-disposable-A`; isolated synthetic data only;
  Privacy owner and deletion procedure available; no Legal Hold unless the
  hold branch is intentionally tested without deletion.
- **Steps:** request/export the account data; verify expected categories and
  local Gemerkt/cart state; request deletion; confirm the warning and execute
  only when the separate disposable-account deletion gate permits it; verify
  fail-closed Legal Hold behaviour in a separate synthetic case.
- **Expected:** scoped export, authenticated confirmation, deletion or hold
  outcome exactly as governed, and no deletion of protected/real accounts.
- **Evidence:** request/status enums, category-presence booleans, hold boolean,
  completion receipt hash and local-store-cleared boolean; no export payload.
- **Error/blocker:** unauthorized export/deletion, missing governed data,
  bypassed hold or retained data contrary to the approved rule is P0. **Never
  store:** export contents, email, identifiers, messages, documents or deletion
  credentials. **Pilot decision:** any defect is P0 and blocks all Stage A.

### A14 — Controlled crash/force-stop and restart

- **Role/prerequisites:** `renter-A`; known pre-state in Gemerkt/cart, pending
  request and no in-progress handover/return mutation.
- **Steps:** background and force-stop the app at declared safe checkpoints;
  relaunch; restore session and reload authoritative state; repeat once while a
  submission acknowledgement is delayed, without inducing OS/device damage.
- **Expected:** no phantom success, duplicate action, secret disclosure or lost
  committed state; uncertain submissions reconcile visibly with the server.
- **Evidence:** checkpoint enum, pre/post state checksums, restart/reconcile
  outcome and crash reference stripped of identifiers.
- **Error/blocker:** duplicate/missing durable state, auth leak or false success
  is P0/P1; slow but correct recovery is P2. **Never store:** raw crash dump,
  device ID, tokens, notifications or personal state. **Pilot decision:** P0/P1
  blocks.

### A15 — Offline, WLAN switch and resume

- **Role/prerequisites:** `renter-A` and optionally `owner-A`; two approved WLANs
  available, no cellular data, safe pending/cart state and no uncontrolled
  physical handover transition.
- **Steps:** load state online; disable connectivity; attempt a read and one
  safely rejectable mutation; force-stop/reopen offline; switch to the second
  approved WLAN; resume and reconcile; repeat the authoritative read.
- **Expected:** offline state is explicit, no false successful mutation or
  duplicate request occurs, and reconnection converges without data loss.
- **Evidence:** network-state enums (`online-A`, `offline`, `online-B`) using no
  fingerprint, attempted-operation enum, queue/reconcile result and state
  checksum.
- **Error/blocker:** false success, duplicate mutation, cross-account data,
  unrecoverable divergence or secret/network leak is P0/P1; latency or unclear
  recovery text is P2. **Never store:** SSID/BSSID/password/IP, route or device
  identifiers, notification content or personal data. **Pilot decision:**
  P0/P1 blocks.

## Measurement plan

The measurement export is append-only, pseudonymous and aggregate-first. It
contains no analytics/marketing SDK and sends no event to a new provider.
Denominators exclude `not-run` cases and are always reported beside numerators;
missing observations are `unavailable`, never zero.

| Metric | Numerator / value | Denominator / start | Allowed values |
| --- | --- | --- | --- |
| Project/search start | unique flow refs reaching Discover or direct-search start | eligible invited flow refs started | integer counts |
| Mietkorb | flow refs with one successful non-reserving add | search/detail flow refs eligible to add | integer counts and rate |
| Request | exactly-once submitted request refs | cart/detail flow refs that entered request review | integer counts and rate |
| Acceptance | accepted request refs | owner-reviewed valid pending requests; rejections reported separately | integer counts and rate |
| Completed flow | bookings reaching governed completed state | accepted bookings scheduled to complete in the observation window | integer counts and rate |
| Handover success | bookings completing the required two-party handover | handovers started | integer counts and rate |
| Abort reason | count per first terminal reason | all started flow refs not reaching planned terminal state | enum only: `scope`, `availability`, `quote`, `request`, `owner_reject`, `handover`, `return`, `support`, `privacy`, `technical`, `participant_stop`, `other_sanitized` |
| Support need | flow refs opening at least one governed Support case | all started flow refs | boolean counts and rate |
| Walid time | summed active observer/operator minutes | run day and completed flow; never inferred from wall-clock alone | integer minutes |
| User understanding | selected post-flow score | participants answering after an eligible flow | integer 1–5 plus response count |
| Rebooking intent | answer count by choice | participants answering after an eligible terminal flow | `yes`, `maybe`, `no`, `unavailable` |

Report counts before rates and publish no segment with a denominator below five.
Do not claim causal conversion effects from the 30–50-flow exploratory pilot.
Targets from older runbooks remain targets and must be labelled separately from
these observations.

## Run order and daily decision

1. Internal observer dry run: A01–A05 and A14–A15 using disposable synthetic
   data; no invited participant.
2. Two-role dry run: A06–A12, then A13 only under its deletion gate.
3. Small invited wave only after the exact candidate, evidence and Stage A GO
   are valid; do not jump directly to the 30-person ceiling.
4. After each wave, reconcile scenario evidence, denominators, P0/P1 state,
   Walid time and rollback readiness before another wave.
5. Stop at 50 completed planned flows, participant ceiling, expired candidate
   binding, any P0, unresolved P1 or any external-gate regression.

## PF5 completion and decision boundary

PF5 is complete when this plan and its deterministic repository wiring test are
committed, pushed and green on the exact documentation head. That only proves
the test design is present. Current observed pilot results remain zero and all
Stage A scenarios remain `not-run`.

Current recommendation: `PILOT_STAGE_A_DECISION_NO_GO`. First execute Walid
Action Pack A1–A5 and close the seven authentic Stage A blockers. Only then
prepare the exact signed/private Android candidate and present the final
candidate-bound dossier. The only valid final response tokens at the later
decision gate are `PILOT_STAGE_A_DECISION_GO` and
`PILOT_STAGE_A_DECISION_NO_GO`. Neither token is issued by this plan.
