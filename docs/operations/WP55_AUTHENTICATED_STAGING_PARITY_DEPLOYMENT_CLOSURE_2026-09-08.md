# WP55 — Authenticated Staging parity deployment closure

Status: **COMPLETE — exact Staging runtime deployed; noncritical Support
degradation retained truthfully**.

## Result

The ShareItToo Staging Backend now runs exact source commit
`d8d1df7f59052c202f824f759693a472b6b8afa1`, version
`0.1.0-d8d1df7f5905` and OCI image digest
`sha256:e4ae94d740ef83fa80d59762805e1f64cc76f80ecd46531f955ce27ab0289908`.
The detached deployment checkout is clean and its `backend/` tree is
`d991765a159810b88e4e4db874ac6193ae3e804d`, identical to the reviewed WP50
Backend target.

The deployment harness first verified all 354 foreign-key constraints, pulled
the exact commit-tagged image, retained the previous healthy image for
automatic rollback and then recreated only the Staging API. Rollback was not
needed. The release record
`staging-20260908T015645Z-d8d1df7f5905.json` is mode `0600`.

## Protected runtime result

Authenticated post-deployment inventory and a separate public readback prove:

- API and PostgreSQL are healthy with restart count `0`;
- Firebase authentication, phone verification, FCM, SMTP and the
  `heilbronn_wave0` closed-pilot envelope remain enabled;
- payment remains memory-only with Stripe live mode false;
- Listing AI remains the local mock with zero external budget and execution
  disabled;
- the public version endpoint returns the exact deployed commit and version;
- Production, Store, Firebase Console, DNS, OnePlus and PR #7 did not change.

Public readiness remains HTTP `503` only because one noncritical Support next
update is overdue. Database and mail are `ok`, notification counts are zero,
the Support watchdog is current, P0-without-owner is zero and critical plus
privacy overdue counts are zero. WP55 does not disguise that separate
operational degradation as either deployment failure or full launch readiness.

## Active-session boundary smoke

An isolated disposable Staging account was seeded with exactly 100 active
sessions and one session-bound push device. One real loopback login against
the deployed API returned HTTP `200`, retained exactly 100 active sessions,
revoked only the oldest excess session and its refresh token, removed that
session's push device and kept the replacement session active.

Cleanup used the product's own account-deletion endpoint. It removed the
password and all dependent session, refresh-token, push-device, identity and
action-token rows, closed the account and retained only the intended
pseudonymous tombstone plus immutable audit history. No disposable account
identifier, credential or token is recorded in repository evidence.

## Mac mini continuity rule

The installed, authorized Codex computer-use helper successfully unlocked the
Mac mini once without reading or exposing a password. A later automatic unlock
was not guaranteed, so WP55 does not treat GUI unlocking as a durable
prerequisite. The ongoing rule is:

1. try only the authorized Codex unlock mechanism;
2. never read, extract, print or persist a login password, browser cookie or
   token;
3. keep an active autonomous run awake without disabling normal lock security;
4. continue independent Staging work through the dedicated, least-scoped
   headless connection when the GUI is locked;
5. require Walid only for a genuinely interactive GUI/account step that cannot
   be completed safely in the headless path.

The dedicated Staging access was freshly verified. Its private key remains
local with mode `0600`; malformed duplicate public-key entries were removed,
one unrelated pre-existing entry was retained, one canonical dedicated entry
remains and a pre-repair backup is retained outside Git. No key material,
server address or private infrastructure path enters this repository.

## Verification binding and remaining risk

Exact target GitHub Regression `34168650985` passed all required jobs,
including clean checkout and image publication. Exact target CodeQL
`34160161823` passed with zero open code-scanning alerts. The authenticated
runtime inventory passed again after the session smoke. The final local
technical regression also passes with the explicit candidate-rollover mode:
all tool and Backend tests, Flutter tests and analyzer, Web/Wasm build,
loopback smoke and Android debug build are green. The rollover pointer is
bound to the already verified WP54 candidate `1.0.0+2026090711`; it neither
creates nor uploads a new binary.

WP55 closes Backend parity, not the broader pilot or public-launch gates. The
remaining immediate operational risk is the one overdue noncritical Support
update. Real payment, external Listing AI, public registration, Production,
Store distribution and legal/professional approval remain separate and
unchanged.

Machine-readable evidence:
`docs/evidence/release-readiness/wp55-authenticated-staging-parity-deployment-closure-20260908.json`.
