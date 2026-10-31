# WP22 current-candidate notification delivery

## Outcome

WP22 is physically complete on the Pixel 7 Pro for the signed Internal Staging
candidate `1.0.0+2026090604`, source commit
`9ccd44e21fe572eaf0aa9687cbf035d27fda69bd`. The private archive is bound to
that commit, package and version; the upload signature, APK/AAB hashes and
binary privacy scan pass. A direct replace update preserves the original app
installation and data container and verifies the installed APK byte-for-byte.

The exact two-role journey passes owner creation and publication, durable
server and public-catalog confirmation, renter discovery, a non-binding
request and acceptance, role-specific simulation presentation, renter chat,
Account-A-to-B isolation and controlled FCM delivery while the app is in the
foreground, background and terminated-process states. The protected owner is
restored after the isolated booking is cancelled and the listing is ended.

The ShareItToo notification icon passed a private visual review. The capture
also contained unrelated personal device notifications, so it was deleted
immediately after review. Only its SHA-256 and the sanitized pass result remain
in evidence.

## Correction and cause

The first WP22 attempt on candidate `2026090603` proved successful FCM delivery
but failed closed because the freshly accepted request card did not appear on
the owner surface. The backend request was present. The owner screen delayed
all core request cards behind sequential handover/return and review lookups for
the complete historical request list. A large protected test account could
therefore make current truth look indefinitely unloaded.

Commit `9ccd44e21fe572eaf0aa9687cbf035d27fda69bd` renders exact core request
cards before optional enrichment, skips flow-time lookups for ineligible
terminal history and keeps optional enrichment failure from removing core
truth. Every async result is bound to the captured principal and session epoch;
an Account-A result is discarded after Account B becomes active. Initial
loading, remote failure and server-confirmed empty are separate UI states.
Unknown review truth remains conservative and cannot expose a duplicate review
action.

Focused regression proves progressive bounded hydration and the distinct,
principal-bound state model. The complete physical rerun then passes the exact
previous failure point. No timeout increase, fixed-delay success assumption,
reduced assertion or parallelism workaround was added.

## Verification and boundaries

The complete local candidate regression passes 2,315 tool tests, Flutter,
analyzer, Web/Wasm, loopback smoke and Android minSdk 24. Candidate Regression
run `34017389812` passes backend, PostgreSQL, Flutter and independent clean-
checkout reproducibility. Candidate CodeQL run `34017389777` also passes.

WP22 changes no backend source, so the already verified Staging backend at
commit `68c97a437969dc98f17eb151da3e006259ffbafa` remains compatible and no
deployment-only churn was introduced. Payment remains memory-only, Stripe live
mode is off, Listing AI remains mock-only with budget zero and external
execution remains off.

Sanitized machine-readable evidence is
`docs/evidence/release-readiness/wp22-current-candidate-notification-delivery-20260906.json`.
It contains no account identity, credential, token, fixture identifier, raw
device identifier, personal notification content or private filesystem path.

OnePlus, Google Play, Production, public registration, Stripe/live money,
external providers, Firebase Console, DNS and PR merge were not changed. PR #7
remains Draft and unmerged.
