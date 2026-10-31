# RW5 local safety/privacy principal isolation

Date: 2026-08-25
State: implemented locally; full regression and GitHub verification pending

## Decision

RW5 moves launch-relevant device-local safety, discovery-personalization and
communication preferences behind the same opaque principal boundary introduced
by RW4. The canonical document is `local_safety_privacy_state_v1`. It stores no
email address, raw user id, session value or credential in its principal keys.
The remote backend remains authoritative whenever the production repository is
enabled; this document is the bounded local/QA fallback only.

The canonical principal bucket covers blocked-user ids, local user reports,
hidden listings and feedback signals, muted thread ids, message settings and
notification preferences. A bucket is selected by the current authenticated
principal or by the explicit guest principal. The registry retains at most 12
valid plus quarantined principals and rejects overflow without evicting an
earlier account.

## Migration and corruption policy

Unattributed legacy blocked users, reports, hidden listings, feedback and
preferences are guest-only compatibility inputs. They never become a newly
signed-in account's state. Legacy muted-thread entries may migrate to an
authenticated bucket only when their embedded user id derives to that exact
opaque principal; entries for every other user remain untouched.

Malformed top-level state and malformed current-principal state fail closed.
An individually malformed bucket is preserved verbatim in quarantine so a
different valid principal can continue safely. A malformed unattributed legacy
guest input is preserved and marks the guest legacy area as quarantined. No
corrupt input is silently replaced with an empty list or default preference.

## Principal transition policy

Every operation captures its principal before entering the single serialized
mutation queue. Therefore an already-invoked account-A operation remains owned
by account A even when the session is immediately replaced by account B.
Authentication changes publish the canonical persistence event. Blocked-user,
message, message-settings, notification-settings, notification-feed and
discovery surfaces clear old state while reloading; on failure they show a
closed retry state instead of a previous account or a misleading empty state.

## Privacy and retention

The privacy export includes only the current-principal snapshot. Confirmed
account deletion removes the same current principal before its session is
cleared, without deleting another account or guest bucket. Guest legacy mirrors
remain for backward compatibility only and are deleted when the guest principal
is explicitly cleared.

The storage is user-controlled until removal, confirmed account deletion or app
data clearing. RW5 invents no statutory retention period and changes no owner or
legal decision. The privacy and retention manifests remain draft/fail-closed.

## Deterministic proof

The matrix covers account A to guest to account B to account A across all six
data classes; guest-only and exact-owner legacy migration; immediate session
replacement; malformed legacy and per-bucket quarantine; opaque process-style
recreation; bounded capacity without eviction; current-principal privacy export
and deletion; and visible stale/error-state suppression.

All fixtures are synthetic and local. No sleep, retry loop, reduced parallelism,
rate-limit workaround or timing allowance is part of correctness. RW5 changes no
booking contract, quote, acceptance, payment, refund, handover, return, damage,
needsReview, provider, Store, candidate, device, production, VPS, DNS or Cloud
state.
