# WP05 — search-corrected Pixel candidate 2026090406

Status: PREPARED FOR FREEZE. Exact0406 cold/normal/signed/device proof is OPEN.
Preparation base: `d48ec694d80510fbf86bc9c6454d36a116113327`.
The final build source is the subsequent preparation commit, not this base.
GitHub is owner-deferred, not passed or waived. Full Goal remains ACTIVE.

## Why a successor is required

The guarded cart/listing preflight on installed0405 reproduced a real search
defect without performing the planned cart write. Query `SIT` was treated as
category `Baby & Familie` because the old loose substring rule matched `Sitze`.
Independent public API reads returned the exact active fixture, while the Pixel
result route was empty. Both test principals had zero blocks and the selected
future range was available. No request, reservation or payment was created.

The correction extracts deterministic category inference. Exact short category
and subcategory terms and explicit synonyms still work; ambiguous substring
inference now requires at least four runes. Focused5 Flutter tests,6 tool tests
and analyzer0 pass. Full normal regression passes2235 tool tests,856 default
Flutter tests plus33 declared provider-profile skips/all34 lanes, analyzer0,
Web/Wasm dry run, loopback and Android. Exact clean R10 on the implementation
commit passes full689s/second Android45s with byte-identical APKs/all794 entries,
unchanged116 migrations/84 assets and complete cleanup. See
`../evidence/release-readiness/wp05-search-category-inference-clean-20260904.json`.

Installed0405/source4a77 and all of its artifacts/evidence remain immutable. It
is retained as rollback and historical device proof, but is no longer the final
candidate for cart/listing acceptance. The Pixel has been returned to the exact
synthetic owner role through normal logout/login with app data preserved.

## Candidate preparation

Reserve local Android versionName1.0.0/versionCode2026090406. Seventeen private
archive manifests were read structurally and match their directory, source and
package identities; their highest local version is0405 and no0406 archive or
version-history entry exists. This is local uniqueness, not a fresh Google Play
Console highest-version claim. No Store upload or distribution is implied.

Only `pubspec.yaml` and the existing client-build fallback change0405 to0406.
Dependent source hashes and validator hash constants are refreshed mechanically;
all non-hash claims, approval states, source membership and assertions remain
unchanged. The graph converges to a zero-change rerun. Affected validators pass
118 tests and the canonical signing configuration passes without exposing
protected values. The full candidate-specific gates still run after freeze.

Candidate boundaries remain `com.shareittoo.app`, Staging API and Firebase
Staging, Google-only social profile, closed Heilbronn Wave-0 nonbinding mode,
FCM transactional only, Analytics off, and payment transport memory/live=false
until a separately proven Stripe test-mode package. No provider, production,
Store, public-registration, legal, retention or payment gate is changed.

## Required continuation

1. Freeze the preparation commit and verify an unchanged clean working tree.
2. Run exact0406 clean R10 through the maintained version-2 Mac-mini profile.
3. Run the matching full normal and signed APK/AAB lifecycle at that same HEAD.
4. Independently verify artifact hashes, signatures, bundle structure, compiled
   privacy surface and exact Staging/provider envelope from a clean checkout.
5. Perform only a data-preserving0405-to0406 Pixel update, then verify identity,
   owner role, restart and the corrected search result before one cart write.
6. Resume the bounded project assignment, offline/error/retry and account
   isolation matrix. Never replay project creation or listing reactivation.

No OnePlus, Store, production, GitHub, provider or real-money action belongs to
this continuation. GitHub Regression/CodeQL remains explicitly pending until
the owner-deferred remote step is reopened.
