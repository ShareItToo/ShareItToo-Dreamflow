# WP260-A provider activation preflight — BLOCKED; no Green mutation

## Bound source and image

The exact source was committed and pushed on branch
`codex/master-workflow-20260808`:

- source: `727faf9148aee6ac9c4f7667f675f65b83e48719`
- temporary image: `shareittoo-api-wp260a:727faf9148aee6ac9c4f7667f675f65b83e48719`
- image digest: `sha256:b8ee9e99e109abc923017fa8838b2942f4e7dde1a3e1bb37aa56082cbe4e6e60`

The source adds a fail-closed Staging recipient gate for SMTP and FCM, with
worker-time user checks, exact allowed mailbox checks, and push token-hash
filtering. Focused source tests are 10/10 PASS; static allowlist wiring is 2/2
PASS; diff-check is PASS.

## Read-only Green inventory

The canonical Green container was still WP257 (`7887c7c…`), with
`MAIL_TRANSPORT=disabled`, `PUSH_TRANSPORT=memory` and `PAYMENT_TRANSPORT=memory`.
The notification outbox contained no pending/retry/processing rows. Existing
rows were historical `dead`, `sent` or `suppressed` rows for the allowlisted
synthetic cohort; no foreign pending delivery was found. One enabled Pixel
registration was observed, but its token was not retained in evidence.

## Safe activation attempt and blocker

A temporary container using the exact WP260-A image, the existing database,
uploads volume, MFA file mount and Green network was started without changing
the canonical container. The server source and database became available, but
SMTP verification on the Green network failed with `EAI_AGAIN` for
`smtp-relay.gmail.com`; `/health/ready` therefore remained `degraded` with
`database=ok` and `mail=error`. The temporary container was removed. The
canonical WP257 container, Caddy route, database, uploads and access gate were
not changed.

The Green host has no Firebase service-account file available at the expected
secret locations. Consequently FCM cannot be mounted or activated without an
owner-supplied supported credential file. No FCM traffic was attempted.

## Gate result

`WP260-A = BLOCKED_PRE_PROVIDER_ACTIVATION`.

No SMTP message, FCM notification, Firebase Auth/Phone activation, payment,
Store, Production, DNS or OnePlus action is claimed. The next safe action is to
resolve the Green-network DNS/SMTP path and provide the dedicated Staging FCM
service-account file through the existing secret gate; only then may a bounded
SMTP receipt and Pixel FCM shade/tap test run. Stripe/Identity remain separate
read-only gates.

Evidence: `docs/evidence/release-readiness/wp260-a-provider-activation-preflight-20260919.json`.
