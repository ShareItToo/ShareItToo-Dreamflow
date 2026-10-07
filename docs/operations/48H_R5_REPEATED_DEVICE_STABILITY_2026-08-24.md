# 48H R5 repeated device stability

Status: **COMPLETE — PHYSICAL, REGRESSION AND CODEQL VERIFIED**

R5 binds three different stability observations to implementation and device
candidate commit `8e31b19f1205088036b4f3f9755dbdca33246ef1`. They must not be
collapsed into one end-to-end or performance claim.

## Complete local backend repetitions

The dedicated runner completed 25 fresh PostgreSQL integrations. Every run
created a new PostgreSQL 16 cluster, started and stopped the local API, ran the
complete Blue Ocean mock-listing flow, cart/request, G3 same-owner grouping, G4
deterministic planning, G5 listing sets, publication replay and application
server restart scenarios, then stopped PostgreSQL and removed its temporary
cluster. All traffic was loopback, Listing AI was the deterministic mock with a
zero-cent budget, and no external provider or real-money operation occurred.

All 25 target flows passed without a child-process failure, unexpected target
5xx, state-restoration failure, data corruption, idempotency failure or
unexpected network target. Deliberate 503 responses elsewhere in the foundation
integration remain expected fail-closed gate tests and are not reclassified as
target-flow instability.

Repeated execution exposed two timestamp races. The real support progress
publication path now uses a strictly monotonic database expression. Three
direct support-case setup updates in the long integration use the same invariant
instead of transaction-stable `now()`. The runner also retains only bounded
child and PostgreSQL log tails on failure. No sleep, reduced repetition count,
parallelism switch or rate-limit bypass became a prerequisite.

The observed orchestration process duration and resource deltas are recorded in
the machine-readable evidence. They are trend observations only, not a
performance or memory-leak certification.

## Encrypted draft repetitions

Flutter completed 25 owner-bound save, restore and clear cycles plus the four
base recovery tests. Each restored draft retained its safe editable fields and
managed loopback image reference, while owner confirmations and the READY
fingerprint remained absent. No raw image bytes were stored and every cycle
ended with an empty recovery slot.

## Physical Pixel repetitions

Canonical local-QA build `1.0.0+2026082405` was installed over build
`1.0.0+2026082404` with a strictly newer, signature-matched, hash-verified
replace install. First-install and app-data identity remained unchanged. No
uninstall, downgrade, reset, login or account mutation occurred.

The Pixel 7 Pro then passed 25 serial force-stop/start cycles. Main navigation
returned every time. The per-process error-log observation found no crash, ANR,
uncaught Flutter error or unexpected URL host. Start times ranged from 1613 to
2105 ms. Total PSS ranged from 549194 to 555488 KiB; the last-five versus
first-five mean delta was 1473 KiB. Those values are bounded observations, not
a device performance or leak certificate.

The device run did not repeat the full Blue Ocean UI flow. It did not perform a
packet capture, alter network/accessibility settings, persist UI hierarchy or
screenshots, or inspect private media/account content. Complete Blue Ocean flow
repetition belongs to the local backend evidence; physical lifecycle repetition
belongs to the Pixel evidence.

## Current boundary

Focused R5 harness checks, five Flutter recovery tests, both privacy/retention
validators, the exact 25-run backend observation and exact 25-cycle Pixel
observation are green. The complete technical regression also passed in
candidate-rollover CI metadata mode, including Web/Wasm and the 448-task
Android debug build.

GitHub Regression run `32742156529` passed on exact head
`cb3735ec66f1190aec14f86d3817c43bd91bdb60`. PostgreSQL job
`97478929841`, Backend job `97478930152` and Flutter job `97478930292`
all passed. The explicit parallel-stability step and signed release-candidate
step were skipped. The backend API image was built inside CI, but publish job
`97481368883` was skipped; no registry or runtime changed. CodeQL workflow
`32742155112` and Advanced Security check `97479591110` passed, and the open
code-scanning alert query returned zero alerts.

The separate GitGuardian check `97478903904` remains failed for the already
documented 250-commit PR-history finding present before R5. No credential detail
was inspected, and that external historical check is not presented as green or
silently classified as an R5 regression.

R5 made no production, Cloud, Firebase, Payment, Store, VPS, DNS, pilot,
external-AI, API-billing, real-money, public-release or PR-merge change. The
next bounded package is `R6`.
