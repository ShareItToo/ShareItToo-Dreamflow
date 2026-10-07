# WP134 — Exact-current Staging support lifecycle

Status: **COMPLETE ON ISOLATED STAGING SIMULATION**.

## Binding and result

WP134 binds the signed Internal/Staging Android candidate
`com.shareittoo.app` `1.0.0+2026091309` to source
`abf911d1c944a4e5874269111985d0cc4736546e`, its verified APK/AAB and upload
certificate, and the healthy immutable Staging Backend image
`ghcr.io/shareittoo/shareittoo-api:df39a14b7a19afe467842461a28f1e77fec8445e`.

One new simulation-only reporter opened one general-help case. A first
temporary administrator drafted a progress update, a distinct second
administrator approved its exact rendered content, and the first administrator
published it. The reporter read back the published result through the
authenticated Support API. The update has a future next-update time and sent
no external message.

All three temporary accounts, sessions, refresh tokens and staff elevations
were revoked or closed. Their owner-only credential vault was deleted. The
simulation case and append-only audit history remain; the runner never selected
or modified an existing Support case.

## Post-run truth and remaining gate

After cleanup the API was live, the container stayed healthy with zero
restarts, database and mail were healthy, and the notification queue remained
empty. Readiness remains degraded solely by three noncritical historical
Support follow-ups; there is no overdue critical update and no P0 case without
an owner. Those historical records remain the separate staff-recovery gate and
are not hidden by this simulation.

This promotes `staging-support-simulation-lifecycle` to PASS. The conservative
portfolio is **18 PASS / 6 PARTIAL / 8 OPEN**.

No Production, real user, external e-mail/message, Payment, real money, Google
Play, Firebase, OnePlus or PR-merge state changed. Machine-readable evidence:
`docs/evidence/release-readiness/wp134-current-candidate-staging-support-20260913.json`.
