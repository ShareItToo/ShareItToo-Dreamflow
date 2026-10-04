# RW6 local operational-record authorization and truth recovery

Date: 2026-08-25
State: implemented locally; full regression and GitHub verification pending

## Decision

RW6 hardens the launch-relevant device-local operational fallback without
changing backend authority or booking semantics. Message threads, notifications,
rental requests, timeline events, read and last-seen markers, handover/return
metadata, pickup-failure counters, one-time banners and directly coupled booking
selections are no longer treated as device-global trusted state.

Operational reads and mutations require a current authenticated session whose
user id matches the cached profile. Booking, timeline and handover records also
require owner or renter participation. Booking selections remain non-binding and
use the bounded opaque account-or-guest principal established by RW4. When the
backend is enabled it remains authoritative; RW6 changes only cache validation
and the local/QA fallback.

## Authorization and session boundary

Every queued mutation captures the authenticated account and rechecks the same
session after it enters its serialized queue. Remote reads and uploads are also
rechecked before cache persistence or UI delivery. A stale cached profile without
a matching session is not authentication. Caller-supplied user, sender, request
or thread ids cannot select another account's records or impersonate the other
participant.

Thread deletion is current-user-only. It stores a sorted per-user deletion
tombstone while the counterparty retains the shared record. Archive, unread and
read-marker state follow the same current-user boundary. Unattributed legacy
notifications remain preserved but unassigned; no later account can claim or
export them.

## Corruption, capacity and mutation policy

Top-level and entry decoders are strict and bounded. Message storage retains at
most 1,000 threads and 5,000 messages per thread; notification and timeline
stores retain at most 5,000 entries; rental requests retain at most 1,000 unique
requests. The principal booking-selection registry retains at most 12 valid or
quarantined principals and 1,000 selections per bucket.

Malformed data fails closed and the exact existing raw value is preserved. A
read never normalizes or rewrites corruption as an empty or partially sanitized
document. Capacity exhaustion rejects the new write without pruning retained
history. Canonical writes are serialized, validated, read back and verified.
There is no sleep, retry loop, timing allowance, rate-limit workaround or reduced
test parallelism in the correctness contract.

## Privacy, deletion and retention truth

The privacy export contains the current account's notifications, read markers,
last-seen marker and booking selections plus shared request, thread, timeline and
handover records only where that account is a participant. Unattributed legacy
notifications are explicitly excluded.

Confirmed account deletion removes account convenience state and applies a
per-user thread tombstone. Shared rental requests, timeline and handover records
remain for the counterparty and legal/audit continuity. RW6 invents no retention
period and grants no legal approval; policy and execution gates stay fail closed.
Both local and backend-authoritative account-deletion paths perform the scoped
device cleanup before the local session is cleared.

## Visible transition policy

Open message-thread, message-list and notification-list surfaces clear sensitive
state before reloading and verify that the same user remains current after every
asynchronous read. Account replacement cannot leave the previous account's
thread, list, unread count or composer visible. Failure renders a compact closed
state rather than a truthful-looking empty state or stale content.

## Deterministic proof and exclusions

The synthetic matrix covers account A, guest, account B and outsider access;
foreign ids; stale cached profiles; per-user deletion; concurrent accepted
writes; process-style recreation; exact raw corruption preservation; full-store
capacity rejection; privacy export and confirmed deletion; participant counters;
and compact open-screen account replacement.

RW6 changes no request/contract/quote/acceptance decision, payment, refund,
payout, handover/return/damage/needsReview decision, production backend schema,
provider, AI runtime, candidate, device, Play/Firebase, Store, VPS, DNS, Cloud,
pilot, real-money, legal-owner, PR-merge or Git-history gate.
