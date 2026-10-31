# WP257-C public staging route — 2026-09-18

## Ergebnis

`staging.shareittoo.com` proxies now only the existing `/api` route to the
WP257 candidate in the canonical internal Green network. The Caddyfile itself
was unchanged and validated before reload; activation required only attaching
the Caddy container to the already existing internal Green network so the
existing `shareittoo-staging-api:8080` upstream could resolve. The attachment
and configuration are reversible. A protected Caddyfile backup is stored at
`/docker/shareittoo/backups/caddy/Caddyfile-before-wp257c-20260918T0405Z`.

The correct external health mapping is `/api/health/live`,
`/api/health/ready` and `/api/version`; product routes remain under
`/api/v1/*`. No host port was opened on the API container.

## External acceptance

HTTPS/TLS, live, ready and version returned `200`. Anonymous private auth
returned `401`; the exact synthetic catalog returned `200` with one configured
listing; the approved image returned `GET/HEAD 200`; an unapproved image
returned `404`. The allowlisted owner returned `200` for `auth/me` and
`listings/mine`; foreign, expired and revoked principals were denied (`403`,
`401`, `401`). Proxy spoofing without identity and anonymous upload mutation
returned `401`. Unknown registration returned `403`; invalid social onboarding
returned the held-provider `503` without account creation.

External action-token checks returned owner-live GET/POST `200`, foreign `403`,
expired/consumed/invalid `400`; all synthetic token rows were removed. The
API was restarted and Caddy reloaded; the route and health persisted. Database
counts remained `2|1|1|2|0`, the rollback container was absent, and no provider
traffic occurred.

The shared proxy-origin in-memory action limiter was respected during the
bounded acceptance runs; a controlled API restart was used to reset the test
window. This is test orchestration only, not a runtime prerequisite or release
proof.

## Grenzen

Payment remains `memory`, mail `disabled`, push `memory`, identity `disabled`,
Listing-AI external execution denied with budget `0`, and Stripe live mode is
false. Production, other hosts, DNS records, Store/Play, devices, Firebase,
provider accounts, payment, cloud/VPS data outside this staging route and PR
merge were not changed.

Machine-readable evidence is in
`docs/evidence/release-readiness/wp257-public-staging-route-20260918.json`.
