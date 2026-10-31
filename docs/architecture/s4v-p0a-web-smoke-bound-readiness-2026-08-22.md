# S4V P0A Web smoke bound readiness - architecture

Status: locally verified on 22.08.2026 at implementation commit `1d6aeda`.
This is a non-live release-readiness package for `TD-RR-008`; it changes no
application behavior, production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Timing and port workarounds removed

The P0A Web smoke previously started `python3 -m http.server` on fixed port
`18765`, then attempted the index request up to twenty times with a fixed
`sleep 0.1`. A green result therefore depended on timing retries and on one
machine-wide port remaining unused. Neither dependency is acceptable release
evidence.

S4V moves the server and client contract into the repository-owned
`tool/run_p0a_web_smoke.py`. The default invocation asks the operating system
for a free loopback port. `ThreadingHTTPServer` binds and starts listening
synchronously before its serving thread starts, so there is no readiness race
to poll. The tool then makes exactly one request for each required artifact:
`index.html`, `main.dart.js` and `manifest.json`.

The ten-second request timeout is a fail-closed upper bound, not a recovery
path: a missed response fails the invocation immediately and is never rerun.
Server shutdown and thread joining occur in `finally`. An explicitly supplied
occupied or invalid port also fails instead of selecting a fallback behind the
caller's back.

## Deterministic contract

The committed wiring test proves all of the following:

1. the shell entrypoint defaults to OS-selected port `0`;
2. the helper binds only `127.0.0.1` before starting the requests;
3. every required artifact is fetched once;
4. the real fixture succeeds and reports the actual bound port;
5. a non-SIT manifest fails closed; and
6. neither implementation contains sleep, retry, curl polling or the old fixed
   port.

Python remains the same normal local dependency already used by the prior
smoke. No copied runtime, remote service or paid dependency was introduced.

## Local evidence and remaining boundary

The three focused tests passed. The exact implementation commit
`1d6aeda04a272648ae5fdea98f7b8a94f5a85a9f` passed the complete local technical
gate in the documented CI-metadata-only mode: analyzer baseline 220, 379
Flutter tests plus one documented skip, Google-only, current-source Web build,
the new bound loopback smoke and Android debug all passed. Five additional
consecutive real smoke invocations each bound a distinct OS-selected port and
passed; general SIT temp roots remained zero.

This implements the local deterministic portion of `TD-RR-008`. Formal closure
still requires retained green exact-commit CI using the same one-request
contract. Local metadata mode is not actual CI, Store or device evidence. P0B
remains `HOLD` / `NO-GO`.
