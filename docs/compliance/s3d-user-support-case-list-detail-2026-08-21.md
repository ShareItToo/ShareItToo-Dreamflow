# S3D user support case list and detail - technical compliance record

Status: verified at exact commit
`61cd3ad8ef6ab178eee5305d1654c291d8c5a40f`, non-live and fail-closed.

## Bound source and scope

This package connects the existing authenticated user endpoints
`GET /v1/support/cases` and `GET /v1/support/cases/:id` to a read-only Flutter
list and detail surface. It addresses the internal-code exposure risk in Drive
Support Test Matrix scenario `SUP-143` and establishes the screen-reader,
large-text and non-color-only status foundations required by `SUP-146` through
`SUP-148` in packet `SIT_SUPPORT_PACKET_V1_2026-08-20`.

It does not claim `SUP-144` complete because the current user projection has a
server-confirmed next-update time but no separate confirmed user-response
deadline. It does not claim `SUP-145` complete because no approved user-safe
decision payload, implementation detail and redress route are available from
the current endpoint. Neither value is invented in the client.

## Implemented controls

- The Help Center exposes `Meine Support-Fälle` only after the established
  authenticated account gate.
- The client loads only server-returned user cases and their user-visible
  events. It creates no local case, status or event fallback.
- Case ID, simple German status, user-facing summary, next action and the
  server-rendered Europe/Berlin next-update display are shown without exposing
  case type, subtype, event or lifecycle codes.
- Unknown or malformed statuses fail closed with a neutral retry view. Raw
  server codes are not reflected into the UI or error copy.
- Status is communicated with text and icon in addition to color. Cards avoid
  fixed content heights, use semantic labels and retain a bounded tap target.
- `waiting_for_user` places the confirmed next action prominently. It labels
  the server timestamp truthfully as the next update, not as a user deadline.
- Simulation/internal-testing cases carry an explicit test-mode notice. No
  external message, payment or provider action is implied.
- The backend repository and the new personal-data display source are bound
  into both privacy and retention source-hash inventories.

## Verification

- Support case list/detail, unknown-status, incomplete-active-state,
  identity-mismatch, 200-percent text and authenticated Help Center route
  tests: 6 passed, zero failed.
- Combined focused Support Case, Help Center and Support Flow suite: 17 passed,
  zero failed.
- Targeted Flutter analyzer: zero issues.
- Complete technical regression passed: all repository validators passed,
  Flutter reported 338 passed, zero failed and one expected skip, the separate
  Google-profile test passed, the analyzer reported 220 findings against the
  maximum baseline of 223, Web release build plus loopback smoke passed, and
  Android debug assembly passed.
- Production-dependency audit found zero high or critical vulnerabilities and
  one moderate vulnerability. The repository secret scan found no
  high-confidence secret; its twelve historical findings matched the reviewed
  baseline.
- Exact-commit GitHub Actions run `32506977131` passed Backend regression with
  PostgreSQL 16 and the full Flutter/Web/Android debug regression. Signed
  candidate construction and image publication stayed skipped.

## Persistent boundaries

- Case reads stay authenticated, private and `no-store` at the backend route.
- No production, Cloud, VPS, Store, DNS, payment, public pilot or real-money
  state changed.
- No support deadline, final decision, appeal action, response outcome, legal
  approval or named operator is invented.
