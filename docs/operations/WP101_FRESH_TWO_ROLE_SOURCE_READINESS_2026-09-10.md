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

No fresh registration or e-mail message has been initiated, so no owner action
is pending yet. In particular, no verification link exists that an owner could
legitimately confirm. The next external sequence may begin only after a new,
owner-controlled Staging test inbox target is deliberately selected. It must
then create two new synthetic registrations, confirm their two normal e-mail
links in the owner-controlled mailbox, and store only the resulting credentials
in a new owner-only private source vault outside Git.

Codex must never read, copy, print or commit either address, password or link.
The existing source and all retired Journey material remain untouched.

## Verification

The focused audit tests cover: an all-retired safe directory, refusal of an
active source even with correct file permissions, and refusal of a symlinked
entry. All three pass. This work is local-only; it makes no Pixel, Staging,
mail, provider, Store, OnePlus or Production change.
