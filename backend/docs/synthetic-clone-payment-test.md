# Local QA synthetic payment adapter and isolated Flutter journey

This is not a checkout, real payment, provider sandbox, contract, reservation,
refund document or payout. Flutter selection UI is available only in the
explicit local-QA debug build and from an existing synthetic clone booking.
Stage-A and normal payment routes remain unchanged and fail closed. The normal
memory payment workflow cannot be reused: it requires SQL bookings and writes
ledger, booking confirmation and notifications. This adapter reuses only pure
amount, status-name and idempotency functions, never that workflow or a provider.

## Activation and ownership

`SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE` defaults to `0`. Only exact `1` enables it,
and only with the existing enabled clone lane, local-QA synthetic-image marker,
deployment `test`, bind host `127.0.0.1`, transport `memory`, and livemode false.
Invalid requested configuration fails before database initialization. Release
and Store candidate tooling rejects the flag. The separate Dart define of the
same name defaults to `false`; only the local-QA builder passes `true`. Startup
rejects malformed values, release/profile mode, a non-QA package, a non-clone
configuration or a non-loopback endpoint. Release tooling explicitly sets false.

The existing local QA backend runner accepts the explicit flag, forces it off
during bootstrap, and enables it only for its run-bound clone successor. Its
private manifest includes the verified capability. No physical runner or
device execution is authorized by this document.

The adapter is owned by the clone lane instance and holds only bounded,
ephemeral Maps. It never imports DB, provider or network modules. Clone cleanup
clears payment states, command receipts and payment audit; the existing clone
cleanup proof remains retained by its original contract. The runner validates
zero payment resources before terminating the local server/database.

## API

The existing clone participant authentication applies. Both exact participants
may read; only the renter may issue commands. Every request binds the server's
run ID and an existing clone booking ID. Neither booking status nor inventory
is mutated. All responses are no-store and contain the persistent notice:

`Synthetischer Zahlungstest – kein echtes Geld/kein Vertrag/keine Auszahlung`

- `GET /v1/synthetic-clone/status`: optional `paymentTest` capability with
  enabled, runId, marker, methods, scenarios and resource counts. Absent by default.
- `GET /v1/synthetic-clone/bookings/:id/payment-test?runId=...`: authoritative
  synthetic quote, current payment snapshot, null payout and payment audit.
- `POST /v1/synthetic-clone/bookings/:id/payment-test/commands`: exact JSON
  `{runId,key,action}`; only `select` additionally requires `method` and `scenario`.

Selection uses method `synthetic`, scenario `challenge_then_capture` or `decline`.
The server fixes the synthetic quote at 60.00 EUR plus the canonical 10% fee.
Unknown fields, client-supplied amounts/status and arbitrary methods are refused.
Selection produces `ready`; `submit` produces `requires_action` or `failed`.
Only `confirm` after `requires_action` produces `captured`; only `refund` after
capture produces `refunded`. These names describe **synthetic server state**,
not provider evidence. A new selection is allowed only after failed/refunded.

Keys follow canonical payment-key validation and are scoped to the whole run.
Exact replay returns the immutable original response with `replayed: true`,
without another transition/audit event. Reusing a key with any different actor,
booking or payload fails. After a replay, GET supplies current state (an older
capture receipt does not undo a later refund). The run permits at most 200 new
commands; cleanup disables all further reads/commands.

## Source verification and next gate

Tests exercise actual loopback HTTP, default route absence, participant/run/
booking fences, canonical amounts, challenge/capture/decline/refund/replay,
unchanged clone booking and zero-resource cleanup. Import-graph checks reject
database/provider/network dependencies. Tool tests execute the release guard
before any build and validate capability/cleanup drift. These are local source
tests, not physical UI, deployment, provider or money evidence.

## Flutter and runner contract

The diagnostic clone booking card alone links to `Lokalen Zahlungstest öffnen`.
The page keeps the exact no-money/no-contract/no-payout notice outside its
scrollable body. Its only method is synthetic; scenarios come from the verified
server capability. No card/account/provider form exists. Selection, submit,
confirmation, refund and exact-command replay are followed by a fresh GET;
command receipts alone never replace the current status. Back/reopen or app
restart loads server state again; no client payment state is persisted.

Requests capture the authenticated session owner, recheck it before/after the
request and use only its locally stored token. Expired authentication fails
visibly; this lane does not use generic token refresh. The dedicated transport
allows only the exact loopback host/port and synthetic-clone path, never follows
redirects and never opens an external URL. Cleanup first verifies the run and
booking, then requires the server's cleaned marker and zero bookings, states,
commands and payment audit events.

When the private run manifest carries the enabled payment capability, the
existing local-QA physical runner now drives decline, challenge/capture, refund,
replay and back/reopen before continuing the clone handover. It reads the actual
payment audit and proves that the clone booking did not change during payment
testing. The owner later reads the refunded status after the existing role
restart. Final cleanup requires zero payment resources. Each action/status/
notice has a distinct diagnostic phase. None of this source work is a claim
that a device was executed.

Focused Flutter profile (synthetic only):

```sh
flutter test --no-pub \
  --dart-define=SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE=true \
  --dart-define=SIT_SYNTHETIC_CLONE_BOOKING_LANE=true \
  --dart-define=SIT_BACKEND_ENABLED=true \
  --dart-define=SIT_API_BASE_URL=http://127.0.0.1:18080/api/v1 \
  --dart-define=SIT_RELEASE_CHANNEL=internal \
  --dart-define=SIT_BUNDLE_ID=com.shareittoo.app.qa \
  test/synthetic_payment_test.dart
```

Run the same file without defines for the default-disabled case. Physical
execution remains a separate exact-candidate authorization/gate.
