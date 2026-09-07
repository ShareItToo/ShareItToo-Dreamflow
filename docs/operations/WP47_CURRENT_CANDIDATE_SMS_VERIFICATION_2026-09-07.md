# WP47 — current-candidate SMS verification

Status: **COMPLETE ON THE PHYSICAL PIXEL WITH EXACT CLEANUP**.

## Frozen target

- Worktree: `/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.
- Branch: `codex/master-workflow-20260808`.
- Observation base: `c8cdea763c176e0c6b54cfe4de6724459f20541f`.
- Candidate source: `2fd793bac970866aa94a2940f28d6bbc3e04e377`.
- Candidate: `com.shareittoo.app` `1.0.0+2026090610`, Internal Staging.
- APK SHA-256:
  `07fc3633b3db9a34c3da5d8d67824662bfe3a89f8328c04f93e75860721a4b45`.
- Signing-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The exact installed direct APK, physical Pixel 7 Pro and Staging API binding
were revalidated before the journey. No post-candidate mobile runtime source
change exists.

## Exact acceptance sequence

1. A bounded preflight authenticated the protected synthetic owner, observed
   the Staging Backend phone gate enabled with advertised provider
   `firebase-phone`, and revoked its exact diagnostic session.
2. The current candidate enforced German E.164 input and presented the explicit
   SMS-consent dialog.
3. Exactly one real challenge was requested. The deterministic known-invalid
   code was rejected while the account remained unverified.
4. Walid supplied the current six-digit code through the active SIT task. The
   value existed only in a temporary owner-only file, was never passed as a
   process argument, environment variable, log or repository value, and the
   file and temporary directory were deleted immediately after submission.
5. The immediate result surface did not appear before the diagnostic deadline.
   This was retained as an unproven result, not converted into success or
   rejection, and no second SMS was requested.
6. An independent fresh authentication/readback established server-confirmed
   verified phone truth. A terminated-process cold restart then proved that the
   verified state persisted on the exact candidate.
7. Cleanup observed the exact verified value before mutation, removed it from
   only the isolated Staging test account, confirmed the cleared state through
   both mutation result and independent readback, revoked the diagnostic
   session and restored the protected synthetic owner.

The final owner action is zero. All persisted private state files are mode
`0600` and explicitly contain neither phone number nor SMS code. Repository
evidence contains no account identity, credential, token, number, code, raw
device identifier or private filesystem path.

## Verification baseline

- Thirty-four focused phone-result, privacy and readiness checks pass.
- All 2,415 repository tool tests and the complete local regression pass at
  unchanged technical HEAD `9f5f7761e0ae01cedf282d9ad7cc4eddc8ceff69`.
- GitHub Regression `34120973447` passes all required jobs at that exact
  technical HEAD, including independent clean-checkout reproducibility.
- GitHub CodeQL `34120973588` passes; open code-scanning alerts are zero.
- PR #7 remains Draft, open, mergeable and unmerged.

WP47 changes no application or Backend source. It performs no Firebase Console,
Store, Production, payment, KYC, provider-configuration, deployment,
Cloud/VPS/DNS, OnePlus or PR-merge action. It uses only the already-enabled
Staging phone path and leaves the test account without the temporary phone.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp47-current-candidate-sms-verification-20260907.json`.
