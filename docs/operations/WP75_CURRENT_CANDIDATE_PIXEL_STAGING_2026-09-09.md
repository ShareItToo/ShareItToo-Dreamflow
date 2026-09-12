# WP75 — current candidate Pixel and Staging execution

Status: **FUNCTIONALLY COMPLETE; PRIVATE NOTIFICATION-ICON REVIEW PENDING**.

## Exact binding

The physical candidate is `com.shareittoo.app` `1.0.0+2026090905`, built from
`e1c182ea496f013989863155c13bfda649255a7e` and installed on the Pixel 7 Pro
as a data-preserving direct APK update. The verified APK SHA-256 is
`1864b9c17e7813df887fb1e9961a1746665b4b57b6dbd831526e1c3a2f58eaa6`; the
verified AAB SHA-256 is
`ed3d5e5af99a6577e09afc96a880ac4ca7c9c0bd86c54bcaa3f5a07fd6255295`.

Staging runs `0.1.0-baf9267c8bff` from
`baf9267c8bff7533230f3234c1f543649df6e4aa`. There is no Mobile or Backend
runtime drift from the candidate source to that deployment; the later commits
contain only test, evidence and operational documentation work.

## Physical execution

Two existing, distinct, email-link-verified synthetic Staging principals
completed the real Pixel UI journey. The owner published an isolated draft and
the server confirmed public discovery; the renter discovered it, made the
non-binding request and received the acceptance and chat surface. Account-A to
Account-B isolation passed. The booking was cancelled, the listing ended and
the protected owner session was restored.

The first controlled FCM attempt correctly failed before delivery because the
separate device-level Push consent was still off. That was the expected
privacy-preserving default, not a transport success. The owner then enabled
only Push in the app's dedicated device-services control and Android already
allowed notifications. Crash diagnostics remained off. The repeated exact
journey passed foreground in-app presentation, background system notification
and notification after the app process was terminated.

The notification-shade capture is owner-only, sensitive and outside Git. Its
visual icon review remains a small explicit follow-up; it does not weaken the
three functional delivery assertions.

## Runtime and holds

The Staging container is healthy; database and mail report `ok`, FCM is
enabled only for Staging and payment remains `memory` with `stripeLivemode`
false. Listing AI remains the local mock with external execution disabled and
a zero external budget. Readiness is degraded only by two noncritical support
next-update deadlines; there are no critical or privacy-deadline overruns.

No Production, Google Play, tester-list, DNS, public-registration, real-money,
Stripe/provider, external Listing-AI, OnePlus or PR-merge operation occurred.
Binding contract and reservation flows remain closed by the V5.2 legal gate.

The complete local regression passed before the exact runtime deployment with
2,542 tool tests. Exact-head GitHub Regression `34387992280` and CodeQL
`34387992392` passed; Code Scanning has zero open alerts. PR #7 remains Draft,
open, clean and unmerged. Machine-readable evidence is
`docs/evidence/release-readiness/wp75-current-candidate-pixel-staging-20260909.json`.
