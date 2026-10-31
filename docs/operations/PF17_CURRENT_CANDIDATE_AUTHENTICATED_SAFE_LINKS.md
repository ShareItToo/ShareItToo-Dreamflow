# PF17 current-candidate authenticated safe links

Status: **EXACT-CANDIDATE READ-ONLY PASS — FIXTURE LINKS, STORE AND STAGE A HOLD / NO-GO**

Observed: 2026-08-23

PF17 upgrades the bounded PF10 safe-link evidence from the superseded direct
candidate `2026082301` to signed internal Staging candidate `2026082302`. The
runner accepts only the PF14B/PF16-bound private archive and installed APK. It
uses no credential vault, performs no login or logout and preserves the
existing authenticated session.

## Physical result

The Pixel showed the authenticated read-only notification surface before and
after the probes. A deliberately missing verified HTTPS listing reached the
bounded unavailable surface, an encoded path separator was rejected to the
ordinary authenticated start surface and Android did not associate the SIT
package with a foreign host.

The diagnostic returned the app to its launcher surface. An independent
post-check confirmed build `2026082302`, version `1.0.0`, font scale `0.85` and
unchanged disabled accessibility services. Transient UI hierarchies were
deleted and no content, identity, credential, token, raw device identifier,
network identifier or private path was retained.

## Retained boundaries

PF17 does not exercise authenticated fixture listing, booking or chat links,
create a booking, send a message, prove real push, use Google Play delivery,
perform manual TalkBack/visual review or close the functional/device matrix.
All eleven external gates remain open and Stage A remains `HOLD / NO-GO`.

## Validation

Four orchestrator tests, five evidence-validator tests and twenty aggregate
external-gate tests pass. The complete supported Mac-mini metadata gate passes
backend/PostgreSQL/tooling, 387 Flutter tests plus one documented skip,
Web/Wasm, loopback smoke, one 448-task Android build, binary minSdk 24 and the
fixed capacity budget with 12 KiB generated growth.

Package commit `a1e4297b2472be659dcba4489ac262c8854ed060` passed exact
GitHub regression `32649364967` and CodeQL `32649364974`.
