# WP260-D — Durable paid Listing-AI attempt and reservation

Status: **SOURCE PASS; external provider execution remains separately gated**

Commits `4e262a4f562c010d7e39c80ba618d7b36c76eb2b` and
`9ce5e97b7c7e286e60cb2b621328788dc5eabb19` add an owner-bound,
payload/image/consent/model-bound analysis attempt before any OpenAI egress.
The attempt has a persistent egress marker, a bounded per-attempt reservation,
an attempt-bound budget reservation row, and exactly-once success/unknown/fail
finalization. A lost or uncertain provider outcome is charged conservatively at
the full reserved maximum and written to the append-only ledger with nullable
billed cost; it cannot be retried automatically. A pre-egress failed attempt
can release and reclaim its reservation, while a stale reserved lease is
reclaimable only before an egress marker exists. Identical finalization
readback is idempotent; conflicting finalization fails closed.

The app now requires valid attempt prerequisites for the OpenAI provider and
passes the attempt ID through derivative screening and generation. The paid
ledger preserves estimated cost and nullable billed cost instead of fabricating
zero. Mock and on-device paths remain exact zero-cost.

## Verification

- Focused Listing-AI/provider/pipeline/store suites: 75 tests passed.
- PostgreSQL 16 local integration passed, including migration, owner-binding,
  attempt reservation, stale-lease reclaim, egress marker, unknown replay and
  duplicate-finalization checks, conservative unknown settlement and the
  attempt-bound provider reservation marker, plus foundation, foreign-key,
  identity and MFA suites.
- `node --check` for changed JavaScript and `git diff --check`: passed.
- No provider call, Stripe CLI authorization, live money, production, Store,
  Play, or device mutation occurred.

## Remaining boundary

The Stripe test-mode CLI permission and restricted test credential remain held
for Sol's explicit GO. A real provider run, its usage readback, and the final
signed app candidate are separate gates.
