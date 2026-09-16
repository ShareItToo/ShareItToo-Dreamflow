# Google Play Internal Release 2026091605 — Handover

Date: 2026-09-16 22:47 (Europe/Berlin)

## Result

The exact prepared candidate was activated in **Internal testing** for
`com.shareittoo.app` under the authenticated owner Play Console session. The
release is a full rollout and is available to internal
testers. It is not reviewed and was not submitted for review.

| Field | Verified value |
| --- | --- |
| Version name / code | `1.0.0` / `2026091605` |
| Release name | `1.0.0-internal-2026091605` |
| Candidate source commit | `261f05e262fa5aad2238527505cf09319146d583` |
| AAB size / SHA-256 | `138844509` bytes / `d33a37c501d2cb08c5c56a30629b8f031dd2ccccbb87bc8a97c5250ed34392d8` |
| Upload certificate SHA-256 | `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4` |
| API levels / target SDK | `24+` / `36` |
| Release notes | `de-DE`: Interner Staging-Testbuild 2026091605 |

## Readback and boundaries

Before activation, Play showed the prior Internal release `2026090711`, no
candidate draft, Managed publishing **off**, and **14** changes not yet
submitted for review. After activation, the same 14 changes remain unsubmitted
and the review-submission control remains disabled. The tester list **SIT
interner Test** remains unchanged with **2** users. The latest-release overview
shows Internal testing `2026091605` as the latest active release and Closed
testing - Alpha remains at `2026081506`; no competing newer release was
observed. Open testing and Production were not changed. No Store metadata,
Data Safety, Firebase, payment, provider, cloud/VPS/DNS, device, or PR-merge
action was performed.

The complete readback is recorded without tester identities or credentials in
`docs/evidence/release-readiness/wp172-google-play-internal-2026091605-release-20260916.json`.

## Next step

The release is ready for the owner’s device installation and functional
testing. Device installation, sign-in, listing, booking, payment, push and
cross-account flows remain separate test evidence and were not performed by
this Store action.
