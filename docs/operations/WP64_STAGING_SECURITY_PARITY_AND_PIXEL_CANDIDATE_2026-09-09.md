# WP64 — Staging security parity and Pixel candidate

Status: **COMPLETE ON STAGING, PIXEL, LOCALLY AND ON GITHUB; PLAY INTERNAL
UPLOAD PENDING**.

## Decision and candidate binding

WP63 left one high-value gap before another broad functional package: its
patched Backend and signed Android candidate had not yet been proven together
on the real Staging runtime and physical Pixel. WP64 therefore kept the mobile
bytes immutable and bound these exact components:

- Android `com.shareittoo.app` `1.0.0+2026090902`, source
  `2055a5c508689596c0f776c2cdf38b54f7e106c3`;
- AAB SHA-256
  `b1de03f47d8d185f6cbfe2e28b0db6bd56163e8d1aeeed5f9ebe289a40a3af5c`;
- APK SHA-256
  `a30404283c92c2dd20e231d385af80e2dcbef510c12210a461f5469759f82dd6`;
- canonical upload-certificate SHA-256
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`;
- Staging Backend and technical HEAD
  `7a73de4aba2b4ae4d6785e8dfbd466a5ad5aa60c`.

The candidate source is an ancestor of the technical HEAD. No mobile runtime
file changed after candidate creation. The Backend trees at candidate source
and deployed technical HEAD are identical at
`59c29921d9787ec8bece9a085cfce3aea035d5cc`, so the signed app and deployed
Backend are not being combined across an unreviewed Backend delta.

## CI image publication correction

The first explicit image-publication attempt correctly passed all four
verification jobs but failed before publication because the generated GHCR
path retained uppercase characters from the organization name. Docker image
names require a lowercase repository component. The workflow now normalizes
only that namespace. A deterministic test protects the normalized path and the
founder-independence workflow guard was refreshed. The protected N17 source
hash then failed closed as designed and received only the new exact workflow
hash; no Listing-AI rule or provider gate changed.

Exact workflow-dispatch run `34296797104` passes Backend, PostgreSQL, Flutter,
independent clean-checkout reproducibility and publication of the commit-tagged
API image. PR Regression `34296801776` and CodeQL `34296801791` pass at the
same technical HEAD. The current PR-merge analysis has zero open alerts. PR #7
remains Draft, open, mergeable and unmerged.

## Exact Staging deployment

The server checkout was created from a local `git archive` of the technical
HEAD. The transferred archive is 101,109,760 bytes with SHA-256
`6d0661ce61349e6e5b63d8aad6dd2272cec359b103fb6affc608bf7095f75645`;
the server checkout and decisive source files were hash-verified before use.
The protected environment file was copied without reading or emitting values.

The existing server registry authorization could not read the newly published
private organization package. WP64 did not weaken package visibility, extract
credentials or insert a user token. Instead, the repository-supported
`PULL_RELEASE_IMAGE=0` deployment path built from the exact verified checkout
using the same source/revision/version labels as CI. The resulting runtime
image is
`sha256:1fe0da5c3cddf6db0db91d2b0d0d755b6d8b6df186cc15cc64a792a0bac8384f`,
revision `7a73de4aba2b4ae4d6785e8dfbd466a5ad5aa60c`, version
`0.1.0-7a73de4aba2b`.

Deployment and post-deployment inventory pass:

- API and PostgreSQL are healthy with zero restarts;
- all 354 foreign-key constraints are present;
- rollback image and release evidence are present;
- FCM and SMTP remain enabled;
- Listing AI remains `mock`, externally disabled and budget zero;
- payments remain memory-only and non-live;
- pilot remains `heilbronn_wave0`;
- both protected email-verified roles can authenticate with exact-principal
  checks;
- final public active-listing count is zero.

Readiness remains degraded only because two noncritical Support follow-up
deadlines are overdue. This does not hide a runtime failure; it remains a
separate support-readiness item.

## Physical Pixel proof

The exact signed APK was installed as a data-preserving update on the Pixel 7
Pro. The prior installation and application-data identities remained stable;
the app now reports `1.0.0+2026090902`, minSdk 24 and targetSdk 36. No uninstall,
data clear or downgrade occurred.

The physical surface matrix passes authenticated cold start, all five main
destinations, seven legal documents, five large-text destinations, the 48 dp
minimum touch target, five process restarts, system light/dark application,
four custom background choices, nine account surfaces, Help/Support and the
visible payment/payout provider holds.

The exact two-role product journey also passes:

- two distinct email-verified synthetic roles;
- owner publication through the Pixel UI and server-confirmed active state;
- renter discovery and non-binding request/acceptance;
- truthful Pilot-Simulation presentation to both roles;
- visible chat and Account-A-to-B principal isolation;
- FCM in foreground, background and terminated-process states;
- booking cancellation, listing retirement and protected-owner restoration.

No contract, reservation, payment or real-money movement occurred. Cleanup
left zero public active Staging listings.

A notification screenshot showed the ShareItToo icon and two controlled
ShareItToo update notifications. It also contained unrelated personal device
notifications, so it was deleted immediately after visual review and cannot be
recovered from this work. Only its SHA-256
`b83882642bf709154f065958c54f6186d432f26944f0f41e6decb5c8ca6f3dd4`
is retained; no private device identifier, account identity or screenshot path
is recorded.

## Open technical debt and boundaries

The GHCR pull gap is **OPEN RELEASE-INFRASTRUCTURE TECHNICAL DEBT**. The exact
image is published, but the server has not proven a durable read path for the
private organization package. The local exact-checkout build is valid Staging
evidence, but it is not accepted as a permanent release prerequisite. Before
release maturity, this must be replaced by a least-privilege organization
package-read path or a deliberate package-visibility decision, followed by a
fresh reproducible pull test.

WP64 did not change Production, public Store, Google Play Internal, tester
lists, Firebase project, external Listing AI, Stripe/real payments, VPS/DNS
topology or PR merge state. The next Google Play action may target only the
existing exact `2026090902` AAB after a separate read-only Internal-track
preflight. The superseded `2026090901` artifact remains prohibited from upload.

Machine-readable evidence:
`docs/evidence/release-readiness/wp64-staging-security-parity-and-pixel-candidate-20260909.json`.
