# WP165 — Staging readiness drift

Status: **BLOCKED ONLY BY ONE NONCRITICAL SUPPORT FOLLOW-UP.**

The read-only public Staging readback on 16 September reports runtime
`df39a14b7a19afe467842461a28f1e77fec8445e`, `/api/version` HTTP 200 and
`/api/health/live` HTTP 200. Database and mail are healthy; notification queues
are empty; payments remain memory-only with Stripe live mode false; Listing AI
is on-device with external execution disabled and zero budget.

`/api/health/ready` returns HTTP 503 because exactly one noncritical Support
next-update is overdue. There is no overdue critical or privacy deadline and no
P0 case without an owner. This is an operational readiness condition, not a
client-install or database failure.

The correct repair is the established authorized Support workflow: issue a
truthful bounded progress update and set a future checkpoint, then re-read the
readiness endpoint. Direct database edits, deletion of history, recipient
reactivation or an unverified claim of readiness are prohibited. No remote
mutation was made in WP165.

Machine-readable evidence:
`docs/evidence/release-readiness/wp165-staging-readiness-drift-20260916.json`.
