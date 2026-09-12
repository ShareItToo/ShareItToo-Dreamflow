# S2A support denied-access audit - technical compliance record

Status: verified non-live implementation, fail-closed.

Exact commit: `3742f00b11366205abb79c10295e775d301325e8`.
Exact successful GitHub Actions run: `32497715939`.

## Bound scope

This narrow follow-up closes the remaining technical expectation in Drive
Support Packet scenario `SUP-020`: a support account attempting to read a case
outside its assigned queue must be denied and the attempt must be audited.

It does not implement `SUP-024` or `SUP-025`. Break-glass access remains absent
and blocked rather than being inferred from the audit capability.

## Implemented controls

- Staff case detail remains restricted to administrators or the exact
  `current_owner_id` support account.
- Support reads that match neither an assignment nor a visible case append a
  sanitized `support.case_access_denied` record before returning the existing
  fail-closed response.
- Decision-list reads apply the same assignment boundary and return the same
  `404 support_case_not_found` result for missing and unassigned cases, avoiding
  an existence oracle.
- Denial audit metadata contains only the bounded access path and the combined
  reason `not_assigned_or_not_found`. It contains no case content, owner,
  reporter, counterparty or credential value.
- The append-only audit table remains the established technical sink. No
  external message, notification, provider call or automated measure is added.

## Local verification

- Focused support-case and support-decision workflow tests: 28 passed, zero
  failed.
- Complete backend regression with CI-equivalent non-secret test configuration:
  390 passed, zero failed and one PostgreSQL integration test skipped locally.
- Privacy/retention validator suites: 61 passed, zero failed; both executable
  manifests remain draft and fail-closed.
- CI-compatible technical regression passed: 321 Flutter tests, the separate
  Google-only profile test, Web build and loopback smoke, and Android debug APK
  build.

## Persistent boundaries

- No production, Cloud, VPS, Store, DNS, payment or public pilot state changed.
- No privileged access path or break-glass grant was created.
- No professional legal, operator, provider or retention approval is claimed.
- PostgreSQL 16, Backend, Flutter, Web and Android debug paths passed in exact
  run `32497715939`. Signed-candidate construction and API publication stayed
  skipped behind their closed gates.
