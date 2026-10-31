# Local-QA synthetic clone booking lane

The synthetic full-booking lane is compiled into the owner-only local-QA APK
only. `scripts/build_android_local_qa_candidate.sh` passes
`SIT_SYNTHETIC_CLONE_BOOKING_LANE=true`; release and Store candidates pass an
explicit `false` value and reject any attempt to set the flag otherwise.
The APK application ID is `com.shareittoo.app.qa`, so it can coexist with the
Play app `com.shareittoo.app`; this lane never replaces or uninstalls the Play
app. Its QA signing verification is not evidence of Play update compatibility:
the full certificate SHA-256 is copied only from authoritative
`apksigner verify --print-certs` output.

The local-QA archive manifest records the exact persistent notice
`Synthetischer Test – keine vertragliche oder finanzielle Wirkung` and requires
both synthetic roles, `owner` and `renter`. It also records the existing
negative boundaries: no Store upload, no AAB, no external provider call, no
API billing, and no payment mutation.

The local backend harness overrides ambient configuration before either backend
start and keeps the lane fail-closed: `MAIL_TRANSPORT=memory`,
`PUSH_TRANSPORT=memory`, `PAYMENT_TRANSPORT=memory`,
`IDENTITY_VERIFICATION_TRANSPORT=memory`, `STRIPE_LIVEMODE=false`,
`SIT_LISTING_AI_PROVIDER=mock`, `SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED=0`,
`FIREBASE_AUTH_ENABLED=false`, `FIREBASE_PHONE_VERIFICATION_ENABLED=false`,
`FIREBASE_CRASH_REPORT_DELETION_ENABLED=0`, `APPLE_REVOCATION_ENABLED=0`,
`TECHNICAL_SANDBOX_ENABLED=0`, and `TECHNICAL_SANDBOX_KILL_SWITCH=1`.
The API, PostgreSQL, and uploads remain run-scoped and loopback-only.

The build number is never inferred from an observed candidate. Every local-QA
build must receive explicit `SIT_INSTALLED_PLAY_BUILD_NUMBER`,
`SIT_LOCAL_QA_BUILD_NUMBER`, and `SIT_FINAL_PLAY_SUCCESSOR_BUILD_NUMBER`
values. The builder validates the strict numeric ordering before Flutter starts;
missing, malformed, equal, or inverted values fail closed. The invariant is:

```
installed Play < local QA < final Play successor
```

## Physical runner

After `tool/run_android_local_qa_backend.mjs` has written its owner-only
session manifest, the physical lane is driven by
`tool/run_android_local_qa_synthetic_clone_booking.mjs` with one authorized
phone:

```sh
SIT_ANDROID_DEVICE='<authorized-physical-serial>' \
node tool/run_android_local_qa_synthetic_clone_booking.mjs
```

The one-device path performs four real Android Photo Picker selections for
each segment, then enters the exact `shareittoo:v3:pickup:owner:...` payload
derived from the visible owner challenge into the diagnostic screen's
`QR-v3-Payload (manueller Clone-Fallback)` field. The server performs the
actual QR-v3 verification. It uses the exact six-digit fallback for return.
Evidence records `qrVerificationMode: "manual-payload"`; it never claims a
camera scan. A second physical display may be supplied through
`SIT_ANDROID_QR_DISPLAY_DEVICE` to select the camera path, which records
`qrVerificationMode: "camera"` instead.

The local-QA build is a debuggable APK for the loopback backend and is not a
Play or Store candidate. The installed Play version and final Play successor
are supplied by their respective external release gates; this document does
not hardcode either observed version.

## Local Web listing journey (payment lane off)

Build the Web client against the clone's loopback API before starting the
runner. The runner checks `build/web/main.dart.js` and refuses an artifact
that contains the production API origin or lacks the exact clone API literal.
Keep these flags with the run so the browser cannot silently fall back to
production. The clone's allowed listing city is `heilbronn`; the separate
Stage-A pilot identifier `heilbronn_wave0` is not a city-region code.

```sh
flutter build web --debug --no-pub --no-web-resources-cdn --pwa-strategy=none \
  --dart-define=SIT_BACKEND_ENABLED=true \
  --dart-define=SIT_API_BASE_URL=http://127.0.0.1:18080/api/v1 \
  --dart-define=SIT_RELEASE_CHANNEL=internal \
  --dart-define=SIT_BUNDLE_ID=com.shareittoo.app.qa \
  --dart-define=SIT_STAGE_A_NON_BINDING_PILOT=true \
  --dart-define=SIT_SYNTHETIC_CLONE_BOOKING_LANE=true \
  --dart-define=SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE=false

SIT_WEB_BUILD_DIR="$PWD/build/web" node tool/run_local_qa_web_clone.mjs
```

## Local Web runner with synthetic payment

`tool/run_local_qa_web_clone.mjs` serves only `http://127.0.0.1:18080`, uses an
ephemeral PostgreSQL database and defaults the payment diagnostic to off. The
opt-in is exact: `SIT_WEB_CLONE_SYNTHETIC_PAYMENT=1`. It maps only inside the
clone successor to `SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE=1`; any other value is
rejected before the runner creates a temporary directory. The backend repeats
the test/clone/loopback/memory/livemode-off/external-provider-off envelope before
database startup. Image screening, Technical Sandbox, Stripe and every external
provider remain disabled.

The matching Flutter artifact must be a debug build because the payment screen
rejects profile and release mode. Build and run it with matching explicit flags:

```sh
flutter build web --debug --no-pub \
  --dart-define=SIT_BACKEND_ENABLED=true \
  --dart-define=SIT_API_BASE_URL=http://127.0.0.1:18080/api/v1 \
  --dart-define=SIT_RELEASE_CHANNEL=internal \
  --dart-define=SIT_BUNDLE_ID=com.shareittoo.app.qa \
  --dart-define=SIT_STAGE_A_NON_BINDING_PILOT=true \
  --dart-define=SIT_SYNTHETIC_CLONE_BOOKING_LANE=true \
  --dart-define=SIT_LOCAL_QA_SYNTHETIC_PAYMENT_LANE=true

SIT_WEB_CLONE_SYNTHETIC_PAYMENT=1 \
SIT_WEB_BUILD_DIR="$PWD/build/web" \
node tool/run_local_qa_web_clone.mjs
```

The synthetic payment supports only the server-owned `challenge_then_capture`
and `decline` cases, with idempotent replay and synthetic refund. Its persistent
notice states that there is no real money, contract or payout. Shutdown invokes
the same bounded cleanup and requires zero payment states, commands and audit
events. Omitting the opt-in preserves the previous payment-disabled Web clone.
