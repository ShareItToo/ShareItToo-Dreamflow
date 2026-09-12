# 48H R8 bounded concurrency and race testing

Status: **VERIFIED — LOCAL REGRESSION, GITHUB REGRESSION AND CODEQL GREEN**

R8 exercises 120 repository-owned synthetic accounts with at most 24
concurrent workers against an ephemeral loopback application and PostgreSQL 16
cluster. It covers all 13 requested paths and is explicitly a bounded local
correctness observation, not a production capacity or performance claim.

## Red-first finding and permanent correction

Two concurrent standard owner listing edits carrying the same baseline state
both returned HTTP 200. The write incremented the server revision but did not
compare it with a client-observed revision, allowing a silent lost update.

The owner API now returns the server-owned `catalogRevision`. A full listing
edit must submit an exact positive revision and the update uses an atomic
owner-, moderation- and revision-bound compare-and-swap. One concurrent writer
wins and receives the next revision; the stale writer receives HTTP 409 with
`listing_revision_conflict`. The Flutter owner edit path round-trips the token
and persists authoritative server responses for both full and status updates.

## Retained matrix

The retained run covers concurrent cart item upserts, full listing edits,
duplicate Blue-Ocean publication, competing booking acceptance, stale G3 quote
consent, concurrent G3 request idempotency, G4 cart recheck, G5 per-item
availability drift, support-case creation, single-use password recovery,
privacy export and deletion preflight. Exactly 120 cart and support records stay
account-bound; 12 concurrent privacy exports contain only each subject's own
records. G5 resolution remains preview-only and requires request-time
revalidation without reservation or payment creation.

The final run reports zero double bookings, double publication, duplicate money
state, lost updates, cross-account leakage, deadlocks, rollback defects,
idempotency defects and stale-state acceptance. PostgreSQL and its temporary
files were removed and no synthetic credential was retained.

## Workaround audit and limits

An intermediate source-rotation attempt was rejected by the existing rate-limit
isolation regression before completion. The retained test does not rotate
client source addresses. It gives the HTTP cohort a fresh loopback server
window and executes support creation and privacy export through their actual
production domain transactions. Thus transactional concurrency and isolation
are tested, while those two paths are not claimed as full request-stack load
tests. No timing allowance, reduced parallelism, persistent prerequisite or
release workaround remains.

The bounded runner, two runner tests, two rate-limit isolation tests, fresh
PostgreSQL integration, Backend suite (746 passes and one documented
PostgreSQL skip), five targeted Flutter catalog tests and analyzer-zero gate
pass at implementation head
`74daf0a462a240649a647c5b9c00e5568c5af3ed`. The complete candidate-rollover
technical regression is also green in CI-metadata mode: analyzer zero, 393
Flutter passes plus one documented skip, separate Google-only profile, Web/Wasm,
loopback smoke and the 448-task Android debug build all pass. Exact verified
head `f4b69d6ae56d75acdcccf568aec2ba1de3915c45` passed GitHub Regression
`32752535433`, CodeQL workflow `32752535527` and Advanced Security check
`97513141931`, with zero open PR code-scanning alerts. The API image was built
but not published; explicit parallel stability and signed-candidate creation
were not requested. The separate GitGuardian failure remains the documented
pre-existing 250-commit PR-history finding; no credential detail was inspected.
No external provider, real person, real money, Production, Cloud, Firebase,
Payment, Store, VPS, DNS, pilot activation, public release or PR merge is part
of R8. R8 is closed and the next package is `R9`.
