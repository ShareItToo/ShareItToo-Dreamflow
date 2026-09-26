# ADR-031: G3E Disabled Multi-Item UX and Exact Consent

Status: accepted for disabled technical implementation on 2026-08-20.

## Context

G3A Variant A and G3B-G3D provide a technical same-owner group, immutable
server quote revisions and a shared appointment overlay. They deliberately do
not replace the existing V5.2 item bookings, contracts, evidence, payment,
cancellation, refund or damage truth. G3E needs a comprehensible client path
without converting this disabled technical foundation into a public product.

## Decision

- The existing `Mietkorb` derives a possible group only from two to 20 items
  with the same locally known owner, project, date interval and currency.
  This is presentation filtering only. The server remains authoritative for
  exact handover location, region, owner, period, currency and current quote.
- The technical group entry is absent by default. It needs the compile-time
  `SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED=true`, remains absent when the
  public-release sentinel is true, and is unconditionally absent in Flutter
  release builds. The backend independently defaults `BOOKING_GROUPS_ENABLED`
  to false and rejects production activation.
- Group quote responses are parsed fail-closed. Every cent allocation,
  currency, item count, item sum, total, quote identifier and quote hash must
  be internally consistent before the UI displays or accepts it.
- The read projection includes the current quote and its exact predecessor
  when a counter-offer exists. The client shows old and new group totals,
  difference, changed membership and the complete current item allocation.
- Counter-offer acceptance requires an unchecked explicit consent control.
  The request sends `accepted=true` together with the exact current quote ID
  and hash. A stale or silently partial revision cannot be accepted.
- The shared appointment card shows one pickup and one return but never an
  exact address. Each item retains its own four evidence slots, accessory
  evidence, counterparty confirmation, chat, return status, deadlines, case
  and `needsReview` indication.
- G3E does not add a group contract, group payment, group cancellation,
  group refund, group damage case, group chat or group `needsReview`.

## Consequences

The technical path is understandable and testable end to end while the
contractual and financial unit remains one item. A renter can distinguish an
owner counter-offer from the preceding request and can consent only to the
exact current server revision. One disputed item remains visibly isolated.

This package does not make multi-item booking ready for public use. Legal copy,
information duties and release criteria remain in G3L and later gates.

## Rollback

G3E has no migration and stores no new local state. Rollback is a revert of the
client models, gateway, technical screen, predecessor projection and cart
entry. With either feature flag false the path is already unreachable. G3B-D
evidence and all V5.2 item records remain untouched.
