# N29 current-candidate SMS delivery and diagnostic checkpoint

Status: **PARTIAL — SMS delivery and exact Backend acceptance/cleanup proven;
end-to-end UI completion and verified cold restart remain OPEN.**

## Provenance

- Branch: `codex/master-workflow-20260808`.
- Repository HEAD before this diagnostic correction:
  `66f4c61a804306ddb0120d356c9bcd58f1166914`; clean, upstream divergence 0/0.
- Frozen direct-APK candidate: `com.shareittoo.app`, `1.0.0+2026090306`.
- Candidate source: `9d7e2601dc477cf3ae3d469b65448ce2065375e0`.
- APK SHA-256: `37d98f999562150e77fea335fcb0bde32aee20d2183509f5484a5e67cd1e3194`.
- Certificate SHA-256: `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- API: `https://staging.shareittoo.com/api/v1`; physical Pixel 7 Pro only.
- All changes in the original diagnostic checkpoint through
  `8c0a20e76b99e6347c89f8d2b837f96589feebd0` are diagnostic tests and
  documentation, not mobile source changes or a new artifact. A subsequent
  local mobile correction is recorded separately below.

## Observed facts

1. With explicit owner authorization, only the existing Staging Android API
   key's application restriction changed from Android apps to None. All 25
   service/API restrictions remained present on Console readback. The Phone
   provider and Germany-only SMS region policy were confirmed. Production and
   Play were not changed. This is a Staging reCAPTCHA compatibility setting,
   not a production key-restriction recommendation.
2. One SMS was requested and the owner confirmed delivery. The owner supplied
   its code privately for the already open challenge. No second SMS was sent.
3. The UI automation first missed the input because Android exposes an empty
   EditText with the `SMS‑Code` hint (non-breaking hyphen), not a separate
   `SMS-Code` text/description node. The request run was interrupted without
   requesting another message.
4. Code confirmation was attempted against the existing dialog. The UI result
   was not captured as a successful completion. Attempts ended without a
   definitive UI result; do not infer rejection or success from that alone.
5. The subsequent exact cleanup operation passed its mandatory Backend
   precondition: the protected synthetic owner had the exact expected phone
   and `phoneVerified: true`. It then cleared that phone, verified the mutation
   response, read back `phone: null` and `phoneVerified: false`, and revoked
   its exact diagnostic session. This proves Backend acceptance occurred; it
   does not prove the uncaptured UI completion or a verified cold restart.
6. The old cleanup UI assertion failed because it searched globally for
   `Verifiziert`, including the independently verified email. After correcting
   the phone-section selector, physical-Pixel readback returned exactly
   `state: unverified, phoneInputEmpty: true`. An independent authenticated
   Backend read confirmed phone cleared/unverified and email still verified;
   that diagnostic session was also revoked.
7. The protected owner session was restored. Temporary phone/code input files
   and the transient private screenshot were removed. No code, phone number,
   email address, token, key or raw device identifier belongs in repository
   evidence.

## Deterministic corrections and technical debt

- Exact enabled EditText hints support the app's non-breaking hyphen; duplicate
  or unrelated fields fail closed. No coordinate-only workaround is retained.
- Phone truth is scoped between its input and its own verify button. A
  verified phone keeps that button present but disabled. Email truth can never
  satisfy phone truth; a missing or inconsistent surface is `unknown`.
- Device commands have a 30-second subprocess limit. Surface polling has a
  120-second elapsed deadline as well as the attempt bound. A deadline cannot
  promote an unknown result to success.
- Focused regression: 18/18 passing. Full regression and exact remote CI for
  these changes must be recorded after execution; prior-head green runs are
  not evidence for this checkpoint.
- OPEN: determine why the confirmation dialog did not yield an observable
  completion although Backend acceptance succeeded. A stale principal/session
  context or focus/layout issue is only a hypothesis. Do not weaken ownership
  checks or modify the frozen candidate on that basis.
- OPEN: invalid-code rejection and verified-state cold restart on this
  candidate. They were not established by this run. No routine regression may
  send live SMS, and no automatic resend loop is permitted.

## SMS sender branding

The owner observed a generic OTP sender name. Firebase's public SMS
configuration exposes the template as output-only and no configurable SMS
sender-ID field; this is distinct from email sender customization. The exact
carrier route behind the observed label was not independently inspected.
Android documentation separately states that the message-body app-name field
uses the Play name with Play Integrity, but the Firebase project domain for
reCAPTCHA, which is expected for direct APK distribution. Changing the app
name therefore does not establish a branded SMS sender.

Official sources checked on 2026-09-03:

- <https://firebase.google.com/docs/auth/android/phone-auth>
- <https://docs.cloud.google.com/identity-platform/docs/reference/rest/v2/Config#SendSms>

No sender-provider migration, new subscription, production change, payment,
KYC, Play, tester-list, OnePlus, public rollout or PR merge occurred.

## Next bounded work

Close the diagnostic regression first, then reproduce the post-confirmation
UI outcome with deterministic principal/session and dialog tests. Preserve the
accepted/unknown/rejected distinctions. Only after that correction is proven
should a new owner-assisted SMS run establish invalid-code rejection, UI
completion, cold restart and cleanup. N29 must remain PARTIAL until those
facts exist; N28 and earlier evidence remain separate.

## Subsequent technical checkpoint

The original diagnostic commit `8c0a20e76b99e6347c89f8d2b837f96589feebd0`
passed full local technical regression (2,144 repository tool tests, 652
Flutter tests, five expected skips, analyzer zero, Web/Wasm, loopback and
Android debug build). GitHub Regression `33792614070`, including Backend and
clean-checkout jobs, and CodeQL `33792613769` passed on that exact commit.

The next local mobile correction has separate evidence at
`docs/operations/N29_SMS_DIALOG_COMPLETION_CORRECTION_2026-09-03.md`.
It does not retroactively validate UI completion on frozen APK `2026090306`.
