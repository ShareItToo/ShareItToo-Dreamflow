# WP258-B Pixel functional smoke — bounded partial result

Captured 2026-09-18 (UTC) on the already installed Play-Internal candidate.
This package used only the authorized Pixel 7 Pro and did not install, replace,
downgrade, sideload, or mutate the Play release.

## Candidate and device binding

- package: `com.shareittoo.app`
- version: `1.0.0+2026091704`
- source commit: `9cbac5be2e4702c6b11954bfcc935ca38fdb6aac`
- API: `https://staging.shareittoo.com/api/v1`
- Firebase configured: yes
- candidate APK SHA-256: `6ae64d64f71ce3de7fd7bd0af9d6ee717f8ff50e0a0eb708bfc9db5b30f5f5cb`
- device: physical Google Pixel 7 Pro, Android API 37

## Verified on device

1. Guest catalog loaded one public Staging listing (`WP254 Green Sonstiges`).
2. Search category chooser exposed `Sonstiges`; tapping it returned to the
   search form with `Sonstiges` selected and a category-removal action.
3. The bounded guest network diagnostic passed: Wi-Fi was disabled only for
   the diagnostic, the UI showed the explicit listings-load error, Wi-Fi was
   restored, Staging reachability returned, and the catalog recovered.
4. No account, listing, profile, booking, payment, provider, Store/Play or
   production mutation occurred.

The raw UI hierarchies were temporary and deleted after each read. No
screenshots, device identifiers, credentials or account data are retained.

## Blocked continuation

The first bounded owner-login attempt reached the Staging API and returned the
structured server result `429 rate_limit_exceeded` (also visible in the
ephemeral Android logcat). The login limiter is a 15-minute window; no retry
loop or limiter workaround was used. Therefore the following items remain
**not evidenced** in WP258-B: authenticated login/logout persistence, owner
listing create/change/delete, renter-vs-owner denial, synthetic profile-image
upload/readback/restart, and account A→B isolation.

This is a temporary external rate-limit blocker, not a functional PASS. It is
recorded as technical debt and must be retried once the bounded server window
has elapsed, without changing limiter policy or using a different authority.
OnePlus remains a separate physical reachability blocker from WP258-A.

## Boundaries

- payment, mail, push, identity/KYC, 2FA, listing-AI provider: not called
- production/VPS/DNS/cloud/Store/Play: unchanged
- PR merge or history rewrite: none
- result: `PARTIAL_BLOCKED_LOGIN_RATE_LIMIT`
