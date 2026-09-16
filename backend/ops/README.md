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

## Optional Staging listing-AI activation

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
