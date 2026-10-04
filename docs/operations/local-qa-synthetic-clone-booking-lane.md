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
