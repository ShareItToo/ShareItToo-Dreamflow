# Founder-Independence Critical Process Runbook Template

Status: FI0 foundation. Copy this template for one critical process only after
the responsible company role and delegate have been approved. Do not insert
passwords, tokens, signing material, recovery codes or personal account data.

## 1. Process identity

- Process ID:
- Purpose and bounded scope:
- System of record:
- Current readiness: `ready` / `hold` / `not-applicable`
- Last role-based review date:

## 2. Role ownership and least privilege

- Owner role ID:
- Delegate role ID:
- Assignment evidence reference:
- Minimum required permissions:
- Explicitly forbidden permissions:
- Separation-of-duties requirement:
- Four-eyes policy: `not-required-with-reason` / `required` / `external-gate`

Use role IDs, never a personal user ID, email address, device name or local
computer path as the authorization rule. A missing owner or delegate keeps the
process on `hold`.

## 3. Preconditions and normal procedure

1. Preconditions and safe-state checks:
2. Deterministic normal procedure:
3. Expected result and verification:
4. Idempotency or duplicate-execution control:
5. Evidence saved to the company system of record:

## 4. Monitoring and escalation

- Monitoring reference:
- Healthy signal:
- Warning threshold:
- Escalation threshold:
- Primary receiving role:
- Delegate receiving role:
- Strategy/existential gate requiring owner decision:

Normal exceptions route to the responsible functional role. They do not route
to a named founder merely because no routing decision was documented.

## 5. Fallback, recovery and rollback

- Safe fallback:
- Recovery prerequisites:
- Rollback procedure:
- Data-integrity verification:
- Maximum tolerated interruption:
- Break-glass role and approval policy:
- Post-recovery review owner role:

## 6. Audit contract

Every critical execution records, where applicable:

- `actor_id` and `actor_role`;
- `action`, `resource_type` and `resource_id`;
- `request_id` or idempotency reference;
- before/after hashes when state evidence requires them;
- outcome, approval reference and sanitized metadata;
- server-controlled `created_at`.

Never store passwords, tokens, signing material, recovery codes, raw device
identifiers or unrelated message content in audit metadata.

## 7. Absence and delegate test

- Test duration and package gate:
- Owner role unavailable by design: yes / no
- Delegate used only approved access: yes / no
- Monitoring and escalation worked: yes / no
- Recovery/rollback exercised or tabletop-verified: yes / no
- Founder-only intervention occurred: yes / no
- Result: `passed` / `failed` / `not-started`
- Sanitized evidence reference:

An absence test is not passed when a founder silently performed an operational
step, supplied an undocumented secret or explained a missing runbook orally.

## 8. Founder-hours aggregate

If this process consumed founder time, record only the monthly aggregate for
one category: `strategy`, `operations`, `support`, `technical` or `emergency`.
Do not collect exact activity timestamps, keystrokes, screenshots, URLs, app
usage, message content, location, biometrics or continuous activity data.

## 9. Founder-escalation aggregate

Record only one manual monthly aggregate with `totalCount`,
`roleRoutedCount`, `founderOnlyCount` and `unroutedCount`. The three routing
counts must add up to the total. Do not store case text, user identities,
message content or exact activity timestamps in this aggregate. A missing,
duplicate or inconsistent month remains unavailable in the pilot cockpit; it
must not be treated as zero.

## 10. Acceptance and review

- Owner and delegate roles approved:
- Runbook executable without oral explanation:
- Least-privilege test passed:
- Manipulation/authorization test passed:
- Monitoring and fallback verified:
- Audit evidence complete and sanitized:
- Next review trigger:
- Remaining external gates:
