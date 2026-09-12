# WP83 — current-candidate Pixel auth and session replay

Status: **PARTIAL — the external e-mail-link confirmation remains open.**

## Bound candidate and scope

WP83 replays the two WP79 auth requirements only on the installed Internal
Staging Android candidate `com.shareittoo.app` `1.0.0+2026090905`, candidate
source `e1c182ea496f013989863155c13bfda649255a7e`. It contacts only the
authorized Pixel and isolated synthetic Staging identities. It does not build,
upload, deploy, merge, contact OnePlus, change Firebase, call a payment
endpoint, use real money or change Production.

## Verified physical results

- Password change presented an unambiguous success state; the old credential
  was independently rejected and the replacement credential independently
  accepted.
- Replacement login, terminated-process cold start and Account-A-to-B UI
  isolation passed. The original synthetic credential was restored, all
  accepted diagnostic sessions were revoked and the protected owner session
  was restored.
- Pixel session controls proved an exact two-session inventory, a remote
  session revocation, revoked-token rejection, preservation of the invoking
  Pixel session, logout-all, server-confirmed empty session truth before a
  separate relogin, cold-start persistence, A-to-B isolation and protected
  owner restoration.
- A fresh Pixel registration accepted all four explicit consents and reached
  the app's e-mail-verification-pending state. No address, credential or
  verification link is recorded here.

## Runner correction and ratchet

Three early, pre-mutation UI runs exposed real diagnostic weaknesses rather
than application success: a visible action could still be disabled, a chosen
action could lack usable bounds, and login submission could occur before both
editable inputs were reflected in the Android hierarchy. Their journals
retained the original credential or completed explicit rollback and owner
restoration. They did not create a durable workaround.

The permanent correction is bounded and state-based:

- `71d5ca1c334006db568184006ce26cd60cab9810` waits for an interactable
  password-route action and searches both bounded viewport directions;
- `0e76debc69303ed5b06bb98e1f0ad39fa850a2a7` additionally requires usable
  geometry for the exact action that will be tapped, including the form submit;
- `7f59a5dbb5ce6ff6c06adbf0f8d3b94858d86296` verifies that both editable login
  fields have accepted input before an enabled submit action is used.

Focused tests cover delayed action rows, disabled semantics, invalid geometry,
bidirectional bounded viewport search and populated editable login fields. No
cache, timing override, unbounded retry, relaxed assertion or manual UI
workaround is a release prerequisite.

## Remaining owner gate

The remaining action is external and cannot be performed safely by Codex:
open the newly received **ShareItToo Staging verification e-mail** in the
owner-controlled test mailbox and use its link in the normal browser flow.
Do not paste or forward the link into Codex. After that owner action, the
runner can record confirmation, prove Pixel login/cold start and perform the
separate password-recovery link lifecycle. Until those exact-candidate proofs
exist, `email-registration-verification-login-recovery` remains `PARTIAL`.

The password/session requirement is physically re-proven except for any
separate deliberately delayed-response injection not exercised by this package;
it remains conservatively `PARTIAL` in the WP79 acceptance matrix until that
specific current-candidate proof is independently recorded.

## Continuation preflight

Two independent exact-candidate replays were checked before any action. The
Google replay correctly requires its dedicated owner-only account selector,
which is not currently provisioned. The search/saved and other two-role
replays correctly require a source vault in the explicit
`email-link-verified-ready-for-login` state; every locally retained two-role
journey vault is instead explicitly retired. Neither check selected, emitted,
committed or retained an identity, credential, token or private path, and both
stopped before a Pixel, Staging, provider or account mutation.

The retired-vault condition is intentional: it prevents a historical test
principal from being silently resurrected. The safe successor is fresh
owner-confirmed email verification that provisions new isolated test material;
it does not authorize reuse of retired accounts or any live-provider change.

## Permission-lifecycle follow-up

The exact-candidate Android permission lifecycle runner was subsequently
bound to the candidate's own clean source checkout rather than the later
working-tree source. Its profile check now uses a bounded, display-relative
scroll only to reveal the existing static menu; it never reads profile data,
changes an account, captures a screenshot or retains raw UI XML.

On the installed `2026090905` candidate, the allow-listed `Meine Anzeigen`
and `Mietanfragen` markers appear after bounded scrolling, while `Abmelden`
does not. This is the expected guest/e-mail-pending state of the fresh
registration, not evidence of an authenticated session. Each attempted
permission round-trip restored its original Android runtime-permission and
AppOp snapshot exactly; its private recovery journal contains neither
credentials nor account identity. The lifecycle therefore remains `PARTIAL`
until the owner completes the external e-mail link and a new authenticated
Pixel replay can be made. No Staging, provider, store, payment, OnePlus or
Production state changed.

The runner now performs that authenticated-profile check before it creates a
new permission-recovery journal or performs its first grant/revoke operation.
On the current Pixel it stopped at that preflight, wrote no new journal and
left the already verified runtime-permission and AppOp snapshot unchanged. A
failed preflight also restores the ordinary Explore navigation surface. This
is a deterministic safety boundary, not a timing accommodation: the complete
lifecycle can resume only after a genuine authenticated profile is visible.

Machine-readable evidence:
`docs/evidence/release-readiness/wp83-current-candidate-pixel-auth-session-replay-20260910.json`.
