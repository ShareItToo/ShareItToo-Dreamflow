# WP05 — Pixel 0404 support read baseline

Status: PASS for the bounded read baseline; full support acceptance remains OPEN.
Candidate source: `55a1aa5a11a53151ee6740785eb1e25b79f6b06e`,
version `1.0.0+2026090404`. Execution/evidence base: `ed93199e`.
No app, backend, provider or account configuration was changed.

## Actual observations

At 12:53–12:54 UTC, the installed APK was freshly hash-verified on the unlocked
Pixel 7 Pro. The existing contact email matched exactly one protected,
email-link-verified synthetic owner fixture in memory. Display name alone was
not used as principal proof. No contact values, credentials, case identifiers
or raw UI hierarchy were printed or retained.

Profile → Hilfe-Center → Meine Support-Fälle opened successfully. The actual
list showed both “Noch keine Support-Fälle” and its server-confirmation
explanation, with no error, retry, invalidation or case cards. Navigation
returned through the verified app-owned read surfaces to Entdecken. No case
was submitted, details opened, refresh attempted or network setting changed.

At 12:56 UTC, independent supported Staging login/me/list/logout calls used
the same protected fixture's two distinct synthetic roles. Each `/auth/me`
matched the expected email in memory and a different backend principal.
Each `/support/cases` returned HTTP 200, a real empty JSON array and
`Cache-Control: private, no-store`. The owner's backend count agrees with the
Pixel empty baseline. Both newly issued probe sessions were individually
revoked with their own refresh token, and subsequent use of each access token
was rejected with HTTP 401. No Pixel session token was read or used, and no
logout-all/session-list deletion occurred.

Fresh health remained Staging source
`5d88295fa7fe313b83936783a0582a505b2ba486`, memory payments, live mode false.
The first API probe stopped before any network/auth request because its
whole-file equality guard rejected local `app.js` differences. Review found
only listing-AI key-loading/health changes, not auth/support handlers. The
exact reviewed diff is now hash-bound, and authorization/session/support
helpers remain equal. The retained failed preflight was not a backend failure,
and no repeated login or credential guessing was used to resolve it.

## Evidence and limits

The private classifier has 12 passing deterministic tests: loading/title-only
is never empty; partial/error/invalidation states never become success; stale
cards plus error/empty are contradictory. Those tests validate the diagnostic,
not an actual injected network error or account switch on the Pixel. The
physical observation caught the resolved empty state, not the initial spinner.

The independent API sessions are not a two-role Pixel journey or proof of
race handling. No actual support submission, case receipt/idempotency/detail,
follow-up, offline/retry or in-flight A→B isolation is claimed. No provider
traffic, SMS, OnePlus, GitHub, Store, money or production action occurred.
Only the disposable probe sessions were created/revoked in Staging.

Private proofs are retained under `SIT_WP05_0404_EVIDENCE.ZJuzfC`:

| Proof | SHA-256 |
| --- | --- |
| Pixel preflight | `e2748cbefa6158e2cac67e809007e1b5d49150560be7ce926e173122d847c975` |
| Pixel support list observation | `f4788d23d68d7d128e21bd397396d235e1c77a321a63bb693d1e0a5d08bb70ba` |
| Owned navigation restoration | `0532f1148b584e67abf7c4c69d3f5c7fa8661569fea9451b4d9b36f4558d0615` |
| Independent two-role API result | `3a374b0cf3560ce22c6347f157558e60a61929fa2b4e3ca3532d8b4b3f9d2cfe` |

Sanitized summary:
`docs/evidence/release-readiness/wp05-pixel-0404-support-read-baseline-20260904.json`.
GitHub remains owner-deferred; no exact-CI closure is inferred.

## Next bounded actions

1. Confirm the same installed candidate and disposable role before a controlled
   technical-support intake, clearly labeled as a Staging test. Inspect the
   actual simulation-only path and prevent real-owner complaints/provider mail.
2. Verify exact server receipt, list/detail association and replay behavior;
   test offline/error/retry without converting uncertainty to empty/success.
3. Test ownership/follow-up under the distinct roles. Do not invent staff
   approval, legal decisions or a generic follow-up path where none exists.

Preserve the immutable 0404 archive/source and all earlier proof. Any concrete
functional correction needs its own regression/candidate binding. The broader
Goal and provider/legal/owner requirements remain OPEN; OnePlus stays untouched.
