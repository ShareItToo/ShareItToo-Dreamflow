# WP68 — Staging Support Lifecycle

Status: **COMPLETE ON STAGING, LOCALLY AND GITHUB**.

## Purpose and exact binding

WP68 proves one real Staging support lifecycle without involving an existing
user, external delivery, money, a production system or a binding legal path.
It is bound to source commit `f34571371c55d0cf88e9b33f180f69eebc635e7e`, the
exact Staging image `shareittoo-api:78c663248aec089b08d19fd0fb40a9a63f19408b`
and Android candidate `com.shareittoo.app` `1.0.0+2026090904`.

The runner accepts only the literal Staging API URL and SSH host, the expected
container image, and the explicit local execution gate. It refuses every other
target before any account or case mutation.

## Proven Staging lifecycle

Three new, non-routable temporary identities were created only for the run:
one reporter and two separate administrators. The reporter opened one
simulation-only general-help case. The first administrator drafted a yellow
progress update; the second administrator independently approved the exact
rendered message; the first administrator published it. The reporter then read
back the authenticated in-app result. The published update retained a future
next-update deadline and asserted `externalMessageSent=false`.

The runner then revoked all refresh tokens, staff elevations and application
sessions for the three temporary identities, reset their password material,
removed their elevated roles, closed their accounts and deleted the owner-only
local credential vault. The simulation case and append-only audit entries stay
retained as controlled Staging evidence. Existing Support cases were not
selected or modified.

## Compatibility correction

The first execution attempt stopped before database work because the active
remote Node runtime rejects a numeric file descriptor in `fs/promises.readFile`.
Commit `f34571371c55d0cf88e9b33f180f69eebc635e7e` switches both remote scripts
to the supported asynchronous standard-input stream and adds a regression that
rejects the incompatible pattern. No temporary account or support case existed
after that failed attempt; its local vault was removed. The corrected run is
the only recorded WP68 lifecycle result.

## Boundaries and remaining risk

No production, real user, existing Support case, external e-mail or message,
payment, real money, Google Play, Firebase, external AI, provider, DNS or
pull-request state changed. The known historical noncritical Support deadlines
remain separate from this new controlled simulation and are not hidden by it.
V5.2 binding return/damage remains fail-closed pending professionally approved
immutable legal snapshots.

Machine-readable evidence:
`docs/evidence/release-readiness/wp68-staging-support-lifecycle-20260909.json`.
GitHub Regression `34328892643` and CodeQL `34328892603` both pass on the
evidence commit `b10528a15e4061dc528087d41297976f07bef3e0`; the current
PR-merge Code Scanning result has zero open alerts (historic entries are fixed
or dismissed). PR #7 remains Draft, open, clean and unmerged.
