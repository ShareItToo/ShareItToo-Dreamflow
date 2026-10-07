# ADR-064: Immutable original and session-bound support evidence preview

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenarios `SUP-099` through `SUP-105` require spoofed-file rejection,
malware quarantine, stored-XSS resistance, expired/forwarded-link denial,
original integrity and no private evidence transfer to external AI. SIT has no
approved production malware-scanner provider or final upload/Retention policy.
The design must therefore prove the application and database boundaries without
pretending that production scanning is available.

## Decision

SIT stores a hash-bound immutable original and a separately decoded/re-encoded
WebP preview under generated names. The original has no retrieval route. A
preview becomes available only after one explicit terminal clean result and is
served only after current participant/session authorization and stored-byte hash
verification.

Access uses a random token whose digest, subject user, active authentication
session and maximum five-minute lifetime are stored in PostgreSQL. Authorization
rechecks all bindings and current case participation. The present configuration
uses 120 seconds.

Only detected JPEG, PNG and WebP inputs are accepted. Client names are never
persisted or returned. Metadata rejects active markup and unsafe controls. The
EICAR-style fixture proves quarantine locally; the clean/quarantine/failed scan
adapter is explicitly an internal test fixture and never a production scanner.

The entire intake is default-off, simulation-only and prohibited at production
startup. The workflow has no external network or AI transport and the schema
forces `external_ai_used=false`.

## Consequences

- A leaked grant is insufficient without the same active user session and case
  authorization.
- Preview processing cannot replace or mutate the legal/integrity identity of
  the original.
- Quarantined, pending and failed files have no preview access.
- Privacy export can disclose safe user evidence metadata without exposing
  paths, names or tokens.
- Retention remains fail-closed: no purge period is invented and schema rollback
  refuses stored evidence.
- Real scanner/provider readiness remains an external gate; this ADR does not
  authorize production intake or external AI.

## Rejected alternatives

- Serving originals through signed bearer URLs: rejected because forwarding
  would weaken user/session authorization and expose active content.
- Overwriting originals with sanitized output: rejected because it destroys the
  exact submitted-byte identity required for evidence integrity.
- Trusting extensions or client MIME: rejected because `SUP-099` explicitly
  covers spoofing.
- Sending private evidence to external AI or an unapproved scanner: rejected
  because no approved provider, DPA or Source-of-Truth authorization exists.
- Marking uploads clean by default: rejected because it creates a fail-open
  preview path before scanning.
