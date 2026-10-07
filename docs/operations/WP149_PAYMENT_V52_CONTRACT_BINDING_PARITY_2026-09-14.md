# WP149 — Payment V5.2 contract-binding parity

Status: **TECHNICAL CLOSURE; ASTRA CORRECTIONS REQUIRED; REAL-MONEY HOLD**.

## Decision

Payout eligibility must apply the same fail-closed contract and time invariant
for every payment transport. The Memory transport is a deterministic provider
simulator and has no permission to bypass a rule that also applies to Stripe.

Every direct payout and every reconciler candidate now requires:

- a persisted platform contract bound to exactly `V5.2-2026-08-16`;
- `platform_contracts.user_id = bookings.renter_id` for the same booking;
- a valid persisted contract acceptance instant bound within five minutes to
  its immutable `created_at` persistence clock;
- the later of the server-owned return/payout deadline and the end of the
  fourteenth German legal calendar day after the later bound acceptance or
  persistence instant.

The conservative later-instant rule prevents an accepted/persisted pair that
straddles Berlin midnight from shortening the hold or withdrawal window by one
calendar day. The German private-pilot calculation uses `Europe/Berlin` and
ends at the final millisecond of the relevant local day. It no longer depends
on a freely chosen listing or rental timezone. A missing contract or principal mismatch returns
`payout_contract_binding_invalid`; any other contract version returns
`payout_contract_version_unsupported`; an invalid acceptance instant returns
`payout_contract_time_invalid`. Historical and unknown contracts remain held
for explicit review and are never silently released.

## Implementation

The transport-dependent V5.2 switch was removed from the payment domain and
from the direct and reconciler workflow callers. Both paths pass
`contract.user_id` and `booking.renter_id` into the domain invariant. The
cancellation path also uses one database `clock_timestamp()` event instant for
the V5.2-withdrawal precedence decision, the no-show/start boundary, V5.1
refund calculation, `cancelled_at`, persisted `calculatedAt` and any actual-loss
case. None of those financial effects depends on the application process
clock.
Cancellation and booking-withdrawal now use an exact version allowlist for the
known V5.1 and V5.2 snapshots and require the same raw contract-user/renter
principal and acceptance/persistence-clock binding before any effect. Unknown, lowercase, truncated or
whitespace-padded versions are not silently downgraded to a legacy path. New
V5.2 persistence first compares the application acceptance instant with an
independent PostgreSQL `clock_timestamp()` and then sources immutable
`created_at` from PostgreSQL again in the insert statement. A stale application
clock is therefore rejected before any declaration or contract write. Payout,
health, cancellation and withdrawal independently reject missing, non-finite or
more-than-five-minute clock drift. Health truncates both PostgreSQL instants to
milliseconds before that comparison, exactly matching the JavaScript runtime
precision rather than creating a one-microsecond classification split.

The legal day-end helper and conservative later bound contract instant are
shared by payout, withdrawal and cancellation. The
existing five- and seven-day operational return-policy deadlines remain
wall-clock calculations; WP149 does not relabel them as legal day-count
deadlines.

The automated owner-declared renter-no-show branch is fail-closed before the
contract query and before any booking, refund-obligation or actual-loss
mutation. Bound Part C requires 30 minutes after the mutually confirmed
appointment, two unsuccessful platform contact attempts and no different
agreement. Current messages prove sending, while mutable appointment state and
messages do not independently prove the latter two legal facts. The API
therefore returns `renter_no_show_manual_review_required` and directs the
participant to the neutral handover-exception/support intake. This is not an
owner-no-show decision: actual owner no-show has a different full-refund rule.
The downstream actual-loss binder remains hardened as defense in depth and
accepts only the exact known V5.2 version and exact booking-renter principal.

Payment health now reports persistently blocked payout candidates as
`contractBlocked` and includes that count in `recoveryNeedsReview`. A candidate
is visible there when the remaining owner payout cannot proceed because the
contract is missing, not exactly V5.2, bound to a principal other than the
booking renter, or lacks a valid acceptance/persistence clock binding.

No migration was added because append-only historical rows cannot safely be
rewritten without a deployment-database audit. Existing database constraints require the V5.2
contract row to carry the required snapshot foreign keys, SIT acceptance
wording/hash and declaration metadata shapes. The normal application
transaction requires nine already persisted and hash-verified immutable legal
document snapshots, then persists the two declarations, contract row and
receipt together. This is not a claim
that the database constraints alone prove that every declaration or receipt
exists, that every historical acceptance clock is sound, that their legal
meaning is complete, or that an arbitrarily inserted row is professionally
approved. Runtime and payment health therefore fail closed on invalid
historical rows.

## Verification

The currently verified results are:

- focused unit, workflow, wiring and legal-validator set: **145/145 passed**;
- dynamic cancellation-boundary and wiring set: **26/26 passed**;
- backend static/check command: **passed**;
- complete backend suite: **921 passed, 2 intentionally skipped, 0 failed**;
- fresh PostgreSQL 16 integration: **2/2 passed and cleaned up**;
- dependent Privacy source-binding tests: **22/22 passed**;
- dependent Retention/Deletion source-binding tests: **46/46 passed**.

The two dependent manifests received hash-only refreshes for the changed
runtime sources. Their legal/privacy claims, approval states and external gates
were not changed.

The PostgreSQL integration proves that a stale application acceptance clock is
rejected and rolled back before contract or declaration persistence. A
separately labelled raw fixture represents a genuinely historical contract
whose acceptance and database creation instants were both old; application
persistence cannot manufacture that state. The integration also proves that a captured, completed booking with no
contract cannot create a payout, owner-transfer ledger entry, in-app
notification or notification-outbox entry through the direct endpoint or the
reconciler. It also proves the durable `contractBlocked` /
`recoveryNeedsReview` health signal, and that the explicitly labelled valid
historical contract-row fixture reduces that blocked count before the existing payout,
uncertain-response, dispute and refund lifecycle continues.
The same integration also proves direct, reconciler and health parity for a
parseable but stale acceptance time and a whitespace-padded V5.2 version, with no
payout, owner-transfer ledger, payout notification or outbox mutation.
Focused cancellation and withdrawal mutation cases prove that principal,
version or clock drift—including a malformed V5.1 persistence clock—is rejected before booking, refund-obligation or
withdrawal creation effects. Runtime boundary cases additionally prove one
DB-owned V5.1 cancellation event instant at rental start, the exact 24-hour
boundary and the exact short-notice grace boundary, plus conservative payout,
cancellation and withdrawal behavior when acceptance and persistence straddle
Berlin midnight.
Static ordering and downstream workflow tests additionally prove that an
owner-declared renter no-show reaches mandatory manual review before the first
cancellation decision or money path, and that unknown V5.2 versions or a
misbound renter principal cannot open an actual-loss case.

The Evidence `capturedAt` value is an inventory-assembly attestation made after
the final bound source set was assembled. Its canonical inventory digest and
per-file SHA-256 values make the captured content reproducible; the timestamp
is not represented as trusted external time evidence.

The complete local CI-equivalent technical regression passes on the documented
working tree. It includes the normal parallel tool suite, Web/Wasm build, loopback
smoke and Android debug build; no reduced-parallelism, retry-only or timing
workaround is used as release evidence. Exact-head GitHub Regression/CodeQL
remain pending until the package is committed and pushed.

## Independent legal cross-check and remaining legal risk

The remote Codex task requested as Astra Ultra returned a comparison against the exact L2
source assessment bound to baseline commit
`2db2b90aab385aeba527fd559a33c269c8dc00cf`. Its normalized result is
**CORRECTIONS_REQUIRED**: **3 CONFIRM / 12 CORRECT / 3
INSUFFICIENT_EVIDENCE**. The raw model response was not persisted; the
available normalized matrix and result report record that limitation. The
retained package therefore records the task outcome and normalized
distribution, but is not independently auditable as a complete per-key capture
of every field requested in the L2 cross-check scope.

WP149 corrects the identified end-of-day error for the relevant 14-day
calculations. The possible Saturday, Sunday or public-holiday extension under
§ 193 BGB is **nicht implementiert** and remains legally open. That point
and the other Astra corrections remain open legal work. The cross-check is an
AI comparison: **keine professionelle Rechtsfreigabe** und **kein Echtgeld**.

## Boundaries and next step

No provider request, Stripe mutation, payment, money movement, deployment,
Production, public activation, Store, Firebase, credential, device or PR-merge
action occurred. Professional legal approval, owner adoption, real money,
public release, Production and all corresponding external gates remain closed.

The current signed candidate predates this runtime change. A single strictly
higher exact-head candidate remains required after the last runtime-affecting
package rather than an intermediate build now.

Next bounded package after exact WP149 closure: make completed refund and payout
replays independent of an expired execution gate while retaining immutable
command, actor, request, payment and response binding. Durable private-registry
pull readiness and all external/human gates remain separately open.
