# WP255 — synthetic clone full acceptance transport

`tool/run_staging_synthetic_booking.mjs diagnose-full-acceptance` keeps the
canonical default pointed at `https://staging.shareittoo.com/api/v1`. The
isolated clone lane may override transport only with both explicit flags:

```sh
node tool/run_staging_synthetic_booking.mjs diagnose-full-acceptance \
  --vault-file /private/path/accounts.json \
  --expected-runtime-commit <40-char-sha> \
  --isolated-test \
  --isolated-api-base-url http://127.0.0.1:<port>/v1
```

The override is fail-closed unless the URL is plain HTTP, has an explicit
loopback address (`127.0.0.1` or `::1`), an explicit port, and exactly the
`/v1` path used by the direct clone container. The `/version` gateway URL is
derived from that same origin. A copied vault may retain its canonical
`https://staging.shareittoo.com/api/v1` provenance; a rewritten private clone
vault may instead contain the exact loopback URL. Public HTTPS, non-loopback,
query-bearing, path-ambiguous, or unflagged overrides are rejected before the
first request. Payment and provider paths remain forbidden by the runner.

The isolated lane is synthetic technical evidence only. It does not seed or
alter canonical Green, does not relax the V5.2 legal fail-closed behavior, and
does not establish a legal, release, payment, or public-deployment claim.
