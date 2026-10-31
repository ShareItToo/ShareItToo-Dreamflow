# WP113 — Current-Candidate Staging and Pixel Privacy Closure

## Result

The signed Internal/Staging candidate `com.shareittoo.app`
`1.0.0+2026091110`, source
`c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b`, is installed on the physical
Pixel 7 Pro by a verified data-preserving update. Exact APK bytes, canonical
upload signature, package, version, first-install time and application-data
identity all pass.

Staging now serves immutable Backend head
`df39a14b7a19afe467842461a28f1e77fec8445e`. The API and database are healthy
with zero container restarts. FCM and SMTP remain enabled; payments remain the
memory simulation with Stripe live mode false; Listing AI remains Android
on-device with external provider execution false. Readiness is degraded only
by the previously known non-critical support follow-ups.

## Physical privacy proof

The Pixel generated a real password-confirmed account export for the owner of
an active non-binding two-role conversation. An incorrect password was rejected
before Android sharing. The correct export was delivered exactly once to a
temporary no-network, no-external-storage test receiver and validated locally.

- The root and all six local sections belong to the exact current principal.
- No foreign account email and no foreign opaque identifier outside explicitly
  shared operational records appears.
- No credential-shaped field appears. The full raw export was neither printed
  nor retained.
- The temporary receiver, its private data, temporary build and probe sessions
  were removed; the protected owner session was restored.

The diagnostic now permits the active state only when it is the exact
non-binding, non-reserving, zero-payment simulation. All other active or
ambiguous states remain fail-closed. The direct-update guard was also corrected
to treat `backend/test/` as test-only while continuing to reject changes under
mobile or Backend runtime paths.

## Verification and boundaries

The pre-deployment technical head passed the complete local regression, GitHub
Regression `34627911500` including independent clean checkout and API-image
publication, and CodeQL `34627908397`. The diagnostic hardening is separately
verified at implementation head
`1d053ff28122aefb3e3b0dd618e356c870ebfb7f`; its final local/GitHub conclusions
are recorded in the machine-readable evidence after completion.

No Production, Google Play, tester list, Firebase project, OnePlus, binding
contract, payment endpoint, real money or PR merge changed. Machine-readable
evidence is in
`docs/evidence/release-readiness/wp113-current-candidate-staging-pixel-privacy-20260911.json`.
