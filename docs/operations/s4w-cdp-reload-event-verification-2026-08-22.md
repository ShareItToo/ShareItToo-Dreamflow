# S4W CDP reload event verification

Status: locally verified, non-live.

## Canonical automated checks

From the repository root:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 test/tool/seed_booking_qa_cdp_event_test.py
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 bash scripts/technical_regression_check.sh
```

The focused command must report four passes. The complete local command uses
the documented CI-metadata-only path because the historical candidate artifact
is absent; it is not actual CI, Store or device evidence.

## Controlled local-browser observation

Only in a dedicated local Flutter-Web QA profile, start Chrome with its intended
local debugging port and use the documented seed command. The default `--apply`
path must:

1. back up the targeted localStorage keys;
2. write the synthetic payload;
3. reload the exact guarded main-frame loader through CDP;
4. observe the new main-frame `load` lifecycle event; and
5. report `readyState: complete` and the verified key count without echoing
   stored values.

Do not perform this observation in a normal user profile. `--no-reload` is an
explicit diagnostic mode and cannot prove the reload boundary.

## Failure handling and boundaries

Keep a failed run failed. Do not add a sleep, JavaScript timer, reconnect loop,
event retry or accept a later run as proof for the failed one. Diagnose the CDP
target, loader identity, WebSocket framing or named mismatched keys, then start
a new separately recorded run after correction.

The controlled browser observation remains open under `TD-RR-009`. It must not
touch production, Payment, Store, Cloud/VPS/DNS or pilot state. P0B remains
`HOLD` / `NO-GO`.
