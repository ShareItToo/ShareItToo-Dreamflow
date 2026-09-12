# ADR-072: Minimized audit for blocked support content

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenario `SUP-044` requires Secret/API-key content in support free text to
be blocked and logged. `SUP-045` requires counterparty personal data to be
blocked or redacted. The message domain already rejected common secret and PII
patterns, but the rejected transaction left no durable audit evidence. Logging
the submitted value would itself violate the no-secret-in-logs rule.

## Decision

SIT classifies a blocked free-text value only as `secret` or `personal_data`
and returns the established sensitive-content error. The message transaction
creates no durable object. The authenticated route then writes a separate
append-only audit record containing only reason, class, placeholder, template,
detector version and explicit false input/message/delivery flags.

Migration `059` enforces the exact minimized shape, actor role, resource type
and request correlation in PostgreSQL. It rejects extra keys and true effect
flags and refuses rollback while retained evidence exists.

## Consequences

- Support can prove that a control fired without preserving the prohibited
  value or a reversible fingerprint of it.
- Secret and personal-data events can be counted separately without exposing
  content.
- A rejected draft cannot appear as a message or user-visible case event.
- Database writes cannot quietly expand the audit payload.
- The same guard covers generic messages and progress-update message drafts.
- New detector types or redaction behavior require a versioned change.

## Rejected alternatives

- Store the blocked value for investigation: rejected because the audit would
  become the secret/PII leak.
- Store a deterministic hash of the value: rejected because low-entropy
  identifiers and known tokens could be tested against it.
- Write the audit inside the failed message transaction: rejected because the
  rollback would remove the required evidence.
- Log only to process output: rejected because it is not append-only,
  case-bound or reliably retained.
- Silently redact every match: rejected because redaction can change meaning
  and needs a separately approved user-communication policy.
