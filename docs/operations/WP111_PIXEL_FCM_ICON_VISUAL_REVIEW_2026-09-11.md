# WP111 — Pixel FCM Icon Visual Review

## Result

The exact private notification-shade capture from the WP110 Pixel journey has
passed visual review. Its SHA-256 is
`736561d7d8c01bc0e4c19b0ec8fb547a6c1c3cf24e28e700a8cc1784a04ca89f`,
matching the committed WP110 evidence for signed Internal/Staging candidate
`com.shareittoo.app` `1.0.0+2026091109`.

Two visible ShareItToo notification cards contain the correct teal ShareItToo
brand mark on a white circular card surface. The mark is clear, centered and
recognizable; it is neither blank nor replaced with a generic placeholder and
has no visible clipping or deformation. The German notification title and body
are legible. The capture also contains unrelated private notifications, so the
image remains owner-only and is represented in the repository solely by its
hash and sanitized observations.

The compact icon row contains multiple unrelated applications and is therefore
not used to attribute any one glyph to ShareItToo. Instead, the Android package
binding is checked independently: the manifest declares
`@drawable/ic_stat_shareittoo_v2` as Firebase's default notification icon, and
all five density-specific resources are transparent, centered ShareItToo
silhouettes at the required dimensions. This review makes no unsupported claim
about an unrelated glyph in the aggregate icon row.

## Boundaries

No new push was sent, no notification or personal content was cleared, no
device setting changed and the Pixel candidate was not rebuilt or reinstalled.
No private screenshot, account identity, notification text from other apps,
device identifier or filesystem path is committed. OnePlus, Store, Production,
Firebase, payment/provider, VPS/DNS and PR state remain unchanged.

Machine-readable evidence:
`docs/evidence/release-readiness/wp111-pixel-fcm-icon-visual-review-20260911.json`.
