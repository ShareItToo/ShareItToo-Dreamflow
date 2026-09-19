# S4BX active infrastructure and mail provider gate

Status: technically verified, non-live at exact implementation commit
`aa1b821a940ac5a8cb808ec1dd5599086360995c`.

## Closed technical gap

The existing provider-role classification already identifies five active
processors, including Hostinger VPS for first-party backend/database hosting
and Google Workspace SMTP relay for staging transactional mail. The Privacy
inventory previously exposed nine services without those two processors, and
the Retention inventory exposed only the four previously reviewed external
processor entries. That mismatch could hide active infrastructure behind an
otherwise fail-closed Legal or Privacy/Retention gate.

S4BX makes both processors explicit. Privacy now inventories eleven external
services and keeps all contract/DPA, seat/region, transfer, retention and
deletion approvals false. Retention now inventories six processors and states
truthfully that Hostinger and SMTP have no completed official-documentation,
service-readiness or owner review. The current execution preflight therefore
reports 23 stable blockers. Historical evidence remains immutable and retains
its exact four-processor, 21-blocker observation.

## Cross-cutting external decision boundary

The source-bound readiness artifact requires ten authentic decisions: five
for hosting and five for transactional mail. They cover account/contract/DPA,
service seat and processing region, transfers and subprocessors, retention and
deletion, backup/restore or suppression handling, incident/exit procedures and
the exact transactional-mail payload/operator boundary. All ten remain open.

This is a cross-cutting sub-gate of the existing Legal/operator and
Privacy/Retention gates, not a twelfth top-level gate. The aggregate remains
11/11 technically prepared and 0/11 externally ready. Its ordinary preflight
also reports five classified active processors, two newly explicit inventory
entries and zero of ten provider decisions complete. Both provider strict
readiness and aggregate strict readiness remain intentionally red.

## Fail-closed behavior

`tool/validate_active_infrastructure_mail_provider_readiness.mjs` binds the
exact Drive Support source, V5.2 legal manifest, provider classification and
current Privacy/Retention hashes. It rejects a hidden processor, source drift,
invented provider review, partial approval, credential-shaped data, external
mutation or readiness while decisions are open. The Privacy and Retention
validators independently enforce the same inventories and require separate
official, service-readiness and owner evidence before a future closure.

No external provider account was inspected, no contract was accepted, and no
VPS, database, backup, mail, DNS, Cloud, production, Store, Payment, pilot or
activation setting changed. P0B remains `HOLD` / `NO-GO`.

## Verification

The 81 focused active-provider, aggregate, Privacy and Retention contracts
pass. A further 58 provider-classification, Data Safety, App Content, phone,
Support and P0B contracts pass. The complete local gate passes analyzer zero,
385 Flutter tests plus one documented skip, Google-only, Web/WebAssembly,
loopback smoke and Android 448 tasks with binary minSdk 24. Capacity started
with 1,165,288 KiB free and 3,201,028 KiB generated and ended with 1,158,032
KiB free and 3,201,040 KiB generated: 12 KiB generated growth.

Exact GitHub Actions run `32625380409` passes the implementation head with
PostgreSQL in 30 seconds, Backend in 1:51 and Flutter/Web/Android in 6:36.
Signing and API-image publication remain skipped.
