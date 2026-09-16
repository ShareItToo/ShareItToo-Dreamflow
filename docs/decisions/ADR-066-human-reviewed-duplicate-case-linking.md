# ADR-066: Human-reviewed duplicate-case linking

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenario `SUP-015` requires a duplicate case to identify its leading case
without losing history, a separate deadline or a Privacy/DSA matter. The
existing support model had closure reasons and events but no canonical,
immutable relationship proving why `duplicate_merged` was appropriate.

## Decision

SIT records a separate append-only `duplicate_of` link. An elevated
Administrator must confirm the same core facts, participants/objects and
decision question, no separate deadline loss and preserved Privacy/DSA
separation. Both case versions and their exact normalized scope are checked by
the application and database.

The duplicate must be resolved and the leading case active. Privacy,
DSA/moderation and legal-authority lanes are categorically excluded from this
technical path. This deliberately conservative boundary avoids pretending that
software can determine whether their statutory or procedural deadlines match.

Creating the link changes no case state and moves no record. It adds a bounded
user-visible leading-case reference on the duplicate, an internal reverse
reference on the leader and minimal audit evidence. Automatic merge/action and
external delivery are fixed false. Only after the link and visible reference
exist may the duplicate close with `duplicate_merged`.

## Consequences

- Duplicate history remains traceable and cannot be rewritten or deleted.
- The leading case stays operationally independent and unchanged.
- Exact scope and version checks prevent silent cross-case drift.
- Privacy export exposes the durable relationship to the reporter; Retention
  inventory counts it without inventing a purge period.
- Real-world legal/deadline judgment, user communication delivery and any live
  action remain explicit later human and release gates.

## Rejected alternatives

- Automatically merging rows, messages or evidence: rejected because it can
  destroy provenance, access boundaries and separate deadlines.
- Inferring duplicates from similar text: rejected because wording similarity
  does not prove the same facts, people, objects or decision question.
- Allowing Privacy, DSA or authority cases after a checkbox: rejected because
  their separation requires qualified case-specific review beyond this package.
- Closing first and adding a reference later: rejected because history and user
  notice must exist before the duplicate closure is accepted.
