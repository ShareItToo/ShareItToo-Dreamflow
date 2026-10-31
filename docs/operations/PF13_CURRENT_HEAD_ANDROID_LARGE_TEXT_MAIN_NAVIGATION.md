# PF13 current-head Android large-text main navigation

Status: **BOUNDED AUTHENTICATED 200% REACHABILITY PASS — MANUAL VISUAL, TALKBACK, STORE AND STAGE A HOLD / NO-GO**

Observed: 2026-08-23

PF13 proves that all five authenticated primary destinations remain reachable
on the authorized Pixel with the Android system font scale set to `2.0`. It is
bound to the exact PF6 direct-installed candidate and restores the previously
observed system setting exactly after success or failure.

## Source-bound diagnostic

The command requires `--current-head`, accepts only an optional ADB binary,
refuses a locked device and verifies the installed APK bytes and version before
changing the font scale. It records the prior setting, applies at least 200%,
opens Entdecken, Mietkorb, Buchungen, Nachrichten and Mein SIT and verifies
sanitized static surface markers. Bounded ordinary scrolling is allowed so
markers displaced below the viewport by large text remain testable.

The diagnostic returns the app to Entdecken and restores the exact prior font
scale in a `finally` path. Focused tests prove restoration after target-scale,
navigation and restoration failures. The independent post-run device query
also returned the original `0.85` value.

## Physical-device drift

The current device reported Android 17, API 37 and security patch 2026-07-05.
Earlier PF6–PF12 observations remain historical Android 16/API 36 evidence.
PF13 records the new current facts without rewriting those observations. Codex
did not start or authorize an operating-system update.

## Remaining scope

This is semantic reachability evidence, not a screenshot-based or human visual
judgment that every layout is unclipped or aesthetically correct. TalkBack was
not enabled or traversed. No booking, message, cart, account, login or logout
action occurred; no UI hierarchy, screenshot, account identity, credential,
token, review account, private path, network identifier or raw device
identifier was retained.

The candidate remains a direct APK. Google Play delivery, manual accessibility
review, the broader device matrix and Stage A readiness remain open. No
live/public/provider boundary changed and P0B remains `HOLD / NO-GO`.
