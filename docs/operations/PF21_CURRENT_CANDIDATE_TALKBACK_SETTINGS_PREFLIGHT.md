# PF21 current-candidate TalkBack Settings preflight

Status: **TECHNICAL PREFLIGHT COMPLETE — SECOND OFFICIAL ACTIVATION ROUTE BLOCKED — HOLD / NO-GO**

Observed: 2026-08-23

PF21 tests the exact signed internal Staging candidate `1.0.0+2026082302` on
the Pixel 7 Pro through the user-visible Android Settings route rather than
the external-keyboard shortcut used by PF19.

## Result

- Android Accessibility Settings exposed the TalkBack row, `Use TalkBack`
  control and system authorization dialog;
- the system authorization completed, enabled TalkBack, started its process
  and bound its accessibility service;
- both the secure state and Android accessibility runtime still reported no
  touch exploration and no touch-exploration grant;
- therefore no focus, double-tap, navigation or app-action traversal was
  attempted and no TalkBack pass is claimed;
- the five relevant accessibility values were restored exactly and the app
  returned to `Explore`.

The installed TalkBack service metadata declares that it can request touch
exploration. Android's public API contract still requires the active service
to request `FLAG_REQUEST_TOUCH_EXPLORATION_MODE`; capability alone is not a
runtime pass. Two distinct official activation paths now reproduce the same
external Pixel/TalkBack runtime blocker. PF21 does not bypass it with a direct
secure-setting grant, timing dependency or invented manual result.

Official references:

- <https://support.google.com/accessibility/android/answer/6007100>
- <https://developer.android.com/reference/android/accessibilityservice/AccessibilityServiceInfo#FLAG_REQUEST_TOUCH_EXPLORATION_MODE>

## Safe rerun

```sh
node tool/diagnose_current_candidate_android_talkback_settings_main_navigation.mjs --probe-only
```

The non-probe form traverses the five primary destinations only if Android
reports runtime touch exploration active. Every diagnostic exit requires exact
restoration. It retains no raw hierarchy, screenshot, account content,
credential, raw device identifier or network identifier.

## Remaining gate

Manual TalkBack review, manual visual review, Google Play distribution and the
complete device matrix remain open. PF21 changes no account, booking, message,
Support case, Store, provider, Payment, production, Cloud/VPS/DNS, public,
real-money or merge state.
