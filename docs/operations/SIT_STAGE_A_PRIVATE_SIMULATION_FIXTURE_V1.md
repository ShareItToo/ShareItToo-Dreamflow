# Stage-A private simulation fixture — source review packet

Status: isolated uncommitted successor to 1351; not deployed or enabled. Live Web
9b892e and API 1351 remain the separate runtime boundary.

This optional lane reuses the existing clone in-memory lifecycle engine. It
creates no canonical listing, booking, payment, review, ranking or availability
row. The fixture always says synthetic_fixture, realOffer=false,
bookingAllowed=false, publicationAllowed=false and catalogVisible=false.
Photo slots contain synthetic descriptors; they are not authentic item photos.
The test-only review is a private in-memory draft, never a public review.

Activation requires SIT_STAGE_A_FIXTURE_ENABLED=1, test environment, valid
Staging access allowlist containing the two distinct configured principals,
nonBindingSimulationEnabled=true, memory payments with livemode=false, external
Listing-AI execution disabled and SIT_STAGING_PILOT_ID=heilbronn_wave0.
SIT_STAGE_A_FIXTURE_OWNER_ID and SIT_STAGE_A_FIXTURE_RENTER_ID are exact existing
protected test principals. SIT_STAGE_A_FIXTURE_RUN_ID must match
stagea-sim-YYYYMMDDtHHMMSSz-xxxxxxxx (eight lowercase hex characters).
SIT_STAGE_A_FIXTURE_EXPIRES_AT is a canonical UTC ISO timestamp, future and at
most one hour from process startup. Missing or invalid opt-in fails before
startup database initialization. Default remains disabled.

Only authenticated active allowlisted principals and the exact run can use
/v1/staging-non-binding/:runId. One booking and at most 200 nonterminal requests
per participant/run are permitted. The fixture, accept, evidence-slot, QR and
private review-draft routes call only the in-memory engine. No payment route
is exposed. Canonical routes reject reserved fixture identities even when the
lane is disabled, and reject its booking identities while the process lives,
including after cleanup. The fixture is never inserted into catalog/search.

DELETE fixture clears every simulated booking/photo/challenge/chat/review-draft
resource and returns a zero-resource proof. Repeated cleanup is idempotent.
Cleanup, status and audit remain available to the same principals after expiry
or request-budget exhaustion. Audit remains in process memory only; the operator
must export it into protected evidence before restart. Restart destroys fixture
state and audit; no durable-audit guarantee is claimed. Existing clone audit
names remain synthetic_clone.*; each event binds the Stage-A marker and run.

The current canonical simulation harness is not switched to this lane. Its
existing pickup/return helpers now reuse two already verified role sessions,
so a complete run performs two logins instead of six and the existing cleanup
scope logs them out. No live sessions were revoked: generic node user agents
and empty login metadata cannot prove diagnostic ownership. The current IAB
session remains preserved. Review planned revocations: [].

Verification: red/green focused contract tests cover scope failures, synthetic
truth, private lifecycle, cleanup, expiry/rate budget, route authentication,
canonical rejection including nested publish and long sync payloads, and the
shared clone engine regression. HTTP catalog absence uses an isolated Express
route harness plus no-storage source checks; it is not a live DB or rendered
Web proof. Payment simulation UI and EUR 1 memory-only enablement remain a
separate FIX package. No real provider, payment, publication, deploy or cleanup
of live data is authorized by this source packet.

Next: Sol source review of this diff, then a narrow Gemini review of the
synthetic/public/canonical boundary. Only an independently reviewed runtime
package may enable the flag, adapt the existing harness to these routes, run
an exact two-role test and export cleanup/audit evidence.
