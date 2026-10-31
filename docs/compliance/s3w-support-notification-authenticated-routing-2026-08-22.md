# S3W support notification and authenticated routing - technical compliance record

Status: locally and CI-verified non-live implementation on 22.08.2026 at exact
commit `452575c1c06aaf2502573fb1bf7d95724c9b024d`. GitHub regression run
`32559993743` passed for PR merge snapshot
`5f60270857e8417b59ed9a5b5b4a777f72128ad2`. This is technical evidence, not
a claim that FCM, Store or production delivery ran.

## Matrix result

- `SUP-138`: a published support update schedules a generic Push and opens the
  authenticated notification feed before any case detail is requested.
- `SUP-139`: the Push contract has no address field or content-bearing input.
- `SUP-140`: the Push contract has no amount, damage or support-message field.
- `SUP-141`: a no-longer-authorized or unavailable case renders a generic
  fallback without case ID, cached detail or backend error text.
- `SUP-142`: duplicate evaluation uses the same deterministic event key; the
  unique outbox constraint permits only one row per recipient and channel.

## Enforced controls

- Support messages notify only after `message.published`; draft and review
  events remain internal.
- Recipient membership is rechecked against the canonical support case before
  scheduling.
- In-app and Push are separate outbox rows. Only the in-app record contains the
  opaque entity ID; the Push sender receives only `support_case_update`.
- FCM data remains exactly the two-field V5.2 contract and routes to the
  identifier-free notification inbox.
- The neutral title was broadened from booking-specific wording to
  `Neue ShareItToo-Aktualisierung`; it discloses neither support involvement
  nor the update type on the lock screen.
- Detail is fetched after authentication through the existing user-bound
  support endpoint and exact identity is checked again in Flutter.
- A failed or denied detail request is indistinguishable in the UI from an
  unavailable case.
- Push transport remains disabled in routine tests; no provider traffic is
  allowed by this package.

## Verification observed so far

- 24 focused Backend/domain/push/wiring tests passed.
- 44 focused Flutter Firebase, app-link, foreground-Push and support-case tests
  passed.
- Changed Dart analysis passes after preserving the accepted repository
  baseline.
- Privacy and Retention validators pass with the new source and hashes.
- Complete Backend unit suite: 492 passed, zero failed and one intentional
  PostgreSQL-environment skip.
- Complete local technical regression: accepted 220-issue analyzer baseline,
  365 Flutter tests passed with one documented Google-profile skip, the
  separate Google-only profile test passed, Web build/loopback smoke passed
  and Android debug APK built.
- Exact GitHub CI: 493 Backend/PostgreSQL tests passed without skips; the
  accepted 220-issue analyzer baseline, 365 Flutter tests with one documented
  skip, separate Google-only test, Web build/loopback smoke and Android debug
  APK all passed again.
- GitGuardian passed. The signed candidate and API-image publication jobs were
  skipped; the Backend job built an unpublished commit-labelled CI image only.

No live FCM send, production/VPS/Cloud/DNS mutation, Store action, real-money
operation, signed build, deployment, PR merge or external user communication
was performed.
