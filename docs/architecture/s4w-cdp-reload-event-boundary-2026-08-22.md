# S4W CDP reload event boundary - architecture

Status: locally verified on 22.08.2026 at implementation commit `8bc4fed`.
This is a non-live local-QA/release-readiness package for `TD-RR-009`; it
changes no application behavior, production, Payment, Store, Cloud/VPS/DNS or
pilot state.

## Blind reload timing removed

The local booking-QA seed tool previously scheduled `location.reload()` after
50 milliseconds, closed its Chrome DevTools Protocol connection, slept for two
seconds, reconnected and printed a localStorage snapshot. That sequence could
pass or fail according to host/browser timing and did not fail when stored
values differed from the intended seed.

S4W keeps one CDP target connection and uses the Page domain's navigation
contract:

1. enable Page lifecycle events;
2. read the current main-frame ID and loader ID from `Page.getFrameTree`;
3. write the exact localStorage payload without scheduling JavaScript work;
4. call `Page.reload` with the prior loader ID, so CDP refuses a racing or
   unintended target;
5. accept only the main frame's `Page.lifecycleEvent` named `load` with a new,
   non-empty loader ID; and
6. verify `document.readyState == complete` and exact localStorage equality.

CDP events that arrive before their command response are queued instead of
discarded. WebSocket reads now assemble exact frame lengths so split socket
reads cannot corrupt the event stream. The ten-second socket deadline fails
closed and never triggers a retry, reconnect or pass-on-rerun path.

The post-reload success output reports only readiness and the number of verified
keys. It does not echo stored values. Ephemeral local QA credentials retain
their documented one-time output because the local tester needs them for the
two synthetic personas.

The protocol design follows the official Page-domain contract for
`Page.reload`, `Page.getFrameTree`, `Page.setLifecycleEventsEnabled` and
`Page.lifecycleEvent`:

- <https://chromedevtools.github.io/devtools-protocol/tot/Page/>

## Deterministic evidence and remaining boundary

Four committed tests feed one-byte-fragmented WebSocket data, prove preservation
of an early correlated lifecycle event, validate value-free success output and
fail closed on a storage mismatch. They also reject both old timing calls in
source. The complete clean implementation-head local metadata gate passed at
`8bc4feddc4fed87c4614c1c20df0776dfec04571` with analyzer baseline 220, 379
Flutter tests plus one documented skip, Google-only, Web build/smoke and Android
debug. Five additional consecutive focused runs passed; Python cache and SIT
temp-root counts remained zero.

No real browser seed was applied during automated verification, so no local QA
or user state changed. The local deterministic portion of `TD-RR-009` is
implemented. Formal closure still requires retained exact-commit CI for the
protocol tests and one separately controlled local-browser observation without
sleep/retry. P0B remains `HOLD` / `NO-GO`.
