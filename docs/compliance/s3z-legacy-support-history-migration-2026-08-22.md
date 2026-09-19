# S3Z legacy support history migration - technical compliance record

Status: locally and CI-verified on 22.08.2026 at exact implementation commit
`c73cf25065c2c2ad568613e1b89cfee504969381`. This is non-live technical
evidence, not a claim that user histories were imported in production or that
their authorship was verified.

## Matrix result

- `SUP-153`: an eligible old open thread can create one canonical simulation
  case with an origin event and ordered append-only history. Device-controlled
  source content remains explicitly unverified and cannot be decision evidence.
- `SUP-154`: `paused` has no canonical shortcut. One explicit reason and one
  supported waiting/review/escalation mapping are required before import.
- `SUP-155`: generic local support templates are disabled. Historical threads
  are read-only; a new local presentation requires a server-confirmed canonical
  receipt and new issues use a separate canonical case.
- `SUP-156`: user/source/thread uniqueness, deterministic fingerprint and a
  PostgreSQL transaction lock make sequential and concurrent replay return the
  same import without duplicate case/history rows. Changed source bytes fail
  with conflict.
- `SUP-157`: rollback preview is elevated, aggregate and dry-run only. Feature
  disablement preserves history; schema rollback refuses once history exists.

## Data and access controls

- Import and preview require active authenticated account access and a
  dedicated bounded rate limiter.
- User/participant/sender checks prevent cross-account source or history use.
- Public preview contains no message text, source object, intake object or
  account identifier.
- Exact history is reporter-only and `private, no-store`.
- Imported text is length/total-size bounded, hashed and append-only.
- Source trust is always `unverified_user_device_source`; sender labels never
  become staff-authorship proof.
- Unknown local timezone is preserved as uncertainty rather than converted
  using an invented offset.
- Privacy export includes the reporter's history; Retention inventory includes
  both tables but applies no period, eligibility calculation or deletion.
- Account deletion continues to disclose retained support records and now
  records the legacy-history retention class; no new access remains after
  account closure.

## Operational and live boundaries

- `SUPPORT_LEGACY_MIGRATION_ENABLED` defaults to false.
- Production startup rejects the flag when true.
- Automatic import, external messages and decision-evidence use are false.
- No generic template is sent and no email, Push, analytics or provider
  transport is called.
- No decision, account/listing action, booking, quote, Payment, refund or
  payout state is derived from the history.
- Existing P0B provider/pilot gates remain HOLD/NO-GO, Privacy and Retention
  remain draft, and no legal/provider/operator approval is inferred.

## Verification observed

- Fifteen focused S3Z Backend/Retention/wiring tests passed.
- The isolated PostgreSQL 16 foundation integration passed through migration
  `050`, including concurrent idempotency, reporter IDOR, export, append-only
  enforcement and rollback preview.
- The complete Backend/PostgreSQL suite passed 504 tests without skips.
- Privacy/Retention validators and their 58 negative/positive protection tests
  passed.
- Full CI-equivalent regression passed the accepted 220 analyzer findings,
  369 Flutter tests with one documented skip, separate Google-only test, Web
  build/smoke and Android debug build.
- GitHub Actions run `32564821610` passed Backend and Flutter regression at
  exact head `c73cf25065c2c2ad568613e1b89cfee504969381` and PR merge snapshot
  `c812fe5c53c326e8a3c1e5f81d55de68d71f88df`; signed-candidate construction
  and API-image publication were skipped. Draft PR #7 stayed open, mergeable
  and unmerged.

No production data, real history import, external message, Firebase Console,
Payment, Store, signed build, deployment, PR merge or public action was
performed.
