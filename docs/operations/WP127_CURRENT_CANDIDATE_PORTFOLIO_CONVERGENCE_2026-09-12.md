# WP127 — Current-candidate portfolio convergence

## Result

The active Android Staging objective is reconciled against exact signed
Internal candidate `com.shareittoo.app` `1.0.0+2026091201`, source
`1546812f625b4e8f1e700bf976410097cd45ac2f`. The conservative result is
**12 PASS, 12 PARTIAL and 8 OPEN** across the same 32 requirements used by
WP119. This is one verified improvement over WP119: password, session control
and Account-A-to-B isolation move from PARTIAL to PASS.

The result is not a Production or public-release decision. It is a bounded
Staging acceptance portfolio that identifies the next executable evidence
gaps without repeating already closed physical work.

## Exact transfer boundary

The predecessor candidate `1.0.0+2026091110` came from
`c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b`. Its exact application-runtime
delta to `2026091201` consists of nine paths:

- the candidate build/version binding;
- notification-settings route ownership and outcome semantics;
- FCM registration, retry and cleanup ownership;
- authenticated realtime recovery signals;
- an opaque session-owner helper in `LocalPrincipalScope`;
- foreground/resume push-registration recovery.

The binary Git patch is bound by SHA-256
`6cc52c587c0bfc15ddc0e7206bf2e7398211bb453c101a1fe66e749bcd6a2f21`.
Every changed shared file was reviewed at symbol level. No auth/session action,
listing lifecycle, Listing-AI, search/saved, payment-idempotency or core
marketplace behavior changed. Runtime paths remain unchanged from candidate
source through portfolio base
`d68770b95554183e531b46b93d55eccb723d1844`.

Prior physical evidence is inherited only where this exact review excludes an
effect on the requirement. An uncertain result remains PARTIAL or OPEN. In
particular, old theme, support, registration/recovery, Google, permission,
decline, location, deletion and external-gate gaps are not promoted.

## Newly consolidated proof

- WP126 freshly proves candidate provenance, signature, data-preserving Pixel
  installation and physical FCM in foreground, background and after process
  termination on exact `2026091201`.
- WP125 provides deterministic uncertain-response, retry, cleanup and
  principal/epoch push invariants.
- WP120 physically proves direct password change and rollback, targeted
  session revocation, logout-all, server-confirmed empty truth, independent
  relogin, cold starts and Account-A-to-B isolation. The exact successor delta
  touches no auth/session operation; its `LocalPrincipalScope` addition is
  used only for push-cleanup ownership. This is the only WP119 promotion.
- WP118, WP115 and the remaining cited evidence transfer only across reviewed,
  unaffected behavior.

## Remaining order

1. Replay the exact-current Pixel theme/background/200-percent-text and Android
   permission lifecycle with full restoration.
2. Replay exact-current E-mail registration/recovery, Google sign-in and
   disposable privacy/account-deletion behavior.
3. Replay support/report/block, decline/competition and lawful location timing.
4. Complete Stripe test-mode owner prerequisites and only then the sandbox
   payment/refund/simulated-payout lifecycle.
5. Keep professional V5.2 approval and human TalkBack as explicit owner/human
   gates.
6. Do not contact the disconnected OnePlus. Resume its two-role journey only
   after a future explicit reconnection.

## Verification and boundaries

Portfolio base `d68770b95554183e531b46b93d55eccb723d1844` passes GitHub
Regression `34705532395`, including independent clean checkout, and CodeQL
`34705532322`; open branch code-scanning alerts are zero and PR #7 remains
Draft, open, clean, mergeable and unmerged. WP127 adds a deterministic
validator and negative drift tests. Four focused WP127 tests and fourteen
adjacent WP119/WP120/WP125/WP126/WP127 tests pass. The exact CI-equivalent
complete local Regression passes with 5,668,564 KiB free before work,
3,623,788 KiB generated growth and 2,017,128 KiB free afterward, inside every
fixed bound.

One earlier local invocation omitted the repository's declared candidate
rollover mode and therefore stopped correctly at the legacy Store-handoff
ratchet. It is not acceptance evidence. No assertion or metadata was changed;
the succeeding command used the same explicit mode permanently configured in
GitHub CI. Five superseded private candidates were moved recoverably to the
connected cold-storage volume to satisfy the unchanged capacity floor; current
`2026091201` and predecessor `2026091110` remained untouched. Neither the
invocation correction nor manual archive relocation is a release prerequisite.

No app runtime, backend, Production, Google Play, tester list, Firebase
project, deployment, payment provider, real money, VPS/DNS, public
registration, Pixel, OnePlus or PR merge is changed. No credential, account
identity, raw device identifier or private filesystem path is retained.

Machine-readable evidence:
`docs/evidence/release-readiness/wp127-current-candidate-portfolio-convergence-20260912.json`.
