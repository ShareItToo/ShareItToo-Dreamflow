# S3L separate support Privacy intake - architecture

Status: technically verified for non-live operation on 22.08.2026. Production,
external delivery and public or invited pilot operation remain closed.

## Source basis

- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, ID
  `1CcCqdsEVveiqoKJqZlA_iHKfZhttU5Le`, modified
  `2026-08-20T22:29:02.738Z`.
- Scenario `SUP-028`: a Privacy request entered through normal support must
  receive its own Privacy case, deadline and owner.
- Existing canonical taxonomy and server-authoritative route in S3A through
  S3K.

## Deterministic route

The normal Flutter intake now presents `Datenschutz & Daten` after safety and
single-issue triage. Its seven selections map exactly to the seven existing
`privacy_security` subtypes. A selected route is sent to the canonical support
endpoint with the existing safety and issue-scope evidence.

The server derives `privacy_owner`, `p2`, `red_explicit_decision`,
`waitingOn=privacy_owner` and `privacyFlag=true`. The existing p2 policy derives
the next update four hours from server `now`; the client does not supply this
time. This is an operational checkpoint only and makes no statutory deadline
claim.

The receipt parser compares the returned `caseType` and `caseSubType` with the
selected route before accepting the server confirmation. A mismatched receipt
fails closed. A matching Privacy receipt identifies the separate Privacy path
and displays the server-formatted Berlin next-update time.

## Explicit exclusions

- no natural-language classification or automatic reclassification;
- no legal deadline, identity-verification result or rights-request decision;
- no export, correction, deletion or incident action;
- no notification, provider call, production, Cloud, VPS, DNS, payment, Store
  or real-money mutation.
