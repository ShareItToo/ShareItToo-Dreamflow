# WP187 Play/Pixel manual-pilot closure (2026-09-17)

Status: **PASS for the manual Pilot path; Listing-AI functional acceptance
OPEN/FAILED as residual limitation/debt.** The exact signed
`1.0.0+2026091702` candidate is bound to
source `085e1e9869abb255767e0eaefd29315cb9cdadf8`. GitHub Regression
`35174721577` and CodeQL `35174721574` passed at the exact closure head
`f83158c3`. Sanitized evidence is in
`docs/evidence/release-readiness/wp187-current-candidate-play-pixel-closure-20260917.json`.

Play Internal is active as `1.0.0-internal-2026091702`, available to the two
unchanged testers; 14 pending changes and Managed publishing OFF are
unchanged, with no other track or review action. The Pixel 7 Pro received the
candidate from Google Play (`com.android.vending`), with four expected splits,
cold launch, session and manual-editor smoke passing.

WP185's one manual listing was independently read back as Heilbronn while the
owner profile city remained null; the exact listing, controlled media and
temporary captures were cleaned up. No payment, provider, production,
Firebase, cloud/DNS or PR-merge effect occurred.

The 1701 physical 40-second timeout proof remains valid. The 1701/1702 timeout
implementation and test paths are byte-identical, and unit/late-response
coverage is green (SHA-256 values are in the evidence). 1702 itself returned
in about 0.30 seconds with visible empty AI suggestions and the manual editor;
this leaves Listing-AI OPEN/FAILED as residual limitation/debt, not a manual
Pilot blocker, under the prior Astra decision. The only remaining enforced
gate is exact-head Docs/Evidence CI validation; no further Play upload, listing
publish or provider action is authorized by this handover.

The rollover manifest remains the immutable pre-action snapshot by design;
this document and the WP187 evidence carry the post-action readback.

## Current-candidate gate audit

Listing-AI is explicitly residual OPEN/FAILED debt, not an enforced 1702
manual-Pilot gate. The only enforced open gate is exact-head Docs/Evidence CI;
the current-state summary and WP187 evidence record both facts. The 1702 rollover manifest is
explicitly a pre-action snapshot, so its pending/false fields are historical
handoff state, not a current Play/device blocker. Older legal, provider,
payment, production and cross-device entries remain scope or product-wide
holds and are not current 1702 manual-Pilot gates.

Mentor rule: SHA-256 evidence is machine-copied and compared to the canonical
manifest; every digest must be exactly 64 hexadecimal characters. Never
transcribe a digest manually.
