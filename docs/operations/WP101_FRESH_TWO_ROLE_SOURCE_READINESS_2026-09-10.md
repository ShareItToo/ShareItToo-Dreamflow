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

The follow-up verifier is deliberately stronger than a local manual marker:
for each pending role, it establishes one bounded Staging session, verifies
that `/auth/me` resolves to that exact private principal, and revokes the
session through the normal logout route before the local vault can be promoted
to `email-link-verified-ready-for-login`. A failed role, mismatched principal,
transport error or failed session cleanup leaves both roles pending. It never
prints or persists a token outside the existing owner-only vault.

Codex must never read, copy, print or commit either address, password or link.
The known two noncritical overdue Support follow-ups are a separate
staff-owned operational hold. This package neither identifies nor changes them.

## Independent local Listing-AI readiness check

While the two normal e-mail confirmations remain owner-controlled, the
existing `codex_local_dev` developer adapter was revalidated once against its
allowlisted synthetic drill fixture. The ephemeral read-only evaluation used
the supported ChatGPT sign-in, no API billing environment and no model tools.
It produced a schema-valid category/subcategory proposal, preserved three
clarification questions, created no authoritative price and required every
owner confirmation and explicit publication action. The result is retained in
`docs/evidence/release-readiness/wp101-codex-local-dev-synthetic-evaluation-20260910.json`.

This is not an external Staging provider, not a user-image evaluation and not
runtime image-analysis acceptance. Staging remains the zero-budget mock with
external execution and automatic publication disabled.

## Verification

The focused vault audit covers: an all-retired safe directory, refusal of an
active source even with correct file permissions, and refusal of a symlinked
entry. The registration verifier tests cover successful two-role promotion,
exact principal readback plus per-role logout, and refusal that leaves both
roles pending. All focused checks pass. The verifier is prepared but has not
run against the new private accounts; it awaits the owner-controlled mail
confirmations. No Pixel, provider, Store, OnePlus or Production state changed.
