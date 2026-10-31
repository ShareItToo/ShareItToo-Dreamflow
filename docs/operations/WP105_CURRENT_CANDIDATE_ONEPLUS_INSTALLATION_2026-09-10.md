# WP105 — Current-Candidate OnePlus Installation

## Outcome

WP105 installs the exact private Android Staging candidate
`1.0.0+2026091002` on the physically attached OnePlus CPH2581 and proves its
package, version, candidate hash, signing relationship and technical launch.
No account or product action is included in this package.

## Signature boundary and replacement

The OnePlus initially contained Google Play installation `2026090711`. A
data-preserving replace install correctly stopped because Google Play App
Signing and the private candidate's upload certificate are different. The
installed certificate was independently compared before mutation; the
mismatch was confirmed rather than bypassed.

The authorized resolution removed only `com.shareittoo.app`, which reset only
that app's local session and preferences. It did not delete a server account,
server content, another package or other device data. The exact candidate was
then transferred over the private Tailnet, verified before installation and
installed cleanly. The resulting `com.shareittoo.app` reports version code
`2026091002`; launch and bounded crash smoke pass.

The temporary transfer endpoint was stopped and both temporary transfer
copies were deleted. Returning this installation to Google Play delivery will
require replacing it with a Play-signed build; WP105 does not claim in-place
compatibility across the two signing domains.

## Exact bindings

- Candidate source: `fdcfd1dc782c9f9dd3cb766d566abf7363a76cc5`
- APK SHA-256:
  `d0ac7a80232536a4c2f5e1d659b8b9ba4f973581f816142dc6419931742c3637`
- Upload certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`
- Evidence base: `f193a41f3904f96cfc0bcffd6d0a710f7a307c11`
- GitHub Regression `34522790529`: success
- CodeQL pull-request run `34522790549`: success
- CodeQL direct-branch refresh `34525457049`: success
- Current branch and PR-merge open code-scanning alerts: zero

The direct-branch refresh removed two stale open instances whose current
pull-request merge instances were already fixed. No source change or alert
dismissal was used to manufacture that result.

## Remaining truth

The OnePlus exact-candidate install and technical launch are now proven. An
authenticated OnePlus product journey and a simultaneous two-physical-device
cross-account journey remain separate, unexecuted scopes. This is direct APK
delivery, not Google Play split delivery for candidate `2026091002`.

The professional V5.2 document gate, external Listing-AI provider, live
payment, Production, public registration and PR merge remain unchanged.

Machine-readable evidence is in
`docs/evidence/release-readiness/wp105-current-candidate-oneplus-installation-20260910.json`.
