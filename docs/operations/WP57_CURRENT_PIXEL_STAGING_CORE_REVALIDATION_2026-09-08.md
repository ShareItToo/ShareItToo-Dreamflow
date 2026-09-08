# WP57 — Current Pixel Staging core revalidation

Status: **PHYSICAL AND LOCAL MATRIX COMPLETE; GITHUB CLOSURE PENDING**.

## Exact candidate and runtime

- Physical device: Pixel 7 Pro, Android 17 / API 37, security patch
  `2026-07-05`; no raw device identifier is retained.
- Installed candidate: `com.shareittoo.app` `1.0.0+2026090711`, source
  `c819c5f4445d0b998b2ee319e64f8c95cfb01eda`, Internal Staging.
- Installed APK SHA-256:
  `eb74c3978a347412d0cc104973ff8c3f90cb796334d54ea26c3dcc91ef943407`.
- Upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- API: `https://staging.shareittoo.com/api/v1`; deployed Backend source
  `d8d1df7f59052c202f824f759693a472b6b8afa1`.
- Forty-two repository paths changed after the candidate source, but none is
  mobile application source. No rebuild, reinstall, downgrade or data reset was
  used for WP57.

## Physical results

The read-only surface matrix passed authenticated cold start, all five main
destinations, seven legal-document entries, large-text navigation, the 48-dp
minimum touch target and five process restarts. The exact previous font scale
was restored.

The first two-role attempt ended safely because the foreground FCM banner did
not appear. Its isolated listing and non-binding simulation were retired and
the owner role was restored. The follow-up diagnosis proved the Android
notification permission granted while the app's separate voluntary
`Push-Mitteilungen auf diesem Gerät` choice was off; Crashlytics was also off.
This was the expected privacy state after an earlier account-deletion test:
the runtime does not register or deliver FCM while that app-level choice is
off.

The owner had explicitly requested transactional push testing. Push was
therefore enabled only through the app's real disclosure and confirmation
dialog. Crash diagnostics remained off. The unchanged journey then passed:

- two distinct, already email-verified synthetic Staging principals;
- owner draft publication through the Pixel plus server and public-catalog
  confirmation;
- renter discovery, non-binding request and acceptance;
- owner and renter `Pilot-Simulation` truth;
- renter-visible chat and Account-A-to-B isolation;
- FCM in foreground, background and terminated-process states;
- booking cancellation, listing retirement, public removal and protected-owner
  restoration.

The notification-shade capture showed the recognizable ShareItToo icon. It
also contained unrelated personal notifications, so it was treated as
sensitive, never committed or distributed and deleted immediately after
review. Only its SHA-256
`ac7adbddce16348d881c82508bc9711a914d6d735b603e7ee6e50a7f9830ddb2`
is retained.

The bounded guest-network matrix subsequently passed a signed-out Guest state,
server-confirmed empty catalog truth, explicit offline failure, validated WLAN
restoration and online recovery. The original owner session was restored in a
`finally` path. Final public readback shows zero active listings and zero
technical fixtures; every new isolated vault is owner-only and retired.

The three focused diagnostic suites pass `17/17`. The complete local release
regression also exits successfully through the repository's approved dedicated
APFS cache profile. It includes the `909`-test Flutter suite, randomized
principal/epoch and security suites, Web/Wasm compilation, loopback-only web
smoke, Android metadata validation and the Android debug build at minSdk 24.
No cache, timing, rate-limit or test-parallelism workaround was introduced.

## Boundaries and remaining scope

WP57 created no contract, reservation, payment or monetary effect. It changed
no Production, Google Play, tester list, Firebase Console, provider, Cloud,
VPS/DNS or PR state and did not contact OnePlus. The protected source-account
vault remained the read-only source for isolated copies; no account identity,
credential, token, private QA-artifact path or fixture identifier enters
repository evidence. The requested repository worktree path is retained.

This closes the exact direct-APK Pixel Staging core, not Google Play split
delivery, binding V5.2/legal acceptance, real payment, external Listing AI,
Apple/Facebook authentication, manual TalkBack exploration or the later
OnePlus lane. Machine-readable evidence is
`docs/evidence/release-readiness/wp57-current-pixel-staging-core-revalidation-20260908.json`.
