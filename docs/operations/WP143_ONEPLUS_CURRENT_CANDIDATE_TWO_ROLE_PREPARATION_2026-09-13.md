# WP143 — OnePlus current-candidate two-role preparation

Status: **PREPARED LOCALLY; PHYSICAL ONEPLUS EXECUTION PENDING**.

## Why this package was necessary

The retained WP117 OnePlus runner is intentionally historical and remains
bound to signed candidate `1.0.0+2026091110`. The current signed Internal/
Staging candidate is `1.0.0+2026091312`, source
`904c2b734160544aaeb1128cac15191a521739e7`. Reusing WP117 would therefore
fail safely, but it could not execute the next current-candidate OnePlus run.
WP143 closes only this preparation gap and leaves the historical evidence and
runner unchanged.

## Exact prepared path

The versioned runner
`tool/run_wp143_oneplus_current_candidate_two_role.mjs` accepts only the exact
current candidate, canonical upload certificate, Firebase-enabled Internal/
Staging profile and Google-only social configuration. It accepts only one
unlocked physical OnePlus CPH2581. It never uninstalls ShareItToo and never
clears app data.

If the exact candidate is already installed, the runner preserves it without
requiring an install action. An absent package or an older `1.0.0` ten-digit
candidate requires the explicit WP143 installation gate; an update uses
Android's data-preserving replacement path. A different version name, equal or
newer non-exact build, split/ambiguous package, hash/signature drift, unstable
push opt-in or incomplete cleanup fails closed before an acceptance result.

The subsequent real product journey remains Staging-only and requires owner
publication, renter discovery, non-binding request/acceptance, chat, controlled
FCM, Account-A/B isolation, cancellation/listing retirement and protected-owner
restoration. It forbids contracts, reservations, payment calls, money, Store,
Production, public-registration and credential disclosure.

## Fresh preparation readback

The private archive for `2026091312` freshly passes exact APK, commit,
certificate, Firebase and social-auth validation. The sanitized QA-vault audit
reports 192 recognized entries, zero active source, 188 retired journeys, four
other recognized entries and zero invalid or unsafe entries. A specific
reusable source is deliberately selected and fully validated only when the
physical run begins; no account identity or private path is committed.

The Mac mini currently sees exactly one authorized physical Android device,
the Pixel 7 Pro. The OnePlus is not connected and was not contacted. Therefore
no physical journey ran and `oneplus-cross-device-two-role` remains **OPEN**.
The overall portfolio remains **21 PASS / 4 PARTIAL / 7 OPEN**.

All 11 focused WP143 tests and the complete local technical regression pass,
including zero-diagnostic Flutter analysis, the full Flutter suite, Web/Wasm,
loopback smoke and Android debug build. Final-head GitHub Regression and
CodeQL remain to be read back after the preparation commit is pushed.

The next safe action is one bounded physical execution when the OnePlus CPH2581
is connected and unlocked. Until then, no installation, device mutation,
Staging business-data mutation or requirement promotion is claimed.

No Production, Store, Firebase Console, Stripe account, provider traffic,
payment, money, Pixel, OnePlus, Staging data, PR merge or secret state changed.
Machine-readable evidence is in
`docs/evidence/release-readiness/wp143-oneplus-current-candidate-two-role-preparation-20260913.json`.
