# WP148 — Android social-provider activation guard

Status: **TECHNICAL CLOSURE; FACEBOOK AND APPLE PROVIDER GATES HOLD**.

## Decision

The Android pilot does not need to wait for another sign-in provider. Email
registration and Google sign-in are already proven on the exact signed current
candidate. Facebook and Apple remain available as later additions but stay
disabled until their distinct provider prerequisites and exact-candidate
acceptance are evidenced.

Facebook is locally implemented with automatic SDK event collection,
advertiser-ID collection and advertising permissions disabled. Its external
Meta/Firebase configuration, protected App ID/client-token inputs, upload and
Play-signing key hashes, redirect configuration, access state and exact-device
acceptance are not yet evidenced.

Apple sign-in is technically supported on Android through Firebase and its
local client path exists. It is not required for this Android pilot. Apple
Developer membership, Services ID/key/Firebase configuration, return URL,
private-email relay and linking consent remain unverified. The current account
deletion path removes the Firebase identity but does not yet prove explicit
Apple authorization-token revocation, so Apple cannot be enabled truthfully.

## Implementation

`store/social-auth-provider-readiness.json` is the sanitized provider evidence
surface. Its validator derives the complete missing prerequisite list and
refuses an explicit Facebook or Apple release while the selected provider is
not ready. The Android release-build entry point now invokes that validator
before enabling either provider and rejects malformed feature-flag values.
Protected provider values remain runtime inputs outside Git.

This closes the unsafe path where a build flag alone could expose a social
button whose provider configuration was absent. It does not create a provider
app, enable Firebase, accept an agreement or claim provider readiness.

## Verification and portfolio

The exact hold manifest and both negative provider gates pass. Eight focused
Node tests, the release-gating Flutter test, three Google-only profile tests,
the provider-ownership, initialization and native-provider profiles, nine
focused Backend identity tests, shell syntax and diff checks pass. Expected
Flutter skips cover inactive provider profiles and are not converted to passes.
The complete CI-equivalent technical regression also passes, including the
zero-issue analyzer, Web/Wasm, loopback smoke and Android debug build.

The separate local private-artifact rollover check correctly remains closed:
the retained signed candidate predates later runtime-affecting Backend work.
This was not bypassed or reclassified. One strictly higher, exact-head signed
candidate is required before the next release artifact is distributed.

The 32-area portfolio remains **22 PASS / 5 PARTIAL / 5 OPEN**. Facebook and
Apple remain OPEN, while Apple is explicitly optional for the Android pilot.
The binding pilot is still blocked by professional V5.2 approval and immutable
snapshots plus Stripe Connect sandbox provider setup and the official
eight-scenario journey. Manual TalkBack and the durable private-registry pull
also remain open release-readiness work.

Next independent lane: close the durable private-registry pull readiness if it
can be proven without changing the running Staging service. Provider and human
gates remain separately pending. The final candidate refresh follows the last
runtime-affecting change rather than creating repeated intermediate builds.

No provider console, Firebase, account, membership, agreement, credential,
candidate, device, deployment, Production, Store, payment or PR-merge state
changed.
