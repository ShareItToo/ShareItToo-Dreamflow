# N4 Blue Ocean image privacy pipeline

## Decision

N4 introduces an isolated backend image-privacy pipeline for later explicit
listing-AI actions. It is not wired to an HTTP route, Flutter, a provider or
persistent storage in this package. The normal listing upload and manual editor
remain unchanged.

## Derivative contract

The pipeline accepts one to four opaque upload references and in-memory image
bytes only after the exact versioned disclosure was accepted through an
explicit user action. Every analysis derivative is decoded, orientation-
normalized, resized inside 1280 x 1280 pixels and newly encoded as WebP quality
80. The new encoding carries no EXIF, GPS, ICC, IPTC or XMP metadata. A random
opaque name replaces the original filename.

Input is bounded to 8 MiB, 40 million decoded pixels, 12,000 pixels per source
dimension and one non-animated frame. The caller-owned original buffer is never
modified. Derivatives live only in memory in N4 and are overwritten with zeroes
in a `finally` path after success, rejection, timeout or consumer failure.

## Sensitive-content preflight

Local OCR is treated as untrusted data and is never retained in the result or
audit. Deterministic patterns block recognizable address, IBAN/card,
credential, identity-document and health-document text. A closed local visual
signal vocabulary covers faces, documents, addresses, financial data,
credentials and unrelated sensitive material.

High-confidence sensitive signals block and ask for replacement. Medium/low
signals ask the user to crop or replace the image. Missing completion of the
local visual scan also remains `review_required`; it can never be promoted to
provider-eligible. This fail-closed behavior is deliberate because N4 adds no
paid or remote scanner. N6 must bind only a trusted internal local-screening
adapter before an application route can use the pass state.

## Consent and audit

The exact disclosure is:

> SIT analysiert deine ausgewählten Bilder mit einem externen KI-Dienst, um
> einen bearbeitbaren Anzeigenentwurf zu erstellen. Es wird nichts automatisch
> veröffentlicht.

Both explicit initiation and acceptance of
`listing-ai-image-disclosure-v1` are mandatory. Audit events contain only
pipeline version, image count, outcome, safe failure code and cleanup truth.
They never contain original filenames, OCR, bytes, EXIF or consumer/provider
output.

## Lifecycle and remaining integration

The in-memory records use the N2 forward-only derivative states:
`prepared -> analysis_ready -> consumed -> purged`, or a direct permitted purge
on block/failure. A 10-second maximum consumer boundary aborts once and performs
no retry. N6 owns the authenticated route and UI. N8 owns persistent privacy,
export, erasure and retention integration. Until then no writer or provider
transport exists.
