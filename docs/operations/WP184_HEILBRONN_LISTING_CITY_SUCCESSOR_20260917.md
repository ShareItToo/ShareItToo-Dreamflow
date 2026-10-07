# WP184 Heilbronn listing-city successor handover (2026-09-17)

## Superseding WP187 closure status (2026-09-17)

The historical WP184 successor `1.0.0+2026091702` is now Play Internal active
and Play-source Pixel verified. GitHub Regression `35174721577` and CodeQL
`35174721574` passed at exact head `f83158c3`; the manual Pilot path passed,
including the Heilbronn server read-back with owner city null and exact
cleanup. Listing-AI functional acceptance remains **OPEN/FAILED as residual
limitation/debt** because the 1702 native path returned in about 0.30 seconds
with visible empty suggestions and manual editor rather than demonstrating the
40-second timeout. Identical timeout implementation/test paths, green
unit/late-response coverage, safe editable return and the prior Astra decision
make this no manual-Pilot blocker; the only remaining enforced gate is
exact-head Docs/Evidence CI validation. See the sanitized WP187 evidence and
handover:

`docs/evidence/release-readiness/wp187-current-candidate-play-pixel-closure-20260917.json`

`docs/operations/WP187_PLAY_PIXEL_MANUAL_PILOT_CLOSURE_20260917.md`

The pre-action statements below are historical WP184 state, not a claim that
Play or device actions are still pending.

Status: technical fix complete; local signed successor archived. No Play
upload/activation, device installation, provider, payment, production or PR
merge action occurred.

## Root cause and fix

WP183 exposed a real payload inconsistency: the create-listing surface showed
`Heilbronn`, while the request city fell back to `Berlin` because Heilbronn was
absent from the central `DataService._cities` catalog. Staging correctly
rejected that request before creating a listing. WP184 adds Heilbronn once to
that catalog with stable coordinates (`49.1427, 9.2109`). City derivation,
autocomplete and the listing payload now use the same catalog truth. A focused
test helper proves that the derived city wins over the old null/Berlin fallback.

Implementation source fix: `1ea761c5645fb98eb38ed4cd9d73d79022e2da80`.
Retention/privacy source bindings were refreshed in `52c92fc1` and
`085e1e9869abb255767e0eaefd29315cb9cdadf8`.

## Successor artifact

The exact successor is `com.shareittoo.app` `1.0.0+2026091702`, Internal/Staging
only, source head `085e1e9869abb255767e0eaefd29315cb9cdadf8`. The private
owner-only archive and all hashes are recorded in
`store/google-play/rollover-candidate-2026091702.json`:

- AAB: 138841007 bytes, SHA-256
  `c684cebfe2bca5e15cb59ae440421f96f3d20821a0b052d91f7d9d12b2877b79`
- APK: 199976443 bytes, SHA-256
  `20daaeb8994b7962b5d9ea5f4ea4e18866a33fb49962a64ccd17345294e12f3d`
- upload certificate: `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`

Package, version, minSdk 24, target/compile SDK 36, signing, ZIP structure,
privacy scan and owner-only archive permissions passed. The direct global SDK
attempt failed closed on the known incompatible SDK XML reader; the scoped
Android SDK profile produced the verified artifact.

## Verification and holds

Focused Flutter tests pass **6/6**. The rollover validator passes **23/23**.
The canonical scoped CI-equivalent local technical regression completed with
**exit 0**, including the repository tool inventory (`3126/3126`), Flutter/analyzer, Web/Wasm, loopback smoke, Android
debug/minSdk and release-host capacity checks. Privacy and rollover validators
pass; GitHub Regression/CodeQL remain pending. The historical 1701 manifest is
unchanged.

Next action is Sol review, followed by the separately gated exact-head GitHub,
Play and physical-device acceptance steps. This handover authorizes none of
those external actions itself.

## Counting rule

Mentor rule: test totals may only be copied from the direct runner summary.
Command-level validator checks are reported separately and must never be added
to a Flutter or other test total.
