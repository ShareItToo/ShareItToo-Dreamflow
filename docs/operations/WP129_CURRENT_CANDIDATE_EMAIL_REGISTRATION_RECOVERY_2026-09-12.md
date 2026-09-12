# WP129 — Exact-current E-mail registration and recovery

## Result

WP129 is **complete** for fresh E-mail registration, verification, login and
password recovery on the signed Internal/Staging `com.shareittoo.app`
`1.0.0+2026091201` candidate from source
`1546812f625b4e8f1e700bf976410097cd45ac2f`.

The physical Pixel submitted a new private disposable registration through the
product UI with all four required consent decisions. Exactly one matching
verification message arrived in the connected private mailbox. Its exact TLS
Staging action returned the expected success and a subsequent request returned
the exact consumed-link response. The verified account then logged in, bound
to the expected principal and survived a cold start.

The same account requested password recovery through the product UI. The UI
retained the non-enumerating response and exactly one matching recovery message
arrived. The exact Staging form and submission each returned definite success.
The immediate replay inspection was rate limited, so WP129 does not overclaim a
second consumed-link response for that action. Recovery truth is independently
closed: the old password returned the exact structured application rejection,
the replacement password logged in on the Pixel and the recovered principal
survived a cold start.

The original protected synthetic owner was restored afterward. The disposable
account remains private and isolated for a later exact-candidate account-
deletion package; it has no listing, booking, message or payment fixture.

## Exact boundaries

The immutable Staging Backend reported database and mail readiness. Overall
readiness remained degraded only by three non-critical overdue support
follow-ups; zero critical follow-ups, privacy deadlines or P0 owner gaps were
reported. This did not alter the independent authentication result, and WP129
made no support mutation.

No credential, E-mail address, action link, token, private path or raw device
identifier is stored in Git. Both local state files remain owner-only outside
the repository. No app or Backend runtime changed. No Production, Google Play,
Firebase project, tester list, VPS/DNS, payment, real money, public
registration, OnePlus or PR-merge action occurred.

The current 32-area portfolio moves from **13 PASS / 11 PARTIAL / 8 OPEN** to
**14 PASS / 10 PARTIAL / 8 OPEN**. Only
`email-registration-verification-login-recovery` is promoted. Privacy export
and account deletion remain separately PARTIAL until the retained disposable
account is deleted through the exact candidate and cold-start Guest truth plus
server cleanup are proven.

Machine-readable evidence:
`docs/evidence/release-readiness/wp129-current-candidate-email-registration-recovery-20260912.json`.
