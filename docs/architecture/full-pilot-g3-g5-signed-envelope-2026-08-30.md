# Full Pilot G3-G5 Signed Internal Envelope

Date: 2026-08-30
Status: accepted for the closed pilot; public and Production activation remain prohibited

## Decision

G3 same-owner multi-item, G4 deterministic project planning and G5 supply
enrichment/listing sets may run from a release build only when all parts of the
exact `heilbronn_wave0` envelope are present at compile time:

- Stage-A non-binding pilot and Blue-Ocean listing assistant enabled;
- release channel `internal`;
- API base `https://staging.shareittoo.com/api/v1`;
- the individual G3-G5 technical surface enabled;
- every public, external-generative-AI, Business-ranking and real-payment
  capability disabled.

An ordinary development build retains the existing technical test paths. A
release build outside the complete envelope remains fail-closed. The archive
validator records and checks every envelope field before an artifact can become
an Internal candidate.

## Product and security boundaries

- G4 templates are a deterministic server catalog. Resolution uses current
  inventory and quote previews and creates no reservation, booking, contract or
  payment.
- Adding a planner variant to the rental cart revalidates the exact inventory
  snapshot and parses a strict server receipt.
- G5 listing sets contain individually bookable listings. Their totals are
  informative, and unavailable members are never silently presented as an
  available complete set.
- Every new client operation captures the authenticated owner and action epoch,
  rechecks it before and after remote work, and suppresses late Account-A
  results after a switch to Account B.
- Backend errors never become an empty-success state. Mutation transport errors
  are presented as outcome unknown and require a server-truth refresh before a
  retry.

## Staging and CI

The staging overlay enables only the closed pilot modes, mock listing AI,
zero-cent provider budget, and in-memory mail/push transports. Production is
explicitly rejected. Publishing an API image is manual and depends on backend,
PostgreSQL, clean-checkout and Flutter regression jobs.

The local proof command is:

```text
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 bash scripts/technical_regression_check.sh
```

It passed on 2026-08-30, including analyzer zero, Web/Wasm, loopback smoke and
Android debug build. Exact-commit GitHub Regression and CodeQL evidence is
recorded only after the implementation commit is pushed.

## Ratchet refresh

The implementation changes shared configuration, repository, UI, validator and
test sources already covered by RW0-RW20 source inventories. Their SHA-256
entries, plus the privacy/retention/provider evidence bindings that transitively
reference those inventories, were mechanically recomputed from repository
bytes. No evidence status, legal approval, provider decision, owner-decision
count, live gate or external-readiness claim was changed. All package validators
and the complete regression had to pass again after the refresh.
