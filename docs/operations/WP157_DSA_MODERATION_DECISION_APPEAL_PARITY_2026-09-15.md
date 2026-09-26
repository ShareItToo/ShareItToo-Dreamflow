# WP157 DSA / Moderation Decision and Appeal Parity

Status: technical closure package; CI-equivalent full regression passed; external gates hold.

WP157 closes the evidenced technical appeal-lifecycle gaps without deciding
DSA applicability, platform/operator facts, any size exception, statutory
deadline or professional legal approval. Submission remains reporter-bound and
non-live. An elevated admin must claim an appeal, receives an explicit
independence flag, and may resolve only the appeal assigned to that reviewer.
Resolution is typed (`upheld`, `modified`, or `reversed`); changed or reversed
outcomes require explicit bounded implementation-change truth.

The durable projection now preserves the server-confirmed next-update
checkpoint even when the appeal row itself does not contain it. Claim and
resolution use separate idempotency namespaces and reject replay against a
different appeal. Every appeal event records the exact internal principal,
content/action, reason and source; user-visible resolution is durable but never
automatically reopens the support case and never sends an external message.

The Flutter projection rejects an inconsistent terminal result (missing or
mismatched outcome, reason or communication timestamp) instead of rendering a
false successful resolution. Admin routes are authenticated, active-account,
admin-role and staff-elevation protected, private no-store and transactionally
bound.

Focused Backend, wiring and support-case checks pass. The permanent WP157
validator is registered in the complete technical regression. The complete
CI-equivalent regression passed with 3060/3060 Tool tests, Flutter/analyzer,
Web/Wasm, loopback smoke and Android debug/minSdk checks green. The strict
local Play handoff remains blocked by the unavailable historical owner-only AAB
archive and the separately stale app-content metadata (2026081505 versus the
active internal 2026081509); the documented CI/rollover path was used only as
a diagnostic workaround and is Technical Debt, not release proof. DSA applicability,
operator/contact-point facts, statutory deadlines, professional legal review,
BUILD/production/provider gates and all external activation remain unchanged.
No provider, payment, Store, Firebase, cloud/VPS, device, credential or PR
merge action occurred.

BUILD/production/provider gates unchanged.
