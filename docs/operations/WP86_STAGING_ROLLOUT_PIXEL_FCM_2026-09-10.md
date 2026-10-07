# WP86 — Staging rollout and controlled Pixel FCM

Status: **COMPLETE FOR THE NARROW STAGING/PIXEL FCM SCOPE; NOT A RELEASE
APPROVAL.**

## What was proven

The exact GitHub-published API image for
`926a00c5fa7f6595069aed12119d2dde90935bc3` was deployed only to Staging.
The deployment readback proves the expected API and database health, Staging
FCM and SMTP, memory-only payment with Stripe live mode false, mock-only
listing AI, and five persistent regular Compose references including one
retained deployment override. No configuration or credential contents were
recorded.

The physical Pixel still runs the separately signed Internal/Staging direct
APK `1.0.0+2026090905` from
`e1c182ea496f013989863155c13bfda649255a7e`. Its archive, package and APK hash
were revalidated before the run. Two existing, distinct email-link-verified
synthetic Staging roles created a fresh non-binding simulation; it proved
role visibility and chat, then cancelled the simulation, ended the listing and
confirmed removal from the public catalog. No contract, reservation, payment
endpoint, Stripe live mode or monetary effect was created.

On that exact Pixel APK, controlled FCM delivery passed in all three requested
states: foreground banner, Android background notification and Android
notification after the process was stopped. The captured notification shade is
private, owner-only and excluded from Git. Its visual icon review remains
open; it is not represented as a passed visual claim.

## Deliberate provenance limit

The deployed Staging source is a successor of the Pixel source. Five
runtime-relevant paths differ: the operational-readiness gate plus the draft
operator and three legal Flutter surfaces. WP86 therefore proves only the
observed Pixel-to-Staging FCM transport. It does **not** transfer broad mobile
acceptance, legal acceptance or a production decision to the successor runtime.

## Holds and cleanup boundary

An attempted binding test was correctly rejected before contract creation by
the V5.2 document gate. A later cleanup found an ambiguous mixed set of older,
nonpublic source-vault test listings sharing its title and refused to change
them. The current WP86 simulation itself was fully removed. The V5.2 binding
gate, private icon review, OnePlus matrix, Stripe sandbox gate, external
listing-AI provider decision and all Production/Store/public gates remain
separate and open.

Machine-readable evidence:
`docs/evidence/release-readiness/wp86-staging-rollout-pixel-fcm-20260910.json`.
