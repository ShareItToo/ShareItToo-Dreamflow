# WP125 — push registration recovery and exact-session ownership

Status: **SOURCE COMPLETE; physical successor-candidate replay pending.**

## Trigger and evidence boundary

On the OnePlus, visible push opt-in and Android notification permission were
enabled, but one controlled foreground Staging probe produced no foreground
banner. Read-only backend evidence showed two registrations, but the available
privacy-safe inventory could not bind either row to that activation. The exact
device-side cause therefore remains unknown. A transport interruption around
the registration response is plausible, but is not treated as proven.

The OnePlus was cleaned up and disconnected before this closure. No later
device action or success claim is included here.

## Proven client defects

The source audit did prove that the client could persist visible opt-in and
return success even when backend registration failed. It also proved that:

- the token-refresh listener was installed only after the first token request
  succeeded;
- registration was not retried after authenticated realtime recovery or app
  resume;
- backend registration and pending cleanup were not bound to the exact
  principal and authentication epoch;
- a delayed push-consent outcome was not owned by the exact dialog route and
  could cross an Account-A-to-B transition.

These defects explain how visible opt-in could coexist with unconfirmed push
delivery. They do not prove which individual failure occurred on the OnePlus.

## Permanent correction

Implementation head `a695306350bd868eda64fb9af8b388ed61923578`
introduces one epoch-bound serial operation queue for opt-in, opt-out, recovery
and token refresh. Backend mutations capture the exact session owner and epoch
before their first asynchronous boundary and reject drift before and after the
remote call. Pending backend cleanup is stored only with an opaque exact-owner
token and can never delete a successor account's registration.

The token-refresh listener is now installed before the initial token request.
Registration retries on app resume and authenticated realtime readiness.
Transport or backend failure retains the user's visible opt-in preference but
is reported as delivery not yet safely connected; it is never presented as a
confirmed registration. Push consent and result dialogs use exact route
handles, so an A-to-B transition can close only A's dialog and suppress A's
late result without touching B's UI or navigation.

## Verification

- focused analyzer: zero issues;
- focused Flutter tests: 37 passed;
- focused repository wiring tests: 22 passed;
- full scoped local technical regression: passed, including analyzer,
  Flutter, Web/Wasm, loopback smoke and Android debug build;
- privacy and retention/deletion validators: passed without promoting their
  intentionally closed external gates;
- exact implementation-head GitHub Regression `34700596400` and CodeQL
  `34700596346`: recorded in the machine-readable evidence after completion;
- open branch code-scanning alerts at the implementation head: zero.

## Remaining physical proof

The immutable installed candidate remains `com.shareittoo.app`
`1.0.0+2026091110`, source
`c8e2a49e14f5cae0026fa5f2bc327859fe0ff17b`, APK SHA-256
`711f058c113bd714abb1e4bcedf05d62a382004e1bf9882f6d85d04b876dd0f7`.
It does not contain WP125.

The next bounded package must create a strictly higher signed Internal/Staging
successor from the final clean source head and replay push activation,
transport recovery and Account-A-to-B isolation on the Pixel. A later OnePlus
retest is useful but not required while the owner has the phone disconnected.
Until that physical replay passes, delivery success is not claimed.

No Production, Google Play, Firebase, VPS/DNS, public-registration, payment,
real-money or PR-merge state changed in WP125.

Machine-readable evidence:
`docs/evidence/release-readiness/wp125-push-registration-recovery-20260912.json`.
