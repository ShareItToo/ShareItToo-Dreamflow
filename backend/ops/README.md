# Release and production operations

## Immutable release identity

`build_release_image.sh` refuses a dirty worktree, resolves the full Git SHA,
uses the commit timestamp as deterministic build time and creates an API image
tagged with that exact SHA. The same version, commit and build timestamp are
stored as OCI image labels and are returned by `/version`, `/health`,
`/health/live` and `/health/ready`.

```sh
./ops/build_release_image.sh
```

`deploy_release.sh` deploys only an image whose revision label matches the
requested full commit. Staging and production use separate Compose files,
databases, volumes, secrets and upload storage. Production additionally
requires `CONFIRM_PRODUCTION_DEPLOY` to equal the exact commit and performs a
fresh backup before rollout.

```sh
./ops/deploy_release.sh staging FULL_40_CHARACTER_COMMIT

CONFIRM_PRODUCTION_DEPLOY=FULL_40_CHARACTER_COMMIT \
  ./ops/deploy_release.sh production FULL_40_CHARACTER_COMMIT
```

Each successful deployment writes a mode-`0600` JSON record under
`/docker/shareittoo/releases`. Rollback uses the same script with the previous
commit recorded in that release evidence; no floating `latest` image is used.

## Optional Staging MFA activation

MFA remains functionally unavailable until a stable 32-byte encryption key is
provided through the staging-only file overlay. Keep the key in an owner-only
regular file outside the repository (mode `0600`), never in Git, an environment
file, logs, chat or release evidence. Do not rotate this key by replacement:
existing TOTP ciphertext requires a separately reviewed versioned re-encryption
plan before rotation.

`ensure_mfa_staging_secret.mjs` first reuses and validates an existing file. It
can create a missing file only with an explicit exact-commit confirmation,
atomic `O_EXCL` creation and mode `0600`; it never overwrites or rotates an
existing key and never prints its value. For a root-created runtime key, set
`MFA_ENCRYPTION_KEY_RUNTIME_READABLE=1` so creation ends as `root:65532`/`0640`.
An existing owner-only key can be changed to that runtime form only through
`MFA_ENCRYPTION_KEY_PREPARE_RUNTIME=1` and a second exact confirmation; this
changes metadata only and preserves the inode and content. Re-running that
preparation is idempotent. The normal deploy gate does not create or prepare
keys.

```sh
ENABLE_STAGING_MFA=1 \
SIT_STAGING_PILOT_ID=heilbronn_wave0 \
CONFIRM_STAGING_MFA=FULL_40_CHARACTER_COMMIT \
MFA_ENCRYPTION_KEY_HOST_FILE=/absolute/private/path/mfa-encryption-key \
  ./ops/deploy_release.sh staging FULL_40_CHARACTER_COMMIT
```

The storage preflight validates owner-only `0600` permissions; the controlled
acceptance preflight requires runtime-readable `root:65532`/`0640`, bounded size
and strict 32-byte key shape. It never prints the key. The overlay clears the
direct environment value and mounts the file read-only as
`MFA_ENCRYPTION_KEY_FILE`. A successful health readback exposes only
`configured=true` and `credentialSource=file`; an authenticated synthetic
enroll/status/cancel test is still required before MFA is considered ready.
MFA is a durable encryption dependency: any recovery path retains this overlay
and the validated stable key file; it must not clear or drop the key, because
existing TOTP ciphertext would otherwise be undecryptable. After a forward
schema attempt, the deploy runbook does not boot the observed old image: it
isolates/stops the Staging API and records sanitized forward-recovery evidence
until a separately proven compatible recovery image exists. Database
migrations remain forward-applied. Before applying migrations `075-092`, take
a protected Staging database backup and pass an isolated restore or equivalent
forward-compatibility verification gate. The flag is staging-only and rejects
Production.

## Protected Staging forward-migration rehearsal

Before applying migrations `075-092` to the shared Staging database, run the
exact-target-bound rehearsal operation. It verifies the Compose project,
container and volume labels are Staging-only, repeats the `001-074`
`schema_migrations` readback, quiesces only running Staging API/mutating
services, proves there are no foreign database writers, and writes a non-empty
mode-`0600` custom-format dump plus checksum. That actual dump is restored into
an isolated pinned PostgreSQL 16 target; aggregate-only non-empty data checks,
forward migrations `075-092`, foreign-key integrity and focused contract probes
for refund recovery, command immutability, refund truth/rename compatibility,
legal holds, special-category intake, MFA and Identity must all pass.

```sh
SIT_STAGING_REHEARSAL_EXECUTE=1 \
SIT_STAGING_REHEARSAL_CONFIRM=FULL_40_CHARACTER_COMMIT \
SIT_STAGING_REHEARSAL_OPS_COMMIT=FULL_40_CHARACTER_OPS_COMMIT \
  node ops/staging_forward_migration_rehearsal.mjs FULL_40_CHARACTER_COMMIT
```

The operation never targets Production, never runs down migrations and removes
temporary restore containers/volumes, verifying their absence. It leaves every
service it quiesced stopped after both a successful rehearsal and a failure;
only a later controlled acceptance/release step may start the exact new API.
A `/health` result is not rollback compatibility proof.
After a forward migration begins, `deploy_release.sh` never boots the prior
unproven image: it stops the Staging API and records sanitized
`forward-recovery-required` evidence. A future recovery image must be bound to
this rehearsal by a separate reviewed gate. Database rollback is not automatic;
the protected backup and isolated restore/forward-compatibility result remain
required evidence.

## Controlled Staging acceptance and explicit promotion

## Green-only promotion and acceptance runner

The public Staging target is the verified Green runtime, not the historical
`sit-staging` database. `green_staging_promotion.mjs` is the single reusable
plan/validation boundary for this lane. Its protected target manifest must be
mode `0600` and bind exactly `shareittoo-staging-api`,
`sit-green-postgres-20260918011528-wp254`,
`sit-green-volume-20260918011528-wp254`,
`sit-green-network-20260918011528-wp254`,
`sit-staging-provider-egress` and
`sit-green-uploads-20260918011528-wp254`, with Green label and manifest-bound
source readback schema `92`. The current target is schema `95`; the isolated
and canonical readbacks must end at the exact
`095_staging_google_registration_replays.up.sql` migration.
The database identity is exactly `shareittoo_green` / `shareittoo_green`;
legacy `shareittoo_staging` is never used by this lane.
The source readback is exactly schema `92` with the manifest-bound ledger
digest `4199b60d7b3b19ed0cfeb113e121b77c23eeb03440f212a7dbe593c3cbee1db5`.
The pre-promotion image is exactly
`ghcr.io/shareittoo/shareittoo-api:ccc72004247d50656ac1064a758eb5f05c795e04`.
The observed API tuple includes user `shareittoo`, group `65532`, no host
port, the two approved networks, and exactly five mounts: writable uploads
plus read-only Firebase, MFA, technical-sandbox key and technical-sandbox
webhook mounts. The live readback must match the complete tuple.
Legacy `sit-staging`, production names, lookalike networks and mutable image
tags are rejected before a command is planned.

The plan takes a fresh protected backup, restores the manifest-bound Green
source readback `92` into a run-scoped internal target and explicitly migrates
it to current schema `95` through
`095_staging_google_registration_replays.up.sql`, then proves
the full source-to-current migration ledger (expected 95-row digest
`b31bd8054569f851a4fed0798fb0d8b971282256461e764529564cd14d2e802f`) and
integrity/functional probes there before provisioning the candidate. The exact
immutable runtime image is
accepted first against that isolated database on loopback `127.0.0.1:18082`
with memory Identity, on-device Listing AI, payment memory, the existing
access/provider configuration and read-only MFA/Firebase/technical-sandbox
mounts. The synthetic user `synthetic_sandbox_user_pilot_20260919` is
provisioned idempotently on the isolated target and, after isolated cleanup,
again on canonical Green using its protected password file; credentials never
enter commands, logs or evidence.

Promotion preserves the protected pre-state: `DEPLOYMENT_ENVIRONMENT=test`,
Firebase Auth and phone verification false, Google registration disabled,
allowlist empty/absent, access gate true, payment memory, and Stripe live mode
false. Only after the isolated candidate has passed and been cleaned up is the
observed Green API stopped and sealed. The canonical Green database is then
explicitly migrated from source readback `92` to current schema `95` through
`095_staging_google_registration_replays.up.sql` and read back before the
final image is created. If that canonical mutation starts, the sealed old image is never
restarted; recovery is a forward candidate path.

Only after live/ready `200`, MFA and Identity probes, successful run-scoped
cleanup and an explicit public readback may the final API be created without a
host port on both approved Green networks. The sealed old API is never booted
after migration. Evidence is external, mode `0600`, and contains only target,
runtime/Ops/image, backup and configuration digests plus sanitized readbacks.
The runner has no generic degraded-baseline exception and refuses to proceed
when cleanup or target/config preservation is uncertain.

Preparation is local/read-only until the separately authorized operational
gate is supplied; the target and config manifests stay outside Git:

```sh
GREEN_STAGING_TARGET_MANIFEST=/docker/shareittoo/ops/green-target.json \
GREEN_STAGING_CONFIG_MANIFEST=/docker/shareittoo/ops/green-config.json \
GREEN_STAGING_OPS_COMMIT=FULL_40_CHARACTER_OPS_COMMIT \
GREEN_STAGING_EVIDENCE_FILE=/docker/shareittoo/evidence/green-promotion.json \
GREEN_RUNTIME_IMAGE_DIGEST=sha256:IMMUTABLE_IMAGE_DIGEST \
GREEN_STAGING_PROMOTION_EXECUTE=1 \
GREEN_STAGING_PROMOTION_CONFIRM=FULL_40_CHARACTER_RUNTIME_COMMIT \
  node ops/green_staging_promotion.mjs FULL_40_CHARACTER_RUNTIME_COMMIT
```

The command never prints the protected env file, password, database URL or
provider keys. A failed inventory, backup, migration/probe, cleanup or public
readback aborts before the final container is created.

The shared Staging public port is never used as the acceptance target. The
The controlled candidate runs from the exact immutable image and isolated
database on the immediately preflighted free loopback port `18082`, while the reverse proxy remains bound
to the normal Staging port `18080`; a foreign listener is never stopped. The
controlled Compose file deliberately does not use `env_file`: only the selected
database/JWT values and the runtime-readable MFA key mount are interpolated.
Payment is hard-pinned to memory, Stripe live mode is false, Identity uses the
in-memory test transport and Listing AI is on-device.

The acceptance runner verifies the image label and `/version` commit, readiness,
an authenticated synthetic MFA enroll -> pending -> cancel flow, and that the
public Staging endpoint does not serve the candidate. It then writes only
owner-readable, external evidence. A normal `deploy_release.sh staging` call
fails closed until that evidence is bound to the exact runtime and Ops commits
and an explicit public-release confirmation is supplied. There is no automatic
promotion and no `df39` fallback.

```sh
SIT_STAGING_REHEARSAL_OPS_COMMIT=FULL_40_CHARACTER_OPS_COMMIT \
SIT_STAGING_CONTROLLED_ACCEPTANCE_EXECUTE=1 \
SIT_STAGING_ACCEPTANCE_CONFIRM=FULL_40_CHARACTER_COMMIT \
STAGING_ACCEPTANCE_PORT=18082 \
SIT_STAGING_PUBLIC_BASE_URL=https://staging.shareittoo.com \
SIT_STAGING_ACCEPTANCE_EVIDENCE_FILE=/absolute/private/path/acceptance.json \
MFA_ENCRYPTION_KEY_HOST_FILE=/absolute/private/path/mfa-encryption-key \
  node ops/staging_controlled_acceptance.mjs run FULL_40_CHARACTER_COMMIT

SIT_STAGING_REHEARSAL_OPS_COMMIT=FULL_40_CHARACTER_OPS_COMMIT \
SIT_STAGING_PUBLIC_BASE_URL=https://staging.shareittoo.com \
STAGING_ACCEPTANCE_PORT=18082 \
SIT_STAGING_ACCEPTANCE_EVIDENCE_FILE=/absolute/private/path/acceptance.json \
MFA_ENCRYPTION_KEY_HOST_FILE=/absolute/private/path/mfa-encryption-key \
  node ops/staging_controlled_acceptance.mjs verify FULL_40_CHARACTER_COMMIT
```

The preferred `run` mode performs start, readiness/MFA verification, complete
identity-bound cleanup and only then writes evidence; cleanup failure overrides
PASS. Standalone `verify` follows the same verify→cleanup→evidence ordering.
Only after the evidence is reviewed may the explicit `release` mode invoke the
guarded public Staging deploy. Historical attempts remain recorded in the
bound plan; this runbook does not erase or reinterpret them.

FCM is opt-in for staging and cannot be activated for production through this
path. Before the first FCM-enabled staging rollout, create only the dedicated
service account `sit-fcm-staging` with the Google role
`roles/firebasecloudmessaging.admin`. Place its JSON outside the repository
as `root:65532` with mode `0640`. Group `65532` is reserved for the non-login
staging runtime and is added only to the API container. Then run the same
immutable deploy command with the explicit staging-only gate:

```sh
ENABLE_STAGING_FCM=1 \
FIREBASE_PROJECT_ID=shareittoo-staging \
FIREBASE_SERVICE_ACCOUNT_HOST_FILE=/absolute/secret/path/firebase-service-account.json \
  ./ops/deploy_release.sh staging FULL_40_CHARACTER_COMMIT
```

The deploy script validates the credential file before invoking Compose,
adds `compose.staging.fcm.yml`, mounts the file read-only without creating a
missing host path, and records `stagingFcm=true` in the release evidence. The
same flag is rejected for production.

## Staging pilot listing-AI boundary

When `SIT_STAGING_PILOT_ID=heilbronn_wave0` is supplied to the public Staging
release, `compose.staging.pilot.yml` selects the reviewed on-device Listing AI
provider with zero budget and external execution disabled. This pilot path does
not require an OpenAI key and does not send image data to an external provider.
Do not set `ENABLE_STAGING_LISTING_AI=1` for that release; that flag is the
separate, explicitly approved external-provider override below.

## Optional Staging external listing-AI activation

The external listing-AI path remains disabled by default and Production cannot
enable it through `deploy_release.sh`. Before a separately approved Staging
activation, place one owner-created API project key outside the repository as
`root:65532` with mode `0640`. Do not put the key in an environment file,
command argument, Git, Drive, Flutter, chat or deployment evidence.

Activation requires the Heilbronn Wave-0 pilot, the reviewed pinned model, a
budget from 2 to 500 cents, the external-execution flag and a second
confirmation equal to the exact image commit:

```sh
ENABLE_STAGING_LISTING_AI=1 \
SIT_STAGING_PILOT_ID=heilbronn_wave0 \
CONFIRM_STAGING_LISTING_AI=FULL_40_CHARACTER_COMMIT \
SIT_LISTING_AI_MODEL=gpt-4o-mini-2024-07-18 \
SIT_LISTING_AI_BUDGET_CENTS=500 \
SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED=1 \
OPENAI_API_KEY_HOST_FILE=/absolute/private/path/openai-api-key \
  ./ops/deploy_release.sh staging FULL_40_CHARACTER_COMMIT
```

The gate validates only the private file's type, location, permissions, size
and credential shape, never prints its content, and mounts it read-only. The
runtime must report the exact enabled OpenAI boundary through `/health/ready`
before deployment is accepted. A failed activation rolls the prior image back
with the deterministic mock, so the new secret path cannot become a rollback
dependency. Release evidence records only `stagingListingAi=true` or `false`.
Provider billing/project creation and the first real image evaluation remain
separate owner actions; this procedure alone performs neither.

## Optional Staging Stripe test-mode activation

## Optional Staging technical Stripe Sandbox

The technical Sandbox is a separate, synthetic-only Checkout lane. It is
disabled by default and may be enabled only for the `heilbronn_wave0` Staging
pilot with `ENABLE_STAGING_TECHNICAL_SANDBOX=1`. It always keeps
`PAYMENT_TRANSPORT=memory` and clears the main `STRIPE_*` credentials; it must
not be combined with `ENABLE_STAGING_STRIPE=1`. The overlay does not touch
bookings, the payment ledger, payouts, Connect or notifications.

Prepare two distinct owner-controlled regular files outside the repository,
both mode `0600` and owned by the API runtime UID/GID (`100:101` for the
current Node image): one restricted `rk_test_...` key and one independent
`whsec_...` signing secret. Symlinks, live keys, reused files, permissive modes,
missing allowlisted synthetic IDs, a future/overlong/expired authorization or
Production are rejected without printing secret/account/authorization values.
The kill switch is `TECHNICAL_SANDBOX_KILL_SWITCH=1`; expiry disables only this
optional lane and does not prevent API startup.

```sh
ENABLE_STAGING_TECHNICAL_SANDBOX=1 \
SIT_STAGING_PILOT_ID=heilbronn_wave0 \
TECHNICAL_SANDBOX_SECRET_KEY_HOST_FILE=/absolute/private/path/technical-rk-test \
TECHNICAL_SANDBOX_WEBHOOK_SECRET_HOST_FILE=/absolute/private/path/technical-webhook-secret \
TECHNICAL_SANDBOX_ACCOUNT_ID=acct_... \
TECHNICAL_SANDBOX_USER_IDS=synthetic_sandbox_user_owner,synthetic_sandbox_user_renter \
TECHNICAL_SANDBOX_AUTHORIZATION_ID=owner-approved-id \
TECHNICAL_SANDBOX_AUTHORIZATION_ISSUED_AT=2026-09-19T09:00:00Z \
TECHNICAL_SANDBOX_AUTHORIZATION_EXPIRES_AT=2026-09-20T09:00:00Z \
  ./ops/deploy_release.sh staging FULL_40_CHARACTER_COMMIT
```

The deployment gate mounts only these two files read-only through
`compose.staging.technical-sandbox.yml`. `/health` and `/health/ready` expose
only the coarse `technicalSandbox` availability/provider/mode/amount/currency,
limit, review and synthetic-only fields. Readback must confirm the exact
coarse boundary. Before deployment the exact candidate image must declare
`USER shareittoo` and resolve `100:101` for the process, `/app` and
`/data/uploads`; the overlay deliberately has no numeric `user:` override.
Rollback removes the technical overlay and clears only its environment; the
main memory payment transport remains intact.

### Reproducible technical Sandbox pilot user

`ops/provision_synthetic_sandbox_user.mjs` provisions exactly
`synthetic_sandbox_user_pilot_20260919` with the matching
`@example.invalid` address. It is a staging-only, transactional database
operation against the exact `sit-staging` / `shareittoo_staging` identity; the
unit-test seam is an explicitly injected test database identity. Production,
other database names/users and missing compose identity fail before any write.
The account is visibly synthetic, has role `user`, status `active`, and records
email, terms/privacy, minimum-age and private-use acknowledgements. Only the
`users` row and that user's active `auth_sessions` are touched; no
notifications, listings, bookings or payment rows are created.

The password must already exist in an owner-controlled regular file outside the
repository, mode `0600`, owned by runtime `100:101`, with at least 32 random
characters. The tool never generates, prints, logs or returns the password (or
its password hash); it prints only the synthetic user id, a fixed email hash,
marker and sanitized readback. Reprovisioning locks the exact user key in the
transaction, renews its password hash, revokes only that user's existing
sessions, and fails closed on any foreign id/email collision.

```sh
DEPLOYMENT_ENVIRONMENT=staging \
SIT_STAGING_COMPOSE_PROJECT=sit-staging \
DATABASE_URL='postgres://shareittoo_staging:REDACTED@staging-db:5432/shareittoo_staging' \
SYNTHETIC_SANDBOX_PASSWORD_FILE=/absolute/private/path/sandbox-user-password \
  node ops/provision_synthetic_sandbox_user.mjs
```

The URL above is a shape-only example; credentials stay in the approved
runtime environment and the password file. The output is sanitized audit
evidence for the fixture id, marker, acknowledgement readback and session
revocation count, not a login credential or a claim of live provider activity.

Stripe remains on the in-memory provider unless an exact Staging deployment
explicitly enables the test-only override. Prepare three distinct secret files
outside the repository: one server-side Stripe test key and the independent
signing secrets for the snapshot and Accounts v2 thin-event destinations. Each
file must be a regular non-symlink file owned by root or the invoking operator
with mode `0600`, or `root:65532` with mode `0640`. Never place their values in
the environment file, command arguments, Git, Drive, Flutter, chat, logs or
release evidence.

```sh
ENABLE_STAGING_STRIPE=1 \
SIT_STAGING_PILOT_ID=heilbronn_wave0 \
CONFIRM_STAGING_STRIPE=FULL_40_CHARACTER_COMMIT \
STRIPE_SECRET_KEY_HOST_FILE=/absolute/private/path/stripe-secret-key \
STRIPE_WEBHOOK_SECRET_HOST_FILE=/absolute/private/path/stripe-webhook-secret \
STRIPE_CONNECT_WEBHOOK_SECRET_HOST_FILE=/absolute/private/path/stripe-connect-webhook-secret \
  ./ops/deploy_release.sh staging FULL_40_CHARACTER_COMMIT
```

The validator rejects live keys, missing or linked files, unsafe permissions,
repository-contained files, reused webhook secrets and non-test credentials
before Compose can start. The three files are mounted read-only, direct secret
environment values are cleared, and startup requires file-sourced credentials.
Post-deploy readback must identify Stripe, test mode, the reviewed API version,
EUR/DE and file credentials. A failed rollout removes the Stripe overlay and
rolls back with the payment transport on memory, so credentials cannot become
a rollback prerequisite. Sanitized release evidence records only
`stagingStripe=true` or `false`.

This command is not provider-account approval. Run it only after the intended
test platform, truthful business profile, owner terms, PSP legal/privacy facts,
two dashboard webhook destinations and rollback route are independently
verified. It cannot enable live money or Production and does not create Stripe
accounts, endpoints, payments, refunds or payouts.

## B7 messaging and account-erasure acceptance

`staging_b7_acceptance.mjs` creates three isolated staging accounts and proves
the complete booking/chat boundary: idempotent text and private image
messaging, participant-only original and thumbnail access, outsider denial,
report/block/unblock, notification preferences and deep-link fallbacks. It
also proves that an open moderation report blocks deletion before closing only
its own synthetic report and deleting the isolated accounts through the public
account API.

For the strongest image-erasure proof, mount the staging upload volume
read-only into the acceptance runner and set `ACCEPTANCE_UPLOAD_DIR`. The test
then requires both the generated full-size image and thumbnail to exist before
deletion and to disappear from both PostgreSQL and the upload filesystem after
deletion. `ACCEPTANCE_CLIENT_IP`, when used, must be a unique address from the
reserved `198.51.100.0/24` documentation range so repeated isolated runs do not
share the sensitive-action rate-limit counter. It does not weaken or bypass
the limiter.

```sh
ACCEPTANCE_BASE_URL=http://shareittoo-staging-api:8080/v1 \
ACCEPTANCE_PUSH_TRANSPORT=fcm \
ACCEPTANCE_UPLOAD_DIR=/data/uploads \
ACCEPTANCE_CLIENT_IP=198.51.100.249 \
  node ops/staging_b7_acceptance.mjs
```

## Backups and restore proof

`backup.sh` writes a PostgreSQL custom-format dump, an upload archive and a
SHA-256 manifest to `/docker/shareittoo/backups/daily`. Files are mode `0600`
and retained for 14 days. Before every staging or production deployment,
`check_foreign_key_integrity.sh` evaluates every application foreign-key
constraint from a repeatable, read-only database snapshot. It reports only
table, constraint and aggregate orphan counts, never row values or IDs, and
fails closed before the deployment changes any runtime state when an
inconsistency exists.

`verify_restore.sh` verifies the manifest and archive, starts a temporary
PostgreSQL container backed by a temporary volume, restores the dump, checks
that public tables exist, extracts the upload archive into a temporary
directory and removes every temporary resource. It never connects to or
modifies the production database. Successful checks are recorded under
`/docker/shareittoo/backups/restore-checks`.

## Monitoring

`healthcheck.sh` checks the public site and API, database/mail status, the
three ShareItToo containers, disk usage and backup freshness. Failures are
recorded by systemd and are visible with:

```sh
systemctl status shareittoo-health.service
journalctl -u shareittoo-health.service
```

The health, backup and restore-check services call `shareittoo-alert@.service`
on failure. `alert.sh` uses the already configured SMTP transport to deliver a
critical notification to `ALERT_EMAIL_TO` (default:
`contact@shareittoo.com`). It keeps SMTP credentials out of process arguments
and suppresses repeat alerts for the same service for one hour by default.

After the first version-labelled rollout and successful isolated restore, set
`REQUIRE_RELEASE_IDENTITY=true` and `REQUIRE_RECENT_RESTORE_CHECK=true` in the
production `.env`. The health service will then also reject an unknown runtime
commit or a restore proof older than roughly eight days.

Install the included units in `/etc/systemd/system`, reload systemd, run the
backup, health and restore-check services once, then enable all three timers.

```sh
install -m 0750 ops/alert.sh /docker/shareittoo/backend/ops/alert.sh
install -m 0644 ops/systemd/shareittoo-*.service /etc/systemd/system/
install -m 0644 ops/systemd/shareittoo-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl start shareittoo-backup.service
systemctl start shareittoo-restore-check.service
systemctl start shareittoo-health.service
systemctl enable --now shareittoo-backup.timer shareittoo-restore-check.timer shareittoo-health.timer
systemctl list-timers 'shareittoo-*'
```

## B10 quality and load acceptance

`staging_b10_acceptance.mjs` creates two isolated staging accounts and one
isolated booking. It verifies correlation IDs, CORS denial, security headers,
the authenticated non-cacheable data export and its audit entry. It then
measures bounded parallel probes for liveness, search/feed, processed images,
chat, bookings and invalid webhook rejection. Every probe has an explicit p95
threshold and must remain below the general rate limit. Test accounts and the
listing are closed again before the script exits; the `finally` guard also
closes active test state after a failed assertion.

Run it only against isolated staging with the staging database environment:

```sh
ACCEPTANCE_BASE_URL=http://127.0.0.1:8080/v1 \
  node ops/staging_b10_acceptance.mjs
```
