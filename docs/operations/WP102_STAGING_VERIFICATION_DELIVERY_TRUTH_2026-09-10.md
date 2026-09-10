# WP102 — Staging Verification Delivery Truth

## Scope and trigger

An owner reported that the two freshly registered synthetic Staging principals
had not received their normal verification messages in the expected mailbox,
including its spam view. This package records that report, corrects the
source-level success semantics and preserves a narrow external trace gate. It
does not resend mail, inspect mailbox contents, change an account, deploy to
Staging, or change any provider, Store, payment, cloud, VPS or DNS setting.

## Established facts

- The two newly registered roles use isolated aliases in the same
  owner-controlled mailbox family. Their addresses, credentials, links and
  private run reference remain outside Git and are not included here.
- An accepted registration response (`202`) proves only that the application
  accepted the request. A healthy SMTP transport check proves only its
  connection/authentication readiness. Neither proves recipient acceptance,
  spam placement or mailbox arrival.
- The read-only Staging health and recent application-log checks found SMTP
  readiness and no matching application-side delivery exception in the
  inspected interval. They cannot establish the outcome beyond the SMTP
  boundary.
- The then-current source swallowed a known registration or unverified-social
  delivery-command failure and still returned `202`; the social response also
  described the verification message as sent. That was a false success claim.

## Source correction

Source commit `ccb247d356e56b96d956efc5839ed773013720e8` changes only the
local source and its regression coverage:

- `/v1/auth/register` and the unverified-email branch of `/v1/auth/social`
  return `503 verification_delivery_unavailable` when the server knows that
  its verification-delivery command failed.
- A later successful retry for the same unverified registration is preserved.
- Flutter maps that structured result to an explicit retry message; it no
  longer presents it as registration or email success.
- Registration, social and resend language now says that a verification
  request was processed, never that the recipient inbox received a message.
- `/v1/auth/email-verification/request` deliberately remains enumeration
  neutral: its generic `202` is described in the UI as a processed request,
  not a delivery claim.

This correction does **not** infer a failed mail from a timeout, lost client
response, successful SMTP handoff, or an absent inbox message. Those outcomes
remain unknown until independently traced. It also does not establish a
deployment: the currently observed Staging runtime remains a separate fact
until an explicitly authorized rollout and readback occur.

## Deterministic local verification

The regression injects a synthetic mail-command failure without any provider
traffic and proves both contracts for normal registration and unverified social
registration:

1. the known failure returns exactly `503 verification_delivery_unavailable`;
2. after restoring the local delivery function, retrying the same input returns
   the normal pending-verification `202` response.

At the source commit above, `git diff --check`, focused Flutter tests, focused
Flutter analysis, backend static checks and the local PostgreSQL integration
all passed. The sanitized machine-readable binding is
`docs/evidence/release-readiness/wp102-staging-verification-delivery-truth-20260910.json`.

One complete local technical regression was then intentionally allowed to
reach the Google-Play Internal handoff validator. It stopped fail-closed at
`Runtime-affecting files changed after the rollover artifact source commit.`
The new source is therefore **not** represented by the retained Android
candidate. This is expected candidate-binding truth, not a regression pass or
a mail-delivery result. WP102 does not create a replacement signed candidate;
that release-candidate action requires its own bounded package and exact
artifact binding before a complete gate or GitHub Regression can be claimed.

## Remaining external gate

The missing-message report is not closed by code alone. Before treating either
fresh role as verified, an authorized operator must use the normal mail
administrator message-trace surface in read-only mode to determine the
provider outcome for each recent verification attempt. Search values must be
entered only in that operator surface and must not be copied into Git, logs or
evidence. The trace must classify each result as accepted, deferred, bounced,
rejected, spam/quarantined, or unavailable/unknown. If no trace is available,
the correct state remains `unknown`; no resend loop or device test is implied.

Only after a separately authorized Staging rollout of this source correction
can the app expose the new `503` behavior to a device. That rollout is outside
WP102.

## Rollback and boundary

Rollback is the normal Git revert of the source commit above. No external
state was created by this package. WP101 remains blocked only on genuine
mail-link confirmation plus its existing server-confirmed, short-lived
per-role session proof; WP102 does not promote either condition.
