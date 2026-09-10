# WP101 — Fresh Two-Role Source Readiness

## Decision and result so far

All functional Staging evidence still requires a fresh owner and renter
principal. Existing authenticated Pixel state is unknown and remains read-only;
historical test material must not be silently revived.

The designated owner-only two-role Journey area was inspected by a new
fail-closed audit. It contains 96 recognized synthetic-account Journey vaults,
all explicitly retired. It contains no active source, invalid recognized vault,
symlink, unsafe directory, unsafe file, excessive nesting or malformed JSON.
The runner rejects an active `email-link-verified-ready-for-login` source as
insufficiently fresh and never emits a filename, address, password or token.

## Current boundary

One owner-only mailbox selector outside the repository was structurally
validated without retaining its path or value. It generated a valid new alias
for each role. At `2026-09-10T13:40:20Z`, exactly two new isolated Staging
registrations were accepted through the normal public route under private run
reference `20260910t134020z-44a5c983`: one owner and one renter. A new local
owner-only vault holds the two aliases and generated credentials outside Git;
the registration runner returned only role status and did not emit an address,
password, verification URL or local path.

Acceptance (`202`) proves that the server accepted both registration requests;
it does not prove delivery or confirmation of either e-mail. The next required
owner action is to open each normal verification link in the owner-controlled
mailbox. Only after both genuine confirmations are recorded may the isolated
source be used for a Pixel login. Existing sessions and all retired Journey
material remain untouched.

Codex must never read, copy, print or commit either address, password or link.
The known two noncritical overdue Support follow-ups are a separate
staff-owned operational hold. This package neither identifies nor changes them.

## Verification

The focused audit tests cover: an all-retired safe directory, refusal of an
active source even with correct file permissions, and refusal of a symlinked
entry. All three pass. This work is local-only; it makes no Pixel, Staging,
mail, provider, Store, OnePlus or Production change.
