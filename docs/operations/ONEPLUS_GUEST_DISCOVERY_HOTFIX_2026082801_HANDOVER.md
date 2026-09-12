# OnePlus guest discovery hotfix 2026082801 — Handover

Status: **BUILD READY — PLAY INTERNAL UPLOAD PENDING** on 28.08.2026.

## Finding and correction

The OnePlus installation exposed a guest-only discovery failure even though
the public Staging listings endpoint was reachable. The public endpoint
returned HTTP 200, while the authenticated user-blocks endpoint correctly
returned HTTP 401 for a guest. Discovery awaited both calls, so that expected
401 incorrectly converted the whole public catalog into an error.

The correction keeps the public catalog public. Guest and unauthenticated
sessions use only their principal-scoped local block list; authenticated
sessions retain the remote block-list request. Remote block/unblock mutations
still capture their principal synchronously before the first await, preserving
the existing Account-A-to-B isolation contract.

## Exact candidate

- Package: `com.shareittoo.app`.
- Track boundary: Google Play `Internal testing` only.
- Version: `1.0.0+2026082801`.
- Artifact source commit:
  `135fa726aaa7192bd57b729a5e3becbdeeeb9bee`.
- AAB size: `108626931` bytes.
- AAB SHA-256:
  `56f17ee5a788db69c6099cab4a9d648b28e2eeca7dd9c6e162d7247bce0067da`.
- Upload-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`.
- minSdk: `24`; targetSdk: `35`.
- API: `https://staging.shareittoo.com/api/v1`.

The private archive is owner-only and outside Git. Independent validation
confirmed the exact archive hashes, package identity, canonical signature,
privacy scan, ZIP integrity and Bundletool 1.18.1 structure. Firebase Android
configuration is present without copying values into evidence.

## Verification before Store action

Fourteen focused guest/principal-isolation Flutter tests, changed-file analysis,
33 affected RW ratchet tests and the complete local CI-profile regression
passed. Artifact-source HEAD passed exact GitHub Regression `33208564193`,
including clean-checkout reproducibility, and CodeQL `33208564198`; open code
scanning alerts were zero. PR #7 remained Draft and unmerged.

The local artifact-aware regression originally depended on a historical
private Play AAB. The permanent candidate-rollover path now requires the exact
newer private candidate bytes before historical Play metadata may be accepted;
it does not introduce a missing-artifact waiver, retry, reduced parallelism or
timing dependency.

## Play and live boundaries

At build time, `2026082601` remained the active Internal release and
`2026082801` had not been uploaded or activated. The existing owner approval is
limited to uploading and activating this exact hash in Internal testing. No
tester-list, Production, Open testing, Closed testing, review submission,
Firebase project, payment, provider, Cloud/VPS/DNS or PR-merge change is part
of this handover.

After Internal activation, the OnePlus must receive `2026082801` through
Google Play before guest Discover is retested. Until that readback and device
test occur, the correction is code- and artifact-verified but not yet
physically confirmed on the affected phone.
