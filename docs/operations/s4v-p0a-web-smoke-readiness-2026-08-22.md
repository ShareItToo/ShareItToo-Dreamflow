# S4V P0A Web smoke bound readiness

Status: locally verified, non-live.

## Canonical checks

From the repository root:

```sh
node --test test/tool/p0a_web_smoke_readiness.test.mjs
flutter build web --debug
bash scripts/p0a_web_smoke.sh
```

The focused contract must report three passes. The smoke must report a positive
OS-selected bound port and must validate `index.html`, `main.dart.js` and the
ShareItToo manifest over `127.0.0.1`.

## Acceptance and failure handling

Release-readiness evidence must use the default port selection. Do not reserve
port `18765`, add a startup sleep, retry a failed request, or accept a later
pass after an earlier failed invocation. `P0A_WEB_SMOKE_PORT` remains available
only when a deliberate diagnostic needs an exact loopback port; an invalid or
occupied value must fail closed.

The ten-second per-request timeout bounds a failed check. It must not trigger a
retry or fallback. Diagnose a failure as a missing build artifact, manifest
identity error, local bind failure or single-request serving failure, then
start a new explicitly recorded run after fixing the cause.

## Remaining boundary

Retain green exact-commit CI before closing `TD-RR-008`. This check does not
deploy, upload, sign, pay/refund or change production, Payment, Store,
Cloud/VPS/DNS or pilot state. P0B remains `HOLD` / `NO-GO`.
