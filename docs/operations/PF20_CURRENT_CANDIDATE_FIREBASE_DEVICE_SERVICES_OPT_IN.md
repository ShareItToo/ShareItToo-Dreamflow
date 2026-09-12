# PF20 current-candidate Firebase device-services opt-in preflight

Status: **EXACT-CANDIDATE DEFAULT-OFF PASS — OWNER GATE AND REAL DELIVERY HOLD / NO-GO**

Observed: 2026-08-23

PF20 binds the Firebase device-services consent surface to the exact installed
direct candidate `2026082302`. It opens the authenticated notification settings,
scrolls to `Gerätedienste`, reads the two independent Android switches twice and
returns the app to `Entdecken`.

## Physical result

The Pixel exposed separate controls for Push notifications and voluntary Crash
diagnostics. Both controls were enabled as UI choices and remained switched off
in two consecutive observations. No control was tapped, no consent dialog
opened and the diagnostic requested no opt-in-dependent registration, report or
controlled Crash event.

The installed package remained version `1.0.0`, build `2026082302`, with exact
APK bytes. The read-only path retained no UI hierarchy, screenshot, account
content, identity, credential, network value, raw device identifier or private
path.

## Retained boundaries

PF20 does not enable Push or Crash diagnostics, request an Android notification
permission, send a real Push, trigger the controlled Crashlytics diagnostic,
inspect the Firebase console or satisfy owner terms, deletion, retention, FCM
or Maps-key controls. It does not prove Google Play delivery or Stage A.

The Firebase owner gate therefore remains open. Any later user opt-in,
controlled diagnostic transmission, console action, billing or provider-state
change stays behind its explicit action-time gate.

## Validation

The diagnostic has permanent failure tests for candidate drift, a locked phone,
an already-enabled service, missing independent controls and a state change
between observations. The evidence validator rejects Store/Firebase readiness,
consent, activation, delivery, account mutation or retained-private-data
overclaims. Aggregate setup and execution-board validators require PF20 in the
Firebase lane while external readiness remains `0/11` and Stage A remains
`HOLD / NO-GO`.
