# WP08 — Listing-AI Staging acceptance

Status: **PARTIAL — STAGING RUNTIME AND NON-BINDING ACCEPTANCE PASSED;
EXTERNAL PROVIDER OWNER AUTHENTICATION PENDING** on 05.09.2026.

WP08 deployed the exact backend commit
`b0d92af3c0fd3b855b797a573a3c99cd206e608b` to Staging from immutable image
digest
`sha256:75f51818d39284fded68a7f32ffb3749087f11173c5d69511122842a2971bcee`.
Public readback identifies that commit and reports a ready database, mail
transport and notification queue. Listing AI remains deliberately on
`listing-ai-mock-v1`, with a zero-cent budget, external execution disabled and
automatic publication forbidden. Payments remain the non-live memory provider.

The actual Work Chrome OpenAI Platform session was checked rather than inferred
from a Codex or ChatGPT login. The Platform requires authentication, and no
dedicated runtime credential exists locally or in GitHub Secrets. No credential
was read, copied or extracted, no external provider request was made and no API
billing was used. Real Listing-AI Staging acceptance therefore remains an owner
authentication action; the deployed service continues safely in mock mode.

## Acceptance results and correction

The first post-deploy binding probe was rejected as an invalid V5.2 declaration.
Private diagnostic evidence showed a four-millisecond clock skew: the client
acceptance timestamp preceded the authoritative server quote timestamp. The
bounded correction at implementation commit
`07030b27abeba68d40838e37bcd1d46600a9afa2` derives acceptance from the server
quote window, clamps client time forward to `quotedAt`, and rejects invalid or
expired quote windows. A focused regression reproduces the skew.

After the correction, the declaration passes and the binding path stops at the
intended legal hold: `409 v52_contract_documents_unavailable`. This is the safe
result while the V5.2 manifest is `draft-blocked`; no contract, reservation or
payment was created and no draft legal snapshot was seeded or bypassed.

The reusable non-binding two-role Staging journey passes password login,
verification/consent, listing visibility, shared simulation state and chat.
The safety diagnostic passes report, temporary block and export; it removes the
temporary block and restores chat. Account deletion remains pending until a
disposable identity is used, preserving the protected reusable fixture.

On the physical Pixel, the immutable candidate `1.0.0+2026090503` with APK
SHA-256
`ff9f0527c73cc7ba7abf31c1fa478c061f292e7b7cd485500959dfe12205ef57`
passes fresh foreground, background and terminated-process FCM against the new
Staging runtime. Only the SHA-256 of the private capture is recorded because it
may include unrelated notifications. A fresh privacy-safe icon review remains
pending and is not inferred from the historical candidate review.

## Verification

- Focused correction and diagnostic tests: 31/31 passed.
- Privacy, retention, active-provider and RW source-ratchet validators: 20/20
  passed after intentional current-source hash refresh. Historical heads and
  legal/live boundaries are unchanged.
- Complete local regression passed with the supported candidate-rollover flag
  and CI metadata-only path. Earlier attempts correctly exposed that the old
  Play handoff is older than the current version and that a deleted private
  historical candidate archive cannot be treated as a permanent build
  prerequisite; neither failure was bypassed or promoted as a product pass.
- Exact clean-checkout R10 passed at `07030b27...`: full gate 704 seconds,
  second Android build 36 seconds, both 231,344,583-byte APKs byte-identical
  with SHA-256
  `6746e5f88c42725f1976adb43b9d81ed759c646cb598f2b773ba08675858fc5b`.
- GitHub CodeQL run `33952111490` and GitHub Regression run `33952111491`,
  including its independent exact-head R10 job, passed. Open code-scanning
  alerts are zero. PR #7 remains Draft, open, mergeable and unmerged.

The R10 machine report is
`docs/evidence/release-readiness/staging-runtime-safety-clean-20260905.json`;
SHA-256
`d481a0f0a9a97ae7d0dadc69b46d7f7cd524d8b8df622f30131cad27c6f571d4`.
Sanitized WP08 evidence is
`docs/evidence/release-readiness/wp08-listing-ai-staging-acceptance-20260905.json`.

## Remaining boundaries

External Listing AI remains disabled pending a supported dedicated Platform
authentication and secret-file configuration. Binding V5.2 remains blocked
pending professional approval and immutable legal snapshots. Stripe sandbox /
test money is a separate package. No Production, Play, OnePlus, public
registration, live payment, automatic publication, DNS or PR-merge action is
included in WP08.
