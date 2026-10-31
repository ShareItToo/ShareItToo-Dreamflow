# RW10 local security-control truthfulness

Date: 2026-08-25
State: verified local full regression, GitHub Regression and CodeQL passed on
exact implementation head `d72e18eb607bb3f9ed7baf09ab7212f3ef695ee5`

## Decision

Account-security controls are server-authoritative. The local fallback exposes
no password-change action, session list, remote-session revocation, logout-all
claim, two-factor switch or identity-verification simulation. The existing
backend routes remain the only implementation path; RW10 does not enable or
change that backend, an identity provider or a two-factor provider.

`AccountSecurityService` is the single client boundary. Every action starts
from a complete backend session marker made from account id, session id and
normalized email. Responses are accepted only while the same marker is still
current. Password change and logout-all then use an exact conditional local
session clear; a successor principal is preserved and the UI cannot report
success.

## Server-session contract

The session envelope must be a list of objects. It is not filtered or partially
salvaged. The complete list is limited to 100 unique, bounded session ids and
bounded non-empty device/location labels with valid timestamps. Exactly one
entry must identify the invoking session as current. Empty, malformed,
duplicate, missing-current or contradictory lists fail closed behind a
persistent retry surface.

The current session cannot be sent through the foreign-device revoke action.
Password and logout-all success requires the server call, the exact-session
recheck, conditional local removal and a final proof that no old session
remains. Debug logs contain only error runtime types and never passwords,
tokens, raw server envelopes or identifiers.

RW10 tests construct synthetic password inputs at runtime rather than storing
static credential-shaped properties. The first published candidate contained
only synthetic test values, but the repository scanner correctly ratcheted on
their shape. That immutable commit/file/rule tuple is recorded in the existing
reviewed-history baseline; the current tree remains required to scan clean and
the exception cannot permit a working-tree or different-commit finding.

## UI and lifecycle contract

The offline screen states that account security is unavailable and renders no
password fields or session actions. The former locally persisted two-factor
preview and seeded device list are retired. The dedicated two-factor screen is
an unavailable explanation without switches, codes or method selection.

The screen subscribes to the shared account-security state event. Any session
change immediately clears password fields, devices, busy state and errors.
Revision and epoch guards discard stale loads and prevent an old async action
from changing a successor account's UI. Error state remains visible and
retryable. The offline view stays scrollable at 320 by 568 logical pixels with
200 percent text scaling.

## Legacy and process boundary

Legacy `security_settings_v1` and `signed_in_devices_v1` bytes are ignored and
never treated as account truth. RW10 deliberately does not normalize or erase
them while merely opening the screen. A separately reviewed migration or app
data clear is required if product policy later mandates removal.

SharedPreferences is not a transactional database across a hard process or OS
termination. The exact-marker comparison and removal invocation are adjacent,
and a successor session observed afterward is preserved, but an app termination
can interrupt the local cleanup. In that case RW10 makes no success claim; the
next launch must rely on normal session validation and re-authentication.

## Exclusions

RW10 changes no backend route or schema, production runtime, Firebase setting,
identity or two-factor provider, credential, external AI, contract, quote,
acceptance, payment, refund, payout, handover, return, damage, moderation,
candidate, device, Play, Store, VPS, DNS, Cloud, pilot, real-money,
legal-owner, PR-merge, GitGuardian-finding-content or Git-history gate.
