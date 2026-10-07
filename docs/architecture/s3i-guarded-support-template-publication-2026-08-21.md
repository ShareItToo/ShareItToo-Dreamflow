# S3I guarded support-template publication - architecture

Status: technically verified for non-live operation on 21.08.2026. Production,
external delivery and public or invited pilot operation remain closed.

## Source basis

- Drive `12_SIT_SUPPORT_MESSAGE_TEMPLATES_V1.json`, ID
  `108FRzn-xaCS8UEKrVn8DFGIE8K7R1gab`, modified
  `2026-08-20T22:28:46.549Z`; raw SHA-256
  `947f307e7919eed543c28e36af4d2b364d87dcde52025649d0d4620d64baaaa5`.
- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, ID
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, modified
  `2026-08-20T22:29:02.738Z`.
- Drive Support source of truth, ID
  `1j8cpz2uwZBZiu6RLXjPQfo6bAWotUNLN`.
- Drive Support technical/data-model/audit PDF, ID
  `19rXQidltzp3jvEWqnz4zgppTnTgL0iCl`.

The catalog contains 55 templates: 16 GREEN, 25 YELLOW and 14 RED. Runtime
loading fails before route construction if the raw hash, packet metadata,
template count, duplicate IDs or placeholder contract differs.

## Publication pipeline

1. Elevated support or admin staff locks an exact non-live support case and
   selects a catalog template and a case participant.
2. The domain layer replaces server-bound case values, validates all remaining
   variables, renders the exact body and computes its SHA-256.
3. An allowed GREEN template may be recorded immediately for an allowed case
   state. Other GREEN content remains a draft. YELLOW content enters
   `pending_approval`; RED and money-bearing content cannot enter this generic
   workflow.
4. A different active admin may approve or reject YELLOW content. Approval is
   bound to the exact rendered hash and optimistic record version.
5. Elevated assigned support or admin staff may publish an exact eligible
   draft. Publication changes only the database truth to `sent` with
   `delivery_status='in_app_recorded'`.
6. Authenticated case detail returns only sent messages addressed to that user.
   The Flutter parser and UI fail closed on an inconsistent projection.

Create, review and publication have independent bounded HTTP limits so an
idempotent replay on one action cannot consume or bypass another action's
budget.

## Database truth

Migration `038` adds the rendered hash, approval hash, independent review,
correction reference and optimistic version. PostgreSQL independently enforces:

- exact content hash and versioned template identity;
- active accountable staff sender and case participant recipient;
- assigned support ownership and a `simulation`/`internal_testing` case;
- no external notification identifiers and exact in-app sent state;
- independent active-admin review for YELLOW or RED state transitions;
- approval hash equality at publication;
- immutable payload, monotonic lifecycle and append-only history;
- a correction target that is already sent for the same case and recipient.

The database does not infer the full Drive catalog or GREEN status allowlist;
those exact source-controlled rules remain in the application domain and are
permanently checked by the wiring regression.

## Privacy, retention and audit

User export includes the support message only when the account authored it or
is the recipient of a sent message. Internal review notes, staff identities,
structured variables and hashes are omitted from the user-facing case surface.
Audit and support events contain only identifiers, template/version, hashes and
control outcomes, never rendered message text.

Privacy and retention inventories include the exact new sources and migration.
Both manifests remain `draft`, `approvalAllowed=false`; no legal period,
deletion authority or Store approval is inferred.

## Explicit exclusions

- no email, push, SMS, webhook or provider adapter;
- no scheduled reminder or automatic timeout/closure;
- no generic RED, money, refund or payout publication;
- no appeal decision, account measure or production support action;
- no Store, Cloud, VPS, DNS, payment or real-money mutation.
