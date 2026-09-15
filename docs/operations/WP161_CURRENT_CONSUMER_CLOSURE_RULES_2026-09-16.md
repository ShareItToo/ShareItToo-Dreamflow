# WP161 current-consumer closure rules

This package adds a fast, fail-closed current-consumer preflight before the
complete technical regression. Focused checks and the executable consumer
matrix run before one full gate. The complete source and evidence chain stays
local until it is ready, then is pushed once and followed by one event-driven
exact-HEAD CI wait. Raw logs stay local; handoffs report only decisive results,
run IDs and root failures.

## Fixed review-role matrix

- Luna executes with `gpt-5.6-luna` at `high`.
- Sol reviews and directs with `gpt-5.6-sol` at `xhigh`.
- Astra decides named money, contract, privacy, security, release-truth or
  user-data gates with `gpt-6-astra` at `max`.
- These bindings are fixed. A concrete task or thread settings entry that
  differs from this matrix is a configuration gate and must be reported
  exactly before work continues.

Historical evidence remains immutable. Current source manifests, migration
inventory/count/last-file assertions and current code-consumer tests are
validated together before any expensive build or full regression.
