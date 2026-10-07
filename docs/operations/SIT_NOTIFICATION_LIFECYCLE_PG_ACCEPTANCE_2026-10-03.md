# SIT notification lifecycle — isolated PostgreSQL acceptance

**Result: PASS for the provider-off synthetic request/accept/message slice.**
Base HEAD: `4ecb0a47596a6cfead0be96567c9d7062780d357`.
This package adds tests and runner registration only; production notification
behavior did not change. It closes the local PostgreSQL portion of module 1
from the [notification gap map](SIT_NOTIFICATIONS_PUSH_PILOT_GAP_MAP_2026-10-03.md),
not current browser rendering, native device delivery or FCM activation.

## Exact scope and evidence

- [Integration test](../../backend/test/notification_lifecycle_postgres.integration.test.js)
  uses run-unique synthetic owner/renter/foreign principals. Its listing is an
  explicitly named database fixture, not publication or authentic-photo proof.
  Private-pilot checks remain enabled; booking creation uses the existing
  acknowledged non-binding simulation path and normal HTTP request/acceptance
  endpoints. No lifecycle timestamps or state transitions are patched in SQL.
- Committed request and owner acceptance each create exactly two unique outbox
  rows (`in_app` and memory push). Request notification belongs to the owner;
  acceptance notification belongs to the renter. Exact create/accept replays
  preserve booking-event, audit, outbox and inbox counts.
- A committed renter message has one message row, one audit event and two
  outbox rows. Exact replay preserves its original ID and all effect counts.
  Only the owner receives its inbox notification. Foreign message read/write
  fails `403`; foreign/sender inbox mutation fails `404`.
- Notification starts unread, accepts the recipient's authenticated read
  update and retains that value. Booking/chat action URLs and CTA labels match
  the exact intended resource and fixed SIT origin; no link is followed out of
  the loopback test.
- [Disposable HTTP child](../../backend/test_support/notification_lifecycle_server.mjs)
  is stopped cleanly and replaced by a new process/PID. Database inbox and read
  state persist; another worker drain creates no duplicate delivery. The six
  attempts have only `postgres`/`memory` providers and `sent` outcomes.
- Anonymous access and a token combining owner identity with a foreign session
  fail `401`. Real logout HTTP revokes the owner's synthetic session and removes
  only its push registration; old read/write requests fail `401`, while renter
  registration/access and stored notification facts remain intact.
- The accepted synthetic booking retains zero payment and platform-contract
  rows. No FCM/provider request, real account/device/browser change or deployment
  occurred.

The standard PostgreSQL runner shares a cluster across suites, so this test
creates one random, preflighted database within that disposable cluster. This
prevents its global outbox worker from consuming another suite's fixtures.
Both child processes stop, the exact fixture database is dropped and absence
is verified; the canonical runner then removes its cluster. No shared data is
truncated and no foreign fixture is deleted.

## Commands and results

```sh
SIT_POSTGRES_FOCUSED_NOTIFICATIONS=1 node tool/run_local_postgres_integration.mjs
# PostgreSQL 16.15; 5/5 pass, zero failures/skips; passed-and-cleaned.

cd backend
node --import ./test_setup.js --test \
  test/local_postgres_integration_runner.test.js \
  test/staging_notification_recipient_gate.test.js \
  test/push_sender.test.js test/auth_session_actions.test.js
# 32/32 pass, zero failures/skips.
```

New test/helper syntax and `git diff --check` pass. The focused environment
route and unchanged standard-plan inclusion are tested; the simultaneous
password-enrollment runner group was preserved. Full shared backend/tool
closure belongs to the coordinating package and is not claimed by this report.

Two fixture issues were corrected before the final run: the listing's no-deposit
schema requires `NULL`, and HTTP automatically schedules the asynchronous
outbox worker. Tests now join that worker before comparing inbox snapshots;
no sleeps, retries, production changes or relaxed assertions were used.

Next: independent review of this source/test slice and the shared standard
gates, then separately authorized browser inbox/CTA rendering acceptance.
Native FCM acceptance retains the transport, device, consent and recipient
gates from the gap map.
