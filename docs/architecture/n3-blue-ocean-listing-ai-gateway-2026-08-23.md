# N3 Blue Ocean listing-AI gateway

Status: **IMPLEMENTED — MOCK ONLY — EXTERNAL PROVIDER DENIED**

N3 adds a server-only provider boundary without exposing a route, changing a
listing or enabling a paid call. Runtime configuration is `disabled` by
default. `mock` is accepted only outside production and always reports zero
input units, zero output units and zero billed cents. `openai` is represented
as a future adapter name, but the current configuration fixes external
provider execution to false even when a model and budget are configured.

## Strict request and response boundary

The exact thirteen N2 draft fields are required in one closed structured
response. Unknown top-level, field, source or clarification keys are rejected.
The gateway then revalidates every field through the N2 domain, checks the
private-pilot category/subcategory allowlist, refuses owner-confirmed provider
claims and rejects bounded unsupported-claim patterns. LOW confidence remains
blank and no provider field can become an authoritative rental price.

OCR text is carried only as `untrusted_data_never_instructions`. The provider
request has an empty tool list and explicitly denies shell, web search,
arbitrary URL fetch, database writes, publication and authoritative pricing.
Image bytes, original filenames, manual field values and secrets are outside
this N3 request contract.

The future adapter boundary was checked against the official OpenAI Responses
API documentation on 23 August 2026. The current API accepts image inputs and
JSON outputs, and the response-format surface supports strict JSON Schema.
Those facts justify the narrow adapter contract only; N3 installs no SDK,
selects no paid model and makes no request:

- https://developers.openai.com/api/reference/cli/resources/responses/methods/create
- https://platform.openai.com/docs/api-reference/responses

## Failure, replay and cost truth

Disabled provider, timeout, malformed output, provider failure, rate limit,
budget exhaustion and missing paid-provider authority all converge on one
manual fallback. It preserves photos and manual inputs, opens the manual
editor, persists no authoritative partial AI state and never publishes. A
transport is invoked at most once; there is no retry loop.

The gateway binds an exact request hash to the 64-character generation key.
Exact replay returns the same result without a second transport call, while a
different request under the same key fails with an idempotency conflict. N2's
`UNIQUE (draft_id, generation_key)` remains the durable final-write guard for
the later N6 route transaction. The current N3 memory store is deliberately a
non-live gateway/test component, not a production multi-instance dependency.

Rate limiting applies only to new generation keys. The mock bypasses paid
budget consumption because its cost is provably zero; any nonzero mock usage
or cost becomes a safe fallback. The future paid adapter is refused before a
transport call when the budget is empty and is still refused after a positive
budget because owner authorization is absent.

Audit output contains only versions, hashes, safe outcome codes, call count and
zero-cost truth. It never receives OCR text, image bytes, full model output,
provider error messages or secret values.

N4 owns image sanitization, EXIF/GPS stripping, resizing, sensitive-content
preflight and derivative cleanup. N6 owns the authenticated route, persistent
transaction and UI integration. Until then there is no application writer or
public listing-AI endpoint.
