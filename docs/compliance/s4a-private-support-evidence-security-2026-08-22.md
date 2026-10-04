# S4A private support evidence security - technical compliance record

Status: locally verified on 22.08.2026 at exact implementation commit
`06cef70fda31e2f83e621fc367909366b7277390`. This is technical non-live
evidence, not a professional legal/security certification, real malware scan,
production upload or public activation claim.

## Matrix result

- `SUP-099`: an executable renamed to `.jpg` and every unsupported magic-byte
  type are rejected; a conflicting claimed MIME type also fails closed.
- `SUP-100`: the deterministic malware fixture becomes terminally quarantined,
  receives no preview and cannot receive an access grant.
- `SUP-101`: active HTML-like content and unsafe control characters are rejected
  in persisted metadata; client filenames are ignored and never returned.
- `SUP-102`: a manually expired grant is denied on a fresh authorization check.
- `SUP-103`: a token forwarded to another authenticated participant is denied
  because user and session bindings do not match.
- `SUP-104`: the original SHA-256 remains unchanged, the separately re-encoded
  preview has its own verified hash and a database trigger rejects mutation.
- `SUP-105`: external AI and external scanner traffic remain false; no network
  transport exists in the workflow.

## Defense in depth

- Intake is default-off and enabling it in production aborts startup.
- One file, 8 MiB, bounded fields, separate upload/access/scan rate limits and
  participant authorization apply before persistence or access.
- UUID-generated storage names and path constraints remove filename/path trust.
- Original and preview identity are immutable; scan state has one terminal
  transition and no clean-by-default path.
- Originals are never served. Preview responses recheck bytes/hash and use
  `private, no-store`, `nosniff` and an integrity header.
- Grants are digest-only, exact-user, exact-session and short-lived; active
  session, active account, participation, clean scan and expiry are rechecked.
- Audit/event projections are sanitized and include no token, path, filename or
  unrestricted evidence content.
- Evidence remains explicitly unverified and unusable for a decision without
  human review.
- Privacy export and count-only Retention inventory cover the new datasets
  without inventing deletion periods or exposing internal storage values.

## Verification observed

- 12 focused workflow/wiring tests passed.
- Privacy disclosures remained `draft`, `approvalAllowed=false`; validator and
  all 17 protection tests passed.
- Retention readiness remained `draft`, with ten open policy decisions and no
  destructive execution route; validator and all 41 protection tests passed.
- Fresh PostgreSQL 16 integration passed migration `051`, idempotent upload,
  executable/XSS rejection, quarantine, clean internal-test transition, owner
  list, outsider denial, expiry, forwarded-token denial, preview integrity,
  original immutability, export and inventory assertions.
- Full local technical regression passed the accepted analyzer baseline, 369
  Flutter tests with one documented skip, separate Google-only test, Web
  build/smoke and Android debug build.
- Git secret scanning found no high-confidence secret.

GitHub push/CI is not yet claimed: the stored GitHub CLI HTTPS credential is
expired. Draft PR #7 was not merged and no release, Store, Payment, production,
Firebase Console, Cloud/VPS/DNS or public action occurred.

## Open gates preserved

The implementation is not operational malware-scanning readiness. Scanner
provider choice, contract/DPA, security review, data location, approved size
and type policy, Retention/legal-hold policy, real staff procedures, signed
candidate and manual device/accessibility evidence remain open. External AI is
not an available fallback.
