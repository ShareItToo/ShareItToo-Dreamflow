# WP154 — Account export scope and counterparty protection

Status: **TECHNICAL CLOSURE; FULL LOCAL REGRESSION PASSED; PROFESSIONAL LEGAL REVIEW OPEN; EXTERNAL GATES HOLD**.

## Decision

The former single account export mixed two legally different purposes and
returned one broad database-shaped document. WP154 separates:

- `access_copy`: the authenticated account holder's intelligible access copy;
- `data_portability`: the narrower own/provided/observed, machine-readable
  portability subset.

This implements the conservative project interpretation in the P0B AI
preassessment. It is not professional legal approval. Article 15 access/copy
and Article 20 portability remain distinct; Article 15(4) and Article 20(4)
require the rights and freedoms of others to remain protected.

Official sources used for this technical interpretation:

- GDPR, especially Articles 15 and 20:
  https://eur-lex.europa.eu/eli/reg/2016/679/
- EDPB Guidelines 01/2022 on the right of access, final version 2.1:
  https://www.edpb.europa.eu/documents/guideline/guidelines-012022-on-data-subject-rights-right-of-access_en
- European Commission overview of individual data-protection rights:
  https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en

## Server contract

`POST /v1/account/export` accepts exactly `currentPassword` and
`exportPurpose`. The closed purpose enum rejects missing, padded, differently
cased or unknown values. The current authenticated principal is the only export
subject, password verification remains mandatory, and a repeatable-read
transaction produces schema `2.0` plus immutable purpose/policy audit metadata.

Purpose-specific filenames prevent the client from presenting one artifact as
the other. Responses remain `private, no-store` and `nosniff`. The root
`accountId` is retained solely as the client-side principal binding; identifiers
inside `data` are replaced with document-local `ref_......` values while
cross-record relations remain usable.

## Counterparty and security policy

Both purposes withhold authentication secrets, device labels, user agents, IP
addresses, provider subjects, Firebase user IDs, session and idempotency
identifiers, internal payment/configuration hashes, private-pilot fields,
internal moderation reasoning/detection, security evidence internals and raw
request identifiers. A runtime postcondition refuses a finished document if a
known forbidden key or raw structured identifier survives.

The access copy includes user-visible shared content where needed to explain
the account's transactions. A received structured exact-location share is
redacted to a fixed marker; the sender's own structured location remains
available. Ordinary received message text is not silently rewritten because it
is user-visible context, but edge-case redaction remains an explicit
professional-review item.

The portability projection includes own account/profile data, own listings and
listing sets, participant bookings/contracts/withdrawals, own proposals and
actions, sent messages/support messages, submitted evidence/reviews/reports,
preferences and observed financial activity. It excludes received messages,
received reviews, internal audit, session history, notification history,
moderation decisions and other inferred/internal records. Quote positions are
included only when their exact quote was proposed by the exporting principal.

## Client integrity

The Flutter flow captures the principal and session epoch before its first
await and rechecks them before remote work, after the response, around every
local section, before sharing and before outcome UI. A stale Account A export
cannot collect Account B local data or display/share under B. Only the exact
export-owned dialog route is dismissed; unrelated B routes are not popped.

The client validates schema, purpose, root account binding, policy and data
before combining server and local sections. A local-section failure aborts the
whole artifact. Portability uses only the three portable local sections.
Client-side storage and provider identifiers are stripped or reference-mapped,
and only the legacy cleanup name plus the two exact v2 filenames are permitted
in the controlled temporary store.

## Verification

- focused Backend policy checks: **5/5 passed**;
- focused account-export wiring checks: **4/4 passed**;
- focused Flutter export interaction: **28/28 passed together**;
- Backend suite: **1002 tests, 1000 passed, 2 intentional skips**;
- fresh PostgreSQL integration: **2/2 passed and cleaned up**;
- complete CI-equivalent Mac-mini technical regression: **exit 0** with
  **3041/3041 Tool tests**, **954 Flutter tests passed plus 33 intentional
  skips**, **0 analyzer findings**, Web/Wasm build, loopback smoke and Android
  debug build passed;
- exact-head GitHub Regression/CodeQL: **pending until commit and push**.

## Boundaries and remaining risk

No provider call, payment, money movement, deployment, Production, Store,
Firebase, Cloud/VPS, device, credential or PR-merge action is part of WP154.
The edge-case redaction review and professional legal approval remain open.
Purpose/legal-basis/recipient disclosures, retention/legal-hold periods and DSA
classification/moderation transparency remain separate P0 packages. Exact
provider regions, DPAs, transfers and subprocessors still require current
external facts.
