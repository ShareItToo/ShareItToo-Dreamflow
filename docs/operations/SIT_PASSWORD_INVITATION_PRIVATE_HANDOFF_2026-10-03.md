# Password invitation private handoff boundary

Design only; no invitation was generated for a real person, delivered or enabled.
The generated `handoff.json` is a bearer secret, not an audit artifact.

Before any delivery, an explicitly authorized operator must verify the exact
recipient/email through an established private channel, the allowed principal,
unexpired lifetime, selected registry hash and independently authorized runtime
readback. Do not send a code while the protected registry consumer is missing
or assume that file creation constitutes admission/activation.

Deliver only the invitation code and minimum useful context: exact account email,
expiry and the ordinary trusted Staging entry address. Never place the code in
the URL, query, fragment, subject, public chat, issue, analytics, source control,
shell history or operational logs. Do not include server-record JSON, digests,
allowlist, userId or other recipients. Use an approved authenticated encrypted
private channel; do not invent a channel or send mail/message without explicit
authorization. This document authorizes none.

Explain that the code is single-use and email-bound, account verification is a
separate step, and uncertain completion should be recovered through normal
login—not repeated redemption. Do not promise account creation or mail delivery
before independent confirmation. Reissue requires a separately authorized
review; do not bypass expiry, duplicate-principal or spent-token checks.

Keep handoff/request files owner-only outside the repository and shared/cloud
artifacts. Use only the approved recipient mapping privately. Operational
evidence contains delivery status/count and approved artifact hash, never token,
email, principal or per-record digests. Dispose of transient local/clipboard
copies after the authorized handoff under the existing retention policy; do not
claim immutable memory, backups or the recipient's copy are securely erased.
No new automatic delivery, erasure schedule or retention period is established.
