# WP13 — phone verification current-candidate checkpoint

Status: **PARTIAL — fresh owner SMS request required** on the exact frozen
Pixel Staging candidate. The submitted code was used exactly once but did not
produce a server-confirmed verified state. It was deleted immediately and is
not present in Git, logs or retained evidence.

## Exact candidate and truthful result

The installed Pixel 7 Pro package remains exactly `com.shareittoo.app`
`1.0.0+2026090503`, frozen at source
`96b97b55983111d9e0ae8d8fcc91e9e241a2cb6f`. The private archive APK SHA-256
is `ff9f0527c73cc7ba7abf31c1fa478c061f292e7b7cd485500959dfe12205ef57`
and its signing-certificate SHA-256 is
`098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.

The authoritative current observation is:

- phone verification is not confirmed;
- a fresh SMS request is required before another confirmation attempt;
- no reconciliation or backend cleanup is required;
- no SMS was requested automatically after the failed confirmation;
- no phone number or code is stored in repository evidence; and
- the protected synthetic owner session was restored on the Pixel.

The owner-only local state file is mode `0600` and has SHA-256
`6240ee2114d0eadff9593ce0b9c68d6a763eac2c125184316ec1559323785b96`.
Its path and private contact input remain outside Git.

## Evidence-truth correction

Before implementation commit
`990375dce4695c1d69081cb0f19db4a303dee37f`, an attempted confirmation could
leave the previous `awaiting-owner-sms-code` state behind. The diagnostic now
writes explicit in-progress and submitted-but-unproven states before waiting,
classifies verified, rejected, unverified and unknown observations, and
requires a fresh request after an unconfirmed result. A transport or UI error
can no longer appear as a verified phone or as an unused code window.

Complete local regression and exact clean R10 pass at that implementation
commit. The clean proof produced two byte-identical 231,344,559-byte APKs with
SHA-256 `bc9bd8a7689548c685608eb59ffa7c74e82c9099c9f4fee0f79113d534317ee1`
and 794 identical entries. Private R10 report SHA-256:
`2cd24e9f633589b7011b8d90b6b89ca92e64c7535f0d0e89d5f4a7d3421def12`.
GitHub Regression `33964425617` and CodeQL `33964425640` pass; open
code-scanning alerts are zero. PR #7 remains Draft, open and unmerged.

WP13 must not be reported as complete until a newly requested code is accepted
and the verified state, cold restart and cleanup are all re-proved on the exact
candidate. No further SMS should be sent without that bounded owner step.

Sanitized structured evidence:
`docs/evidence/release-readiness/wp13-phone-verification-current-candidate-checkpoint-20260905.json`.
