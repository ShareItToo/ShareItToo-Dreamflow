# S4J non-acute harassment block-report - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`3aff92398633876605db1b51c29207cad99e1e84`. This package implements the
non-live technical portion of Drive scenario `SUP-094`. It does not decide a
violation, impose an account measure, contact an authority or authorize
production, Payment, Store, Cloud/VPS/DNS, signing or pilot activation.

## Source basis

- Drive Support Test Matrix (file `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`,
  reviewed read-only at revision time `2026-08-20T22:29:02.738Z`), scenario
  `SUP-094`: harassment without acute danger requires block/report and a
  neutral review path.
- Drive Support Master Handbook (file
  `1hIUnlz0k0mIxpesUnxoVKvoMpQmD6TM1`, revision time
  `2026-08-20T22:24:39.816Z`).
- Drive Playbooks (file `1p_CpVD5czaJh0LkO_yt6F1JIoHV5BqmW`, revision time
  `2026-08-20T22:25:05.383Z`), including the separate urgent-danger priority
  and human Trust & Safety review boundary.
- Drive Tech/Audit and Source-of-Truth packages (files
  `19rXQidltzp3jvEWqnz4zgppTnTgL0iCl` and
  `1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN`).

No Drive document was modified.

## Acute-danger separation

The client asks whether immediate danger exists whenever harassment is
selected. `Ja oder unsicher` shows the bounded instruction to end contact,
move to safety and call 110 or 112; SIT is explicitly not presented as an
emergency service. The ordinary submission button stays disabled.

The server independently requires the literal non-acute confirmation
`immediateDanger=false`. `true` is rejected with the dedicated safety-path
code, while an omitted answer fails closed. Reason `harassment` and priority
`normal` are server-owned. Unsupported client policy fields are rejected.
The generic user-report endpoint cannot be used to bypass this protected path.

## Atomic protection and neutral review

One authenticated database transaction creates or safely reuses the open
harassment report, activates the reporter's direct-contact block, archives
their direct message threads through the existing block workflow and writes a
minimized receipt. A failed block rolls back the report as well.

The report remains `open` for neutral review. The receipt states that review
is required, no guilt was determined, no moderation account measure was taken
and no external action occurred. The self-protective block does not suspend,
restrict or otherwise decide the reported account.

Request idempotency binds target, non-acute confirmation, details, reference
and evidence identifiers through a SHA-256 fingerprint. Exact retries return
the prior result and truthfully expose whether the direct-contact block is
currently active. A different payload cannot silently reuse an existing
protected report. A compatible historical report may receive the protection
receipt only when its stored payload and evidence match exactly.

## Audit, privacy and retention

Migration `060` requires exactly eight metadata keys and verifies the linked
report, reporter, harassment reason and active direct-contact block inside
PostgreSQL. The fingerprint is one-way and contains no submitted text. Existing
append-only audit protection prevents mutation; rollback refuses while the S4J
receipt exists.

The established privacy export exposes the actor's audit action/resource but
not internal audit metadata. Reports and user blocks already belong to the
documented export and Retention inventories. No deletion execution path or
retention period was invented; both manifests remain fail-closed drafts.

## Local verification

- Ten focused Node domain/wiring tests and two focused Flutter service tests
  passed.
- The combined Privacy/Retention/P0B protection selection passed 79 tests;
  both standalone validators remained fail closed.
- Two consecutive fresh PostgreSQL 16 runs applied migrations through `060`
  and passed acute diversion, generic-path rejection, transaction rollback,
  atomic block/report, exact and semantic replay, conflicting-payload
  rejection, forged-audit rejection and guarded rollback.
- Complete Backend result: 553 pass, one expected no-database skip, zero fail.
- Complete technical regression accepted the 220-issue analyzer baseline,
  passed 372 Flutter tests with one documented skip, separate Google-only
  coverage, Web build/loopback smoke and Android debug APK.
- Secret scanning found no new high-confidence secret.
- P0B remained PSP `0/8 HOLD` and invited pilot `0/4 HOLD` / `NO-GO`.

The first monolithic HTTP run reproduced the existing shared-limit debt. No
wait, limit increase, bypass or request-source rotation was added. The S4J HTTP
scenario now owns a fresh app/limiter instance and passed twice from fresh
databases; `TD-RR-002` remains open for complete suite isolation and separate
threshold coverage. `TD-RR-003` and `TD-RR-004` also remain open.

GitHub push and CI are not claimed because the stored CLI credential is
expired. Draft PR #7 remains unmerged.
