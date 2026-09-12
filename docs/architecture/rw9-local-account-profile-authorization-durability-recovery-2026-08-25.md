# RW9 local account/profile authorization, durability and recovery

Date: 2026-08-25
State: verified on implementation candidate
`0bfc57fca09dc8586e5eeb64c46a0af1ba6bc606`; local full regression and
exact-head GitHub Regression/CodeQL passed

## Decision

RW9 hardens the existing device-local account/profile fallback without changing
backend authority or enabling a live identity provider. User-facing edits are
exact-current-account field patches. Identity, authentication, verification,
moderation, role, payout, reputation and deactivation fields are absent from
the caller-mutable field set. Changing a phone number internally clears its
verification truth; local UI cannot change email or simulate verification.

`setCurrentUser` remains the trusted authentication/registration hydration
path. Normal profile, contact, address, social and visibility screens no longer
submit full `User` snapshots, so a stale screen cannot silently discard fields
loaded or changed elsewhere.

## Store contract

`currentUser` and `users` are decoded strictly and bounded as a paired local
account document. The public-profile cache accepts at most 1,000 unique ids and
normalized emails and 16 MiB encoded data. Profile strings and lists are
bounded; photo data has a separate bounded allowance within the document cap.
Malformed timestamps, ratings, counters, lists, duplicates or document shape
fail closed and retain the exact raw bytes. Reads no longer repair, seed or
rewrite account-owned state.

Writes share one serialized queue. Each mutation rechecks the exact session,
reads the latest complete pair, applies only validated fields, validates the
complete next pair, verifies both platform writes and read-back, and restores
both prior byte strings after an observed failure or an in-flight session
replacement. Capacity exhaustion rejects without pruning. Completed writes
survive process-style recreation. Mutation, privacy export and anonymization
also require both mirrors to contain the exact same current-account document;
a divergent pair fails closed instead of selecting or merging one side.

## Privacy and deletion boundary

The local privacy export contains the exact current account profile only.
Other public cached profiles and authentication-session material are excluded.
Deactivation requires the exact current account; a caller-supplied foreign id
cannot anonymize another cached profile. Dependent current-account deletion
steps run first, then both profile mirrors are anonymized together before the
session and current cache are cleared. Other public profiles remain unchanged,
and no retention period is invented.

## UI truth and recovery

Profile write surfaces keep their current input and show a retryable failure
instead of reporting success after a rejected write. Contact data requires the
supported authenticated email-change flow. The local fallback does not claim a
verification link was confirmed. A corrupt or over-capacity account document
must be preserved for separately reviewed recovery rather than normalized or
partially salvaged.

## Deterministic proof and exclusions

The synthetic matrix covers guest, foreign and stale sessions; protected-field
preservation; explicit nullable clears; concurrent disjoint patches; paired
write rollback, in-flight session replacement and queue recovery; malformed
and duplicate identity documents;
field and account capacity; process recreation; exact-account privacy export;
and exact-account deactivation. It contains no sleeps, timing allowances or
reduced parallelism requirements.

RW9 changes no production backend schema, remote auth provider, contract,
quote, acceptance, payment, refund, payout, handover, return, damage,
moderation decision, provider, AI, candidate, device, Play, Firebase, Store,
VPS, DNS, Cloud, pilot, real-money, legal-owner, PR-merge,
GitGuardian-finding-content or Git-history gate.

## Verification closure

The exact implementation candidate passed the standard local technical
regression with 510 Flutter tests, three documented profile skips, zero analyzer
issues, the loopback Web smoke, and the 448-task Android debug build at minSdk
24. No timing workaround or parallelism reduction was used. GitHub Regression
run `32838824110` and CodeQL run `32838824163` passed on the same candidate;
the open code-scanning alert count was zero.
