# 48H R7 image privacy and Listing-AI contract hardening

Status: **VERIFIED — TARGETED, FULL REGRESSION AND CODEQL GREEN**

R7 retains a deterministic 26-case adversarial matrix for the complete image
privacy and Listing-AI output boundary. No real image, real user data, external
provider, paid model or `codex_local_dev` execution is part of this package.

## Finding and permanent correction

A red-first test showed that the existing output guard rejected several narrow
guarantees but still accepted plausible model-written assertions of CE
certification, full functionality, verified ownership and a market price. The
gateway now uses versioned R7 patterns for all four prohibited claim classes.
The strict response schema continues to reject attempted publication fields and
authoritative Price Engine fields. Rejection creates only the existing manual
fallback: no partial draft, authoritative price or automatic publication.

## Privacy and injection coverage

Synthetic image fixtures verify removal of the entire EXIF/GPS metadata
container, opaque generated WebP names, resize/compression and byte-zeroing on
success, block, failure and timeout. Audit events contain neither raw derivative
bytes, original names/OCR text nor complete model output.

Face, document, visible-address, financial-data, credential and unrelated
sensitive-image signals block at high confidence and request crop/replacement
when uncertain. QR-derived and prompt-like OCR text remains explicitly tagged
`untrusted_data_never_instructions`; it grants no tools, URL access, shell,
database write, publication or price authority. Malformed output, unknown
fields, overlong strings, prohibited categories and all four hallucinated claim
classes fail closed.

## Boundary and remaining limitation

The tests supply synthetic OCR and visual-screening results. They validate the
consumer contract, not the accuracy of a real OCR, QR or vision detector. No
provider call, API billing, Production, Cloud, Firebase, Payment, Store, VPS,
DNS, pilot activation, public release or PR merge occurred. Six R7 artifact
validator tests, the artifact validator, Backend suite (746 tests, one
documented PostgreSQL skip), fresh PostgreSQL integration, analyzer-zero gate,
Flutter suite (392 passes, one documented skip), Web/Wasm build, loopback smoke
and the 448-task Android debug build are green. Exact verified head
`213ff569323000eb122cc4bb0fd249bcae42a04e` passed GitHub Regression
`32748369738`, CodeQL workflow `32748369753` and Advanced Security check
`97499820023`, with zero open PR code-scanning alerts. The API image was built
but not published; explicit parallel stability and signed-candidate creation
were not requested. The separate GitGuardian failure remains the documented
pre-existing 250-commit PR-history finding; no credential detail was inspected.
R7 is closed and the next package is `R8`.
