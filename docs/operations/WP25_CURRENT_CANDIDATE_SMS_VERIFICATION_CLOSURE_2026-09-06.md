# WP25 current-candidate SMS verification closure

## Outcome

WP25 is **COMPLETE ON THE PHYSICAL PIXEL** for the exact signed Internal
Staging candidate `1.0.0+2026090606`, source commit
`637c80d0086f7ad1aa08fe5ba1df5c1624b3e545`. The Staging Firebase phone
provider was available, German-number input and SMS consent were enforced, a
known-invalid code was rejected, and two bounded owner SMS challenges were
requested. The first, already-aged owner code remained unverified and correctly
required a fresh request. The second owner code was accepted server-side and
the verified state persisted through a terminated-process cold restart.

The temporary verified phone was then removed from the isolated Staging test
account. Both the cleanup mutation and an independent readback confirmed the
cleared state. Diagnostic sessions were revoked and the protected synthetic
owner remains available. No phone number, SMS code, credential, token, raw
device identifier or private filesystem path is retained in repository
evidence.

## Exact candidate

- Package: `com.shareittoo.app`
- Version: `1.0.0+2026090606`
- Source: `637c80d0086f7ad1aa08fe5ba1df5c1624b3e545`
- APK SHA-256:
  `20f1f5ab7c49030e7412166c81b439d9824f1955dc0dac750d55f2f75a6129a2`
- Upload-certificate SHA-256:
  `098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4`
- API: `https://staging.shareittoo.com/api/v1`
- Device: physical Google Pixel 7 Pro, Android 17 / API 37

The installed package, version, candidate source and APK bytes matched the
private signed archive before the phone journey. No new candidate was built or
installed for WP25.

## Result semantics and recovery proof

The first confirmation automation did not receive its immediate sanitized
result surface before timeout. That timeout was deliberately retained as
`sms-confirmation-submitted-result-unproven`; it was not treated as success or
safe rejection. Fresh authentication then showed an unverified state, so one
new challenge was required and requested.

The second confirmation also did not expose its immediate result surface. It
again remained unproven, and no third SMS challenge was requested.

A fresh authenticated observation then established the authoritative result:

- the backend/UI state was verified;
- the valid-code outcome survived a terminated-process cold restart;
- the diagnostic session was revoked; and
- no owner action remained.

This is the required reconciliation path for an ambiguous transport or UI
result. It proves that a missing immediate response cannot become a false
failure message and cannot leave the diagnostic assuming that an SMS challenge
is still unused.

The final cleanup separately proved that the exact verified phone was cleared
by the Staging mutation and absent on readback. The cleared state was also read
through the current candidate. The submitted code existed only in a temporary
mode-`0600` local file and that file and its directory were deleted immediately
after the confirmation attempt.

## Deterministic coverage and regression

Fifty-four focused result-semantic, diagnostic-observer and principal/epoch
checks pass. They cover definite rejection, accepted-but-local-cleanup failure,
unknown transport outcome, retry-state clearing, late Account-A results,
Account-B dialog ownership, current-attempt observation, private-input
validation and exact Staging cleanup.

The unchanged candidate already passes the complete local technical
regression, signed archive validation, exact GitHub Regression `34022203378`
including independent clean-checkout reproducibility, and CodeQL
`34022203376`. The immediate documentation base
`cf9cc20b8866341257bcd1ab1dfe1efb5c88f9e3` also passes GitHub Regression
`34027057113`, including independent clean-checkout reproducibility, and
CodeQL `34027057160`.

The current PR head and PR merge refs expose zero open code-scanning alerts.
Six direct-branch alert records remain attached only to the older scanned
commit `f17364fc96c3902c5bf9d434f7132e357e290837`; none has an instance at the
current PR head, so they are not represented as current candidate findings.

## Boundaries

WP25 changed only the isolated Staging phone-verification test state and then
restored it. It did not change application source, Firebase configuration,
Google Play, tester lists, Production, public registration, payment, Stripe,
external Listing AI, Cloud/VPS/DNS, OnePlus or PR merge state. No payment
endpoint was called and no real money, KYC or paid service was used.

Machine-readable sanitized evidence:
`docs/evidence/release-readiness/wp25-current-candidate-sms-verification-closure-20260906.json`.
