# S3B canonical support intake receipt - technical compliance record

Status: verified non-live implementation, fail-closed.

Exact commit: `0185b2a0f05f6181f8975a48a4f96d0811681e8b`.
Exact successful GitHub Actions run: `32503031376`.

## Bound source and scope

This package addresses Drive Support Test Matrix scenario `SUP-016` and uses
the confirmed-state boundaries of message template `T-001` version `1.0.0` in
packet `SIT_SUPPORT_PACKET_V1_2026-08-20`.

It connects the existing Flutter support intake to the authenticated
`POST /v1/support/cases` route. The route remains hard-coded to `simulation`;
the package does not activate an external support adapter, production support,
payment, refund, payout or account action.

## Implemented controls

- Every visible intake category and subcategory maps deterministically to the
  server taxonomy. Unknown mappings fail closed before a request is sent.
- Immediate danger overrides the ordinary category and submits the existing
  versioned `trust_safety/immediate_physical_danger` route.
- Booking and listing links are included only for the matching real context;
  synthetic profile references are not sent as linked database entities.
- The client uses one stable, opaque idempotency key for all retries from the
  same open intake. A lost response therefore cannot create a second case.
- The flow returns and opens the local support thread only after a valid
  server receipt confirms `received`, `simulation`, a SIT Case ID, the exact
  next-update instant and `Europe/Berlin` display.
- Missing, malformed, live-mode or otherwise unconfirmed receipts keep the
  intake open and explicitly state that no local replacement case is being
  represented as real.
- The confirmation shows only confirmed facts: Case ID, received status,
  server-computed next update, open-outcome wording and the non-live boundary.
- The existing debug path no longer logs support free text, user IDs, thread
  IDs or case-context payloads.
- The PostgreSQL integration path verifies authenticated creation, replay,
  user listing, no-store response headers and sanitized creation audit.

## Verification

- Focused Flutter safety, mapping, receipt and submission tests: 8 passed,
  zero failed.
- Focused support-domain and support-workflow tests: 32 passed, zero failed.
- Full Backend: 391 passed, zero failed and one expected local PostgreSQL
  integration skip; Backend syntax validation passed.
- Privacy and Retention source-bound validator suites: 56 passed, zero failed;
  both executable manifests remain deliberately draft and fail-closed.
- Complete technical regression passed: all repository validators passed,
  Flutter reported 329 passed, zero failed and one expected skip, the separate
  Google-profile test passed, the analyzer reported 220 findings against the
  maximum baseline of 223, Web release build plus loopback smoke passed, and
  Android debug assembly passed.
- Production-dependency audit found zero high or critical vulnerabilities and
  one moderate vulnerability. The repository secret scan found no
  high-confidence secret in Git history or the working tree; its twelve exact
  historical findings matched the reviewed baseline.
- Exact GitHub run `32503031376` passed Backend including PostgreSQL 16 and the
  full Flutter/Web/Android debug regression. Signed-candidate construction and
  API-image publication stayed skipped behind their closed gates.

## Persistent boundaries

- No external support message is sent. The existing local thread remains a
  local in-app presentation after the canonical simulation case is confirmed.
- No production, Cloud, VPS, Store, DNS, payment, public pilot or real-money
  state changed.
- T-001 is used as a truthfulness boundary, not falsely claimed as a complete
  template render: no first name or other placeholder is invented.
- No legal, operator, provider, support-hours or named-owner approval is
  claimed.
