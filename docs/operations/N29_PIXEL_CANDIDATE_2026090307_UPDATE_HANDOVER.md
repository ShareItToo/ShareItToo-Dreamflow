# N29 — Pixel candidate 2026090307 update and no-SMS checkpoint

Status: **BUILD / DATA-PRESERVING UPDATE / NAVIGATION / PHONE PREFLIGHT PASS;
REAL SMS COMPLETION OPEN**. Observed 2026-09-03.

## Exact candidate

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Clean build source: `77d5103cb3c89af3ca5187a6c2642e28fa0703dd`.
- `com.shareittoo.app`, `1.0.0+2026090307`, direct signed release APK.
- APK: 135,958,847 bytes; SHA-256
  `821a60f7d45fdabaec81434eda39b61c3700e640761cdc53d180467218299ad4`.
- AAB: 109,179,370 bytes; SHA-256
  `eef5c327d548682ffcd14df0eb882c99d2490c53c02ba81564377b5df366b763`.
- Canonical certificate, verified on APK and AAB:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- Owner-only archive:
  `/Users/walidchraibi/Library/Application Support/ShareItToo/release/android/2026090307-77d5103cb3c89af3ca5187a6c2642e28fa0703dd`.
  Exact artifact filenames contain version and full source commit; manifest
  and privacy report are the only two other files. All four were read back.
- API `https://staging.shareittoo.com/api/v1`, protected unchanged
  `shareittoo-staging` Firebase configuration, internal `heilbronn_wave0`
  non-binding envelope. Google enabled; Apple/Facebook still disabled.

The builder passed AAB JAR-signature and APK-signature verification, identity
and binary privacy checks. Bundletool 1.18.1 structural validation passed.
The release APK is not debuggable; backup and cleartext are disabled. minSdk
24 and targetSdk 36 match. Fourteen permissions match the retained exact
contract; exported component count is eight and the component/permission
surface matches the previous release. No signing or provider change occurred.

## Technical and device evidence

Exact candidate-source GitHub Regression
[33797592791](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/33797592791)
passed Flutter, Backend, PostgreSQL fresh/recovery and independent clean
reproducibility. API-image publication was skipped. Exact CodeQL
[33797592920](https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/33797592920)
passed. Full local candidate regression had 2,144 tool passes, 662 Flutter
passes and five expected skips, analyzer zero, profile suites, Web/Wasm,
loopback and Android. Pure evidence commits after this source do not rebind
the frozen artifact or transfer old device results to new mobile source.

Physical Pixel 7 Pro, Android 17/API 37, received a strictly increasing
`2026090306 -> 2026090307` replace update. Before and after certificates match;
installed APK bytes exactly match the new archive. First-install timestamp
and credential-encrypted data-directory identity were retained. No uninstall,
data reset or downgrade occurred. Foreground launch passed.

The current-candidate diagnostic then passed authenticated cold launch and
all five read-only destinations: Entdecken, Mietkorb, Buchungen, Nachrichten
and Mein SIT. It returned to Entdecken. This is navigation evidence, not a new
claim that all rental, support, AI or payment actions were exercised.

Phone preflight on the exact installed artifact reports Staging phone backend
available with `firebase-phone`. Its temporary diagnostic session was revoked.
No new SMS was requested; phone truth was not changed. Actual provider Console
state and region policy were not independently reread by this preflight.

Machine evidence:
`docs/evidence/release-readiness/n29-pixel-update-preflight-2026090307.json`.

## Owner dependency, risks and next step

Fresh-code invalid rejection, valid-code UI completion, verified cold restart
and exact phone cleanup remain OPEN. Historical 2026090306 delivery and backend
cleanup do not prove these requirements on 2026090307. No old code is reused.

Correction from the subsequent readback: the first Enter-and-close action left
the SMS message as a Telegram draft; it did not prove sending. In the verified
ShareItToo Chrome profile that draft was replaced with one combined owner
request for `SMS bereit`, Meta developer terms/account confirmation and Apple
Developer sign-in, with no membership purchase. The enabled Send button was
then explicitly clicked and the tab immediately closed without reading the
bot reply. Relay success and watch delivery remain unverified. Do not send
duplicate notifications or request unattended SMS. See
`WP02_PROVIDER_READINESS_2026-09-03.md` for the read-only provider findings.

When the owner is available, verify this frozen archive/device again, use one
fresh code window and retain typed rejection/unknown/known-confirmation
semantics. Private phone state/evidence belong outside Git in the build-specific
QA directory. Restore the protected test owner and verify cleanup afterward.
Independent preparation may continue, but WP01 must not be marked complete.

Host recovery and the still-visible Kotlin metadata diagnostic remain OPEN
in `N29_BUILD_HOST_DEBT_2026-09-03.md`; neither is closed by a successful retry.
Source rollback is a reviewed revert followed by a new higher-version signed
candidate if needed. The old private archive remains preserved, but no
destructive downgrade or data-clear is authorized as an automatic rollback.

No OnePlus action, Play upload/release, production change, Firebase-console
mutation, payment, KYC, real money, public registration or PR merge occurred.
