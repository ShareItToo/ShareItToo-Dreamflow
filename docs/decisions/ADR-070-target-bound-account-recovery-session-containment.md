# ADR-070: Target-bound account-recovery session containment

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenarios `SUP-097` and `SUP-098` require recovery to terminate sessions
only for the affected account, retain audit truth and prevent reset-token reuse
or fixation. S4F deliberately stopped at reviewed in-app guidance and provided
no account action. The existing reset path revoked sessions but did not remove
push registrations, did not expose exact effect counts and could race a newly
reported compromised email channel.

## Decision

SIT serializes reset-token issuance and account-takeover intake on the exact
target account row. The reset path rechecks the active P0 takeover state while
holding that lock. A matching intake consumes existing live reset tokens. A
blocked public request remains enumeration-safe and produces no token or email.

Credential changes call one server-owned helper that accepts only password
reset or password-change reasons. It revokes currently active sessions and
refresh tokens and removes push registrations for that user ID only. The audit
records target-only scope, exact effect counts and no replacement session.

Reset tokens use a single issuance timestamp, hashed storage, one live token per
account/kind, a maximum 30-minute lifetime and one-way consumption. Migration
`057` makes identity and consumption evidence immutable and refuses destructive
rollback while evidence exists.

## Consequences

- A reported compromised email cannot receive a new reset token after its P0
  case wins the shared account lock.
- A peer account is unaffected by containment.
- Already-revoked rows do not inflate new revocation counts.
- Concurrent authenticated password changes cannot both use stale password
  truth.
- Support obtains no generic session or token action.
- Privacy and Retention evidence cover the token dataset without enabling a
  destructive policy.
- Later Business/Global automation must preserve target binding, reason
  allowlisting, audit and independent live authorization.

## Rejected alternatives

- Check the support case before opening a token transaction: rejected because a
  case could be created between the check and token insert.
- Block reset only at the HTTP layer: rejected because internal token callers
  would bypass the security decision.
- Revoke by email or caller-selected reason: rejected because mutable identity
  and free-form scope can cross account boundaries.
- Revoke every historical row and report all returned rows: rejected because it
  overstates the current containment action.
- Create a replacement session automatically: rejected because recovery must
  not silently establish a new authenticated device.
