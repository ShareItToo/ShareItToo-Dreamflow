# WP120 — current-candidate auth and session closure

Status: **COMPLETE for Pixel auth/session; OnePlus two-role journey remains
PARTIAL.**

## Bound candidate

All physical claims are bound to signed Internal/Staging candidate
`com.shareittoo.app` `1.0.0+2026091110`, source
`c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b`, APK SHA-256
`711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f7`.
The diagnostic tooling changed after that immutable app build; no app binary,
backend, Firebase or Store artifact was rebuilt or promoted.

## Pixel closure

The physical Pixel completed a direct Staging password change with a durable
pre-mutation rollback journal. The definite success surface appeared, the old
credential was independently rejected, the replacement credential was
independently accepted, cold-start login and Account-A-to-B isolation passed,
and the original credential plus protected owner session were restored. Every
accepted diagnostic session was revoked.

The same candidate then completed the session-control lifecycle: exact initial
two-session server truth, targeted remote-session revocation, revoked-token
rejection, invoking-Pixel preservation, logout-all, server-confirmed empty
truth before independent relogin, cold-start persistence, Account-A-to-B
isolation and protected-owner restoration. Recovery is no longer armed and no
diagnostic session remains accepted.

## Permanent runner corrections

Early fail-closed attempts exposed three runner defects without producing an
application success claim:

- the guest transition was accepted before it survived a cold relaunch;
- the Android keyboard could remain above the password or session-login submit
  action;
- two different physical runs were allowed to use the same synthetic account
  concurrently, creating a legitimate third server session.

Tooling head `380b312dbad593bb87db0eaf16f2e2f3240e2583` fixes these conditions
without a release workaround. Guest truth is checked across a fresh app launch;
the shared keyboard helper reads Android input-method truth and proves the
keyboard hidden after one bounded Back action; and the session inventory waits
only for a server-confirmed exact structure while retaining a private-safe
count-only failure classification. Transport or unstructured responses remain
unknown and fail closed. Physical runs sharing a synthetic principal are now
serialized. Forty-seven focused tests pass.

## OnePlus truth

The OnePlus CPH2581 now has the exact candidate installed data-preservingly.
Package, version, APK hash, signing certificate and Staging binding pass. Its
ShareItToo notification permission and app-specific AppOp are granted.

The fresh two-role replay stopped safely during the owner-publication UI before
publication. No booking, contract, reservation or payment was created. Cleanup
ended and retired the diagnostic listing and server/public readback found zero
matching test listings. Because the Pixel recovery intentionally revoked the
shared synthetic sessions, the OnePlus's visible authenticated surface is not
accepted as exact owner-session truth. The next OnePlus package must first
restore and prove the exact owner and then diagnose the owner-publication UI;
it must not blindly rerun the full journey.

No Production, Google Play, Firebase, VPS/DNS, public registration, real-money,
payment-provider or PR-merge state changed.

Machine-readable evidence:
`docs/evidence/release-readiness/wp120-current-candidate-auth-session-closure-20260912.json`.
