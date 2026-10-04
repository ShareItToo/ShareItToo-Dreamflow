# WP145 — OnePlus current-candidate two-role closure

Status: **PHYSICAL ONEPLUS AND CROSS-DEVICE TWO-ROLE PASS**.

## Outcome

The physical OnePlus CPH2581 now runs the exact signed Internal/Staging
`1.0.0+2026091312` candidate already proven on the Pixel. Package, version,
APK digest, signing certificate, Firebase profile and Staging API binding are
exact. The update preserved app data; no uninstall, package reset or local data
clear occurred.

The complete sanitized journey passed with two distinct previously verified
synthetic principals. It proves owner publication through the OnePlus UI,
server-confirmed public discovery, renter request, non-binding acceptance,
chat visibility, foreground/background/terminated-process FCM, Account A-to-B
isolation, cancellation, listing retirement and protected-owner restoration.

## Preflight correction

The first data-preserving install completed on Android but emitted normal ADB
progress before the terminal `Success` line. The original runner misclassified
that output and stopped before product mutation. A second preflight then proved
that an authenticated session cannot be assumed after an update. The runner
now accepts only a terminal success without any failure marker, independently
re-verifies the installed candidate and establishes the exact protected owner
before Push inspection. Deterministic positive and negative tests cover both
causes; no timing workaround remains.

## Cleanup and privacy

The exact transferred source remains one retired, owner-only vault with no
active source or unsafe entry. All seven product-journey vaults are retired and
safe, and the dedicated private artifact root has no unsafe entry. Account
identities, credentials, tokens, fixture identifiers, raw device identifiers
and private paths are absent from committed evidence.

The broader MacBook QA inventory contains unrelated historical entries and is
not used to support this closure. It was not modified by WP145.

## Verification and portfolio

Eleven focused runner tests, three WP145 closure checks and twenty combined
WP143/WP144/WP145 checks pass.
Implementation HEAD `ec95dbe3da3d430ba91df949155275b68d056948`
passes GitHub Regression `34785361712`, independent clean checkout, CodeQL
`34785361710` and zero open code-scanning alerts. The final documentation head
must pass the same exact-head GitHub gates before closure is reported.

The 32-area portfolio advances from **21 PASS / 4 PARTIAL / 7 OPEN** to
**22 PASS / 4 PARTIAL / 6 OPEN**. `oneplus-cross-device-two-role` is now PASS.

No payment endpoint, Stripe provider traffic, money, contract, reservation,
Production, Google Play, public registration, Pixel action or PR merge occurred.
Machine-readable evidence is in
`docs/evidence/release-readiness/wp145-oneplus-current-candidate-two-role-closure-20260914.json`.
