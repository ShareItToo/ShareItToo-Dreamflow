# N14 OpenAI listing-AI Staging adapter

## Outcome

N14 adds the server-only OpenAI adapter that can turn one to four selected
listing images into an editable German draft. The adapter is disabled by
default and cannot execute in Production. No external provider request was
made while implementing or verifying this package.

The Android client contains no provider endpoint or credential. It sends the
normal owner-initiated listing workflow to the authenticated SIT backend. The
backend alone may construct the adapter, and only when all of these independent
conditions hold:

- deployment environment is `staging` or `test`;
- provider is exactly `openai`;
- model is exactly the pinned reviewed model;
- a positive bounded cent budget is configured;
- the explicit external-execution flag is exactly `1`; and
- the owner-only server environment supplies `OPENAI_API_KEY`.

Missing, malformed or rejected configuration fails closed before a provider
call. Default Staging and every generated Android candidate continue to use the
zero-cost deterministic mock until the separate runtime activation is
deliberately completed.

## Privacy and authority boundaries

The provider receives only memory-resident 1280-pixel WebP derivatives. The
pipeline strips filename, EXIF, GPS, ICC, IPTC and XMP metadata, binds each
derivative by digest and destroys its bytes at the terminal state. Raw uploads,
browser cookies, client credentials and normal listing storage are outside the
adapter.

Every derivative is screened even when a client claims that visual screening
already passed. A local hard block prevents all external calls. Faces,
documents, addresses, financial data, credentials and unrelated sensitive
material fail closed. OCR and visible text are untrusted data and can never
become instructions.

Responses use a strict closed JSON schema, `store: false`, no tools, no web
access and no provider-side publication. Provider output is always an editable
draft. It cannot assert ownership, certification, functionality or market
price, cannot set an authoritative price and cannot publish. Owner review and
the existing listing-publication transaction remain mandatory.

## Cost and failure truth

Each call atomically reserves two cents in the monthly Postgres budget before
transport. Success settles the conservative token-based estimate; a transport
attempt whose result is unknown settles the full reservation. Concurrent
processes share the database guard. A changed monthly budget, exhaustion or
accounting error fails closed.

OpenAI does not return a final invoice amount in the response, so results
record estimated cost and leave billed cost unknown. Missing usage cannot be
silently converted to zero. Multi-image failures count every attempted call.
Timeout, refusal, authentication, rate-limit, incomplete-output, schema and
privacy failures return a typed manual fallback, retain the owner's inputs and
never claim that no paid call occurred when one may have occurred.

## Verification and remaining runtime gate

The focused N14 contract suite covers server configuration, stripped-image
transport, strict output, prompt injection, privacy bypass attempts,
multi-image accounting, hard timeouts, rate limiting, idempotency, budget
serialization and failure sanitization. The complete candidate-rollover
regression passes with the server adapter still disabled.

Runtime activation remains separate. It requires an owner-provisioned API
credential and the exact Staging execution configuration at action time. It
does not authorize Production, a public release, automatic publication, a
provider subscription purchase or real-money payment. Local `codex_local_dev`
evaluation remains a developer-only mechanism and is not a SIT runtime
credential.
