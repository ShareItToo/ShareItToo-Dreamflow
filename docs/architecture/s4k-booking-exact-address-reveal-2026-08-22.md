# S4K booking exact-address reveal - architecture

Status: locally verified on 22.08.2026 at exact implementation commit
`59d8f1eee2d72111d1bc97034bf2114123897622`. This package implements the
non-live technical portion of Drive scenarios `SUP-046` through `SUP-048`.
It does not authorize production, Payment, Store, Cloud/VPS/DNS, signing,
pilot activation or a support disclosure of an address.

## Source basis

- Drive Support Test Matrix (file `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`,
  reviewed read-only at revision time `2026-08-20T22:29:02.738Z`), scenarios
  `SUP-046` through `SUP-048`.
- Drive Support Master Handbook (file
  `1hIUnlz0k0mIxpesUnxoVKvoMpQmD6TM1`, revision time
  `2026-08-20T22:24:39.816Z`).
- Drive Playbooks (file `1p_CpVD5czaJh0LkO_yt6F1JIoHV5BqmW`, revision time
  `2026-08-20T22:25:05.383Z`): both parties confirm the appointment; exact
  address access starts six hours before it, or immediately if confirmation
  occurs later; safety flags stop automatic disclosure.
- Drive Tech/Audit package (file `19rXQidltzp3jvEWqnz4zgppTnTgL0iCl`)
  and Support Source of Truth (file
  `1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN`).

No Drive document was modified.

## Authoritative decision path

`GET /v1/bookings/:id/address-reveal?segment=pickup|return` is the only
backend-enabled product authority for the exact listing address. It requires
authentication and an active account, returns `404` for both a missing booking
and an outsider, and uses `Cache-Control: private, no-store`.

The server reveals only when all conditions hold:

- the booking is in an eligible V5.2 workflow state;
- requester and confirmer are the two distinct booking parties;
- the confirmed instant belongs to the pickup or return booking date in the
  booking timezone;
- the server clock is at or after appointment minus six hours;
- the listing contains an exact address;
- no open booking/listing safety case and no active account-scope suspension
  affects either participant.

Late counterparty confirmation inside the six-hour window reveals immediately.
Invalid or incomplete confirmation, date drift, safety hold, backend failure
and unsupported booking state all fail closed.

PostgreSQL `DATE` values are selected as text. This prevents the local process
timezone from shifting a calendar date to the previous day before the policy
comparison.

## Client boundary

The booking list fetches the server decision before building a detail payload.
Upcoming bookings use the pickup segment; active/return-stage bookings use the
return segment. Booking details and the ongoing-owner view render exact text,
map links and structured location sharing only after that decision. Otherwise
they retain the approximate map/address and a lock explanation.

Backend-enabled product flows never use the device clock as reveal authority.
An injected-clock helper remains only in the explicitly labelled local
demo/QA branch and has exact boundary tests. If backend authority is
unavailable, the product branch returns `server_authority_unavailable` and no
exact address.

Structured chat location sharing is guarded. Arbitrary user-authored free text
is not heuristically scanned for address-like strings: such a classifier would
be incomplete, create false positives and become a brittle hidden prerequisite.
That is voluntary user content, not a system address disclosure. Support staff
remain prohibited from manually disclosing the address while the rule is
unmet.

## Audit, privacy and retention

Migration `061` enforces one request/action receipt and validates the reveal
against current database truth. Participant receipts contain exactly nine
minimized fields; outsider receipts contain exactly five. Address, coordinates
and participant identifiers are forbidden in metadata. Revealed receipts must
match appointment, date, six-hour window, participants, booking state and
safety truth. Existing append-only audit protection prevents mutation, and the
rollback refuses while S4K evidence exists.

Privacy and Retention source inventories bind the new domain, workflow,
migration and changed client sources by SHA-256. No new retention period,
deletion execution or data category is asserted; both manifests remain
fail-closed drafts.

## Local verification

- 13 focused Node tests and seven focused Flutter tests passed.
- 58 Privacy/Retention validator tests and all 37 P0B tests passed.
- Two successful fresh PostgreSQL 16 executions applied migrations through
  `061`, including denied, safety-held, early, late-window, forged-audit and
  guarded-rollback cases.
- Complete Backend result: 561 pass, one expected no-database skip, zero fail.
- Complete technical regression accepted the 220-issue analyzer baseline,
  passed 373 Flutter tests with one documented skip, separate Google-only
  coverage, Web build/loopback smoke and Android debug APK.
- Diff secret scan found no high-confidence credential pattern.
- P0B remained PSP `0/8 HOLD` and invited pilot `0/4 HOLD` / `NO-GO`.

No timing wait, rate-limit bypass, request-source rotation or production limit
change was introduced. The final full gate used a fresh PostgreSQL instance.
Temporary fixtures were stopped and moved recoverably to Trash, but manual
database orchestration, temporary Node resolution and serial Flutter execution
remain open release debt under `TD-RR-001`, `TD-RR-003` and `TD-RR-004`.
Cleanup alone does not close `TD-RR-005`.

GitHub push and CI are not claimed because the stored CLI credential is
expired. Draft PR #7 remains unmerged.
