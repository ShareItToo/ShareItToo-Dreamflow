# ADR-073: Atomic non-acute harassment block-report

Status: accepted for non-live technical implementation on 22.08.2026.

## Context

Drive scenario `SUP-094` requires block/report plus a neutral review path for
harassment without acute danger. The existing client and backend exposed
independent report and block operations. That allowed a successful report with
no contact protection, and the generic report contract allowed the client to
choose priority. Acute danger also lacked an explicit diversion at this entry.

## Decision

SIT uses a dedicated authenticated endpoint for harassment. It accepts only an
explicit non-acute confirmation and server-owns reason and normal priority.
One transaction creates or reuses the report, applies the reporter's direct
contact block and appends a minimized neutral audit receipt. The generic user
report route rejects harassment.

The receipt records protection at submission, human review required and false
guilt, moderation-account-measure and external-action effects. Migration `060`
enforces the exact receipt and linked active block. Payload-bound idempotency
prevents duplicate or silently drifted submissions.

## Consequences

- A non-acute harassment report cannot succeed without its direct-contact
  protection.
- The reporter gets an immediate reversible safety control without a sanction
  against the other account.
- Acute danger is not misrouted into an ordinary P2 review queue.
- Replays stay truthful if the reporter later removes the block.
- Existing report review, appeal and account-measure approval boundaries remain
  separate and unchanged.
- Future Business/Global variants may reuse the atomic pattern, but emergency
  numbers, policy priority and external-report obligations require
  jurisdiction-specific review.

## Rejected alternatives

- Keep separate report and block calls: rejected because partial success leaves
  the reporter unprotected.
- Automatically suspend the reported account: rejected because a report is not
  a finding of guilt and account measures require their own reviewed path.
- Let the client mark the report urgent: rejected because acute danger needs a
  different safety route, not a caller-controlled queue label.
- Put acute cases into the same endpoint and promise rapid response: rejected
  because SIT is not an emergency service.
- Reuse an active report with changed content: rejected because details or
  evidence could be silently lost.
