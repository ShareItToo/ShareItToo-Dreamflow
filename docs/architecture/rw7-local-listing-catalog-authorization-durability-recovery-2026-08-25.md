# RW7 local listing-catalog authorization, durability and recovery

Date: 2026-08-25
State: verified locally and on GitHub at implementation head

## Decision

RW7 hardens the existing device-local listing catalog without changing public
catalog readability, listing business rules or remote backend authority. Local
create, edit, status, delete and confirmed-account-deletion deactivation require
a current profile backed by the matching auth session. The requested owner and
the stored listing owner must both equal that current account.

Backend sessions require their exact server user id. The supported legacy
local developer session has no server user id, so it is accepted only when its
normalized authenticated email matches the exact cached current profile; every
queued recheck rereads that profile without initializing fixtures. A mismatched
id, email, profile or account transition fails closed.

When the backend is enabled it remains authoritative and retains its R8 server
revision contract. The local/QA fallback uses the existing `catalogRevision` as
an optimistic-concurrency token: creates start at revision 1 and every accepted
edit, status change or account-deletion deactivation advances it once. A stale
edit and a missing local update/delete target fail closed instead of overwriting
or upserting state.

## Store contract

The `items` document is decoded as one strict bounded unit. It contains at most
1,000 unique listings and at most 32 MiB of encoded data. Entry shape, owner and
listing identifiers, core finite numeric values, lifecycle status, revision,
tags, photos and discount structures are validated before use or persistence.
One malformed or duplicate entry closes the whole read while preserving the
exact previous bytes; no partial sanitization is written back.

Listing read-modify-write operations share one serialized queue. Each operation
captures and rechecks the current account, validates the complete next document,
writes it, and verifies read-back. A rejected write attempts exact restoration
if the platform changed the value. Capacity or storage failure is visible and
never strips media from this or unrelated listings. Queue rejection does not
poison later valid work.

## Retention and privacy

RW7 removes the client-invented automatic deletion of ended listings after 60
days. Confirmed local account deletion ends that account's active listings and
retains the records; no retention period or legal decision is invented. Public
listings belonging to other accounts may remain in the local catalog cache, but
the local privacy-export section includes only listings owned by the current
authenticated account.

## Visible account-transition policy

`MyListingsScreen` and the owner profile clear prior account state before async
loads, recheck the account after reading, and render a persistent retry state on
corruption or identity drift. Listing changes show success only after the exact
owner state reloads. The compact 320-dp layout keeps retry controls reachable
and prevents card overflow. Cross-tab listing changes use the existing bounded
shared-persistence refresh coordinator.

Create/edit keeps photos and form input on any persistence or auth failure and
reports a closed error. A successful local edit returns the accepted incremented
revision rather than presenting the stale pre-write object.

## Deterministic proof and exclusions

The synthetic matrix covers account A, guest and account B; foreign owner and
listing ids; exact legacy local email-session binding; stale cached profiles;
corrupt and duplicate entries; retention; concurrent creates; stale revisions;
missing targets; full capacity; injected write failure and queue recovery;
privacy export; scoped deletion deactivation; process-style recreation; compact
retry; and open-screen account replacement. There are no sleeps, timing
allowances or reduced-parallelism correctness requirements.

RW7 changes no booking, contract, acceptance, quote, payment, refund, payout,
handover, return, damage, `needsReview`, listing content/moderation policy,
production backend schema, external AI/provider, candidate, device, Play,
Firebase, Store, VPS, DNS, Cloud, pilot, real-money, legal-owner, PR-merge,
GitGuardian-content or Git-history gate.

The exact implementation head is
`33d1766467dbfdbbabe0d12823ac76e4614b7224`. The complete local technical
regression, GitHub Regression run `32825143509`, GitHub CodeQL run
`32825143456`, and the zero-open-CodeQL-alert check all passed for that head.
PR #7 remains open, Draft and unmerged; this verification does not authorize a
merge or any external activation.
