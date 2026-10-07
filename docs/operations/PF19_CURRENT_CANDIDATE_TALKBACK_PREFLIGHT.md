# PF19 current-candidate TalkBack activation preflight

Status: **TECHNICAL PREFLIGHT COMPLETE — RUNTIME GESTURE CONTRACT BLOCKED — HOLD / NO-GO**

Observed: 2026-08-23

PF19 tests the exact signed internal Staging candidate `1.0.0+2026082302` on
the Pixel 7 Pro without treating an enabled accessibility service as a
TalkBack pass. The diagnostic uses Google's documented Android 16+ external
keyboard shortcut, accepts the system authorization control, and then reads
the authoritative Android accessibility runtime state.

## Result

- the exact installed direct APK and candidate identity passed before any
  accessibility change;
- Android authorized the official TalkBack shortcut, started the TalkBack
  process and bound its accessibility service;
- the Android runtime still reported `touchExplorationEnabled=false`;
- therefore no focus, double-tap, navigation or app-action traversal was
  attempted and no TalkBack pass is claimed;
- accessibility enablement, enabled services, touch-exploration state,
  touch-exploration grant list and keyboard-shortcut target list were restored
  exactly to their prior disabled values.

Android's public API contract states that touch exploration is enabled only
when at least one active service requests
`FLAG_REQUEST_TOUCH_EXPLORATION_MODE`. A bound service without that runtime
flag is insufficient. The current Pixel/TalkBack state therefore remains an
external manual-device blocker rather than being bypassed with an unsupported
setting or timing workaround.

Official references:

- <https://support.google.com/accessibility/android/answer/6007100>
- <https://developer.android.com/reference/android/accessibilityservice/AccessibilityServiceInfo#FLAG_REQUEST_TOUCH_EXPLORATION_MODE>

## Safe rerun

```sh
node tool/diagnose_current_candidate_android_talkback_main_navigation.mjs --probe-only
```

The non-probe form proceeds to the bounded five-destination read-only
traversal only if Android reports the runtime touch-exploration contract as
active. Every exit path requires exact restoration. It stores no hierarchy,
screenshot, account content, credential, raw device identifier or network
identifier.

## Remaining gate

Manual TalkBack review, manual visual review, Google Play distribution and the
complete device matrix remain open. PF19 changes no account, booking, message,
Support case, Store, provider, Payment, production, Cloud/VPS/DNS, public,
real-money or merge state.
