# WP261-A — booking interactions and review truth

Status: SOURCE PASS pending Sol review/commit; external gates remain closed.

## Scope

- Pending renter booking changes load the request from the backend, require the
  exact item and `pending` status, call the server amendment route with a stable
  idempotency key, and read the changed request back before showing success.
- Cancellation/withdrawal calls the real transition route and only succeeds
  after a server readback confirms `cancelled`.
- A missing or stale backend record, a non-pending amendment, a rejected
  transition, or a failed readback is an explicit failure; no local cache-only
  success is reported. Legacy Express transport remains disabled by policy.
- Booking reviews use `booking.review` idempotency. Same key and payload
  replays; same key with changed payload conflicts; an already existing review
  is returned as replayed without a second review or audit.
- Message-composer send/draft and account-context isolation remain covered by
  the accepted WP190 evidence; this package does not reimplement them.

## Verification

- `booking_review_idempotency.test.js`: 1/1.
- WP261-A + WP196 + transport fail-closed wiring: 6/6.
- Flutter analyzer on changed interaction files: PASS, no issues.
- Focused Flutter suites: review prompt all pass; message coordinator 8/8;
  message thread logic 8/8; booking status copy 5/5.
- `git diff --check`: PASS.

No provider, payment, Play, production, cloud or device traffic/mutation was
performed. Full regression is intentionally deferred to the package closure
gate.
