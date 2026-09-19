# WP262-A — security, link-copy and message-composer truthfulness

## Scope

Align reachable copy and async outcome semantics with the current
server-authoritative implementation. No provider, payment, Store/Play,
production, cloud, Firebase or device mutation.

## Changes

- Help Center 2FA guidance now points to the live Security screen and its
  server-confirmed MFA status. It no longer describes MFA as merely planned;
  unavailable/unknown status remains unavailable/unknown and never becomes a
  local success claim.
- Listing-link clipboard failure now reports a concrete unavailable/retryable
  error instead of “folgt bald”.
- The existing `MessageSendCoordinator` and message-thread wiring remain the
  authoritative send path: draft clearing occurs only after persistence,
  newer text survives the await, failed persistence retains the draft, and
  stale account/thread completions are silent. A persisted-send/refresh failure
  is not converted into a resend invitation.

## Verification

- Focused Flutter security/MFA and message-coordinator suites: 20/20 PASS.
- Help Center support suite: 7/7 PASS.
- WP262-A static truthfulness wiring: 3/3 PASS.
- Consumer closure: PASS after current Help Center source-hash refresh.
- No live provider, payment, Store/Play, production, cloud, Firebase or device
  traffic occurred.
