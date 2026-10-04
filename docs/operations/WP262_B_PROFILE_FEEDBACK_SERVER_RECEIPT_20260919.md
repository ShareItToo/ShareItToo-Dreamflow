# WP262-B — profile feedback server receipt

## Scope

Make the reachable Profile feedback action truthful without adding an API or
schema. No provider, payment, Store/Play, production, cloud, Firebase or
device mutation.

## Changes

- Profile feedback now uses the existing authenticated
  `BackendRepository.createSupportCase` route with the reviewed
  `general_help/feedback_or_improvement` intake and versioned safety,
  single-issue and feedback context.
- The captured account principal is checked before the request and after the
  response. An account switch cannot clear or display Account A's draft or
  receipt under Account B.
- Post-await UI handling uses value-based epoch/session/principal comparison,
  so a same-principal reload represented by a distinct owner object still
  accepts the confirmed receipt, while a changed owner is silent and isolated.
- A stable, opaque cryptographically random per-submit idempotency key and
  `ProfileFeedbackCoordinator` prevent double submissions; no account/session
  identifier is sent in that key. The production generator and owner comparator
  are exposed only for deterministic tests: the executable checks prove the key
  shape/uniqueness/opacity and that same-principal refreshes preserve the draft
  while epoch/session drift invalidates it. Fields clear only after a server
  response; failures keep the draft and provide a retryable error.
- The client caps feedback at 1,982 characters so the `Feedback zur App: `
  summary prefix remains within the backend's 2,000-character limit; exact
  2,000/2,001 summary boundaries are tested.
- The previous local-only `DataService.addFeedback` success path is no longer
  used by the Profile action.

## Verification

- Profile feedback coordinator success, failure/retry, double-tap, session
  switch, exact summary-boundary, intake-attestation, opaque-key and
  owner-transition tests: 8/8 PASS.
- WP262-B static reachability/contract tests: 2/2 PASS.
- Consumer closure: PASS (3 manifests, 64 code consumers, 122 tests,
  90 migrations).
- No live provider, payment, Store/Play, production, cloud, Firebase or device
  traffic occurred.
