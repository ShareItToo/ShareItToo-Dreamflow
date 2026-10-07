# Active infrastructure and mail provider runbook

Status: technically prepared, external facts and approvals required. No
provider account, VPS, mail transport, production or Store setting was changed.

## Current preflight

Run from the repository root:

```sh
node tool/validate_active_infrastructure_mail_provider_readiness.mjs
```

Expected result: `prepared-hold`, five classified active processors, two newly
explicit active processors, ten required decisions, zero completed and
external readiness false.

The final check is intentionally red:

```sh
node tool/validate_active_infrastructure_mail_provider_readiness.mjs --require-ready
```

## Decisions to complete with Walid

For the hosting/database/storage processor:

1. Confirm the exact customer entity, account ownership, current contract and
   DPA without copying account identifiers into Git or chat.
2. Confirm the exact service/seat and processing/storage/backup regions.
3. Approve the applicable transfer mechanism and subprocessor chain.
4. Approve retention, deletion-request, backup expiry and restore-time deletion
   propagation procedures.
5. Approve security-incident, subprocessor-change, export and provider-exit
   procedures.

For the transactional SMTP processor:

6. Confirm the exact customer entity, account ownership, current contract and
   DPA.
7. Confirm the exact service/seat and sending/processing regions.
8. Approve the applicable transfer mechanism and subprocessor chain.
9. Approve retention, deletion and suppression-list handling.
10. Approve the transactional-only payload, recipient minimization, bounce,
    complaint, incident and operator procedures.

## Safe configuration order

Review sanitized account and contract facts first. Store credentials only in
the approved secret store. Create separate evidence for official retention and
deletion review, service readiness and owner/legal approval; none may be
reused as another. Update Privacy and Retention artifacts before any Store
answer or public activation claim, then rerun both strict validators and the
aggregate external gate.

Do not change VPS, database, backups, DNS, SMTP routing, production, Store or
Cloud settings during evidence preparation. Do not start a paid service,
accept a new contract or upgrade a plan without Walid's specific cost approval.
Do not put account identifiers, addresses, credentials, endpoints, private
mail content or personal data into repository evidence.
