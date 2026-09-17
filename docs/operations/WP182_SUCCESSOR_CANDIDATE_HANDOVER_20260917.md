# WP182 successor candidate handover (2026-09-17)

Status: local preparation only. No Play upload, activation, device install,
push, provider activation, or production change is included in this handover.

## Scope and provenance

The historical physical baseline is the signed Internal/Staging candidate
`1.0.0+2026091605` (`com.shareittoo.app`) from source commit
`261f05e262fa5aad2238527505cf09319146d583`. Its recorded AAB and APK
SHA-256 values are retained in the immutable 1605 evidence. The successor is
strictly `1.0.0+2026091701`, Internal/Staging only, and is bound to the
runtime source commit recorded in
`store/google-play/rollover-candidate-2026091701.json`.

The successor keeps the canonical package, API target, Firebase configuration,
upload certificate binding, on-device Listing-AI location, external-image-
provider hold, and social-auth hold. The candidate manifest is fail-closed
until the signed archive and all required local gates are populated.

## WP176-WP181 evidence boundary

Only evidence present in this checkout and the sanitized current-candidate
record is carried forward. Individual WP176-WP179 package boundaries are not
independently present here; no additional claims are made for them.

- The two-role staging capsule recorded owner publish/read-back, role
  visibility, notification checks, and zero monetary effect. Payment reads
  were rejected and Stripe live mode remained disabled.
- The deterministic fixture alias is `generic-cordless-drill-v1`, seed
  `WP178-VC2026091605`, with SHA-256
  `85458cb5bc4777c587bfb8994ff0f960c8549f5423df9cc33b4c90fc65ffd420`.
  The record contains no raw identifiers.
- Physical Pixel evidence used the 1605 Play candidate. Listing-AI disclosure
  and explicit initiation were observed; the latest warm retry remained in
  the spinner path through the bounded observation window with OCR progress
  but no label completion, callback, typed error, or suggestions. No crash or
  ANR was observed. The fixture was removed, cloud-media selection restored,
  and the owner route restored.
- No evidence authorizes auto-publication, external AI traffic, production
  payment, or a claim that AI functional acceptance passed. Manual listing is
  the safe fallback.

## WP181 fix carried into WP182

The native Listing-AI call now has a deterministic sequential timeout contract:
one, two, three, and four images map to 40, 70, 100, and 130 seconds. A typed
timeout clears busy state, preserves selected inputs, exposes the manual
fallback, and cannot trigger upload, draft analysis, retry, or publication.
Focused tests cover the mapping, a never-returning channel, and a late native
response that cannot overwrite the typed timeout.

## Required successor acceptance

Before any Internal upload, the successor must have an exact source/manifest/
artifact binding, green focused tests, one green full local clean-repro gate,
and a signed AAB/APK whose package, version, SDK levels, upload certificate,
SHA-256, byte size, and ZIP structure all verify. GitHub Regression and CodeQL
must subsequently read back against the exact candidate head. A physical
successor run must show bounded timeout/error text, preserved manual inputs,
and a completed manual listing with independent server read-back. The 1605
candidate remains historical and is not evidence for the successor fix.

## Open items and holds

The successor archive, final regression result, GitHub read-back, and physical
successor proof are pending. Play Console remains unchanged; tester groups and
all other Store settings remain untouched. Production, payment, provider,
Firebase, cloud/VPS/DNS, PR merge, and device-install actions remain out of
scope for this package.
