# WP70 — current-candidate auth, safety and provider hold

Status: **IMPLEMENTED; LOCAL AND GITHUB VERIFICATION PENDING**.

## Bound candidate

- Branch: `codex/master-workflow-20260808`.
- Package base: `18f10097d6872f012360d648764614cc314fe809`.
- Android source: `12b88cf97f91973d6dfd59fe3f4dcb9c915dc7d0`.
- Candidate: `com.shareittoo.app` `1.0.0+2026090904`, Internal Staging.
- Staging runtime: `78c663248aec089b08d19fd0fb40a9a63f19408b`.

No mobile or Backend runtime path changed after the candidate source. The
Pixel remained the only contacted device. The OnePlus was not contacted.

## Physical result

The exact candidate completed the following isolated Staging lifecycles:

- password change with definite server/UI success, old-credential rejection,
  replacement login, local-session clearing, cold login, A-to-B isolation and
  rollback to the original synthetic credential;
- two-session inventory, remote-session revocation, invoking-Pixel
  preservation, logout-all, server-confirmed empty truth, independent relogin,
  cold start and explicit recovery cleanup;
- fresh e-mail registration with all four consent controls, transactional
  verification delivery, confirmation without exposing the action token,
  Backend verification, Pixel login and cold-start persistence;
- password recovery with existence-neutral request, transactional delivery,
  confirmation without exposing the action token, exact structured rejection
  of the old password, new-password Pixel login and cold-start persistence;
- second-use rejection of both consumed links with the exact structured
  application errors, excluding timeouts and intermediary/unstructured errors
  as proof;

Separately, an authenticated direct Staging diagnostic completed isolated
non-binding listing activation, request/accept/chat, report creation/readback,
private no-store export, block/unblock and chat restoration, followed by
booking cancellation and public-listing retirement. This proves Backend and
state isolation but is not represented as a physical Pixel UI submission.

All diagnostic sessions were revoked. Temporary blocking state is empty, the
public diagnostic listing is gone, and the protected owner session is restored.
The synthetic moderation report remains intentionally retained as audit
history. The fresh synthetic account is retained privately for the later
account-deletion lifecycle; it has no surviving diagnostic session.

## Payment and payout hold

All nine authenticated account surfaces plus Help and Support remain reachable.
The exact current UI visibly holds both payment methods and payout methods in
Staging. No payment endpoint, payout onboarding, Stripe provider, contract,
reservation or money path was called. This proves truthful fail-closed UI, not
Stripe readiness.

## Closure impact

The WP69 requirements for e-mail registration/recovery and
password/session/account-switch isolation are now `PASS` on the exact current
candidate. Report/block remains `PARTIAL`: its authenticated Staging lifecycle
and cleanup pass, while a physical Pixel UI submission is not claimed. Privacy
export/account deletion also remains `PARTIAL` because deletion is intentionally
separate. Stripe sandbox payment/refund/simulated payout remains `OPEN` pending
official owner test-platform setup.

Two harmless operator errors are retained as technical debt: a first
read-only inspection selected the current-head archive validator and stopped
before mutation, and a first direct cleanup command failed locally while being
formatted before any network access. The correct immutable-candidate validator,
bounded cleanup and independent token rejection subsequently passed. Neither
workaround is a release prerequisite.

ADB long-press injection did not expose the listing-options report path
reliably. The exploratory temporary listings and sessions were fully retired;
the gap remains explicit instead of promoting indirect evidence.

No Production, Google Play, tester, Firebase, external identity provider,
payment provider, legal approval, Cloud/VPS/DNS, OnePlus or PR-merge state
changed. No credential, action token, personal account identifier, private path
or raw device identifier is stored in repository evidence.

Machine-readable evidence:
`docs/evidence/release-readiness/wp70-current-candidate-auth-safety-hold-20260909.json`.
