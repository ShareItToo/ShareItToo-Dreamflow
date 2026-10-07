# S3A safety-first support intake - technical compliance record

Status: verified non-live implementation, fail-closed.

Exact commit: `613adc06c9504b4778adf81b5ba5b892d3435825`.
Exact successful GitHub Actions run: `32500301293`.

## Bound source and scope

This package implements the safety-first intake order required by Drive Support
Packet scenarios `SUP-017` and `SUP-093` and message template `T-003` version
`1.0.0` in packet `SIT_SUPPORT_PACKET_V1_2026-08-20`.

The user must answer whether immediate danger exists before the normal support
categories are displayed. A `yes` or `unsure` answer shows the bounded T-003
guidance first. The implementation deliberately omits the template's
`{{case_id}}` sentence before a server case exists; no placeholder or case
identifier is invented.

The emergency-number baseline was cross-checked on 21.08.2026 against the
official Federal Office of Civil Protection and Disaster Assistance guidance:

- `https://www.bbk.bund.de/DE/Warnung-Vorsorge/Vorsorge/Gesundheit-und-Hygiene/Erste-Hilfe-und-Notruf/erste-hilfe-und-notruf_node.html`
- `https://gesund.bund.de/notfallnummern`

## Implemented controls

- The Flutter flow starts with a mandatory immediate-danger question.
- `yes` and `unsure` share the safer route: end the encounter, move to a safe
  place, do not hand over or accept the item, use 110/112 in immediate danger,
  and understand that SIT is not an emergency service.
- Evidence is requested only when safe. The screen warns against live
  locations, passwords, PINs and payment data in support.
- Normal intake stays hidden until the safety guidance is acknowledged or the
  user reports no current immediate danger.
- The result carries the exact packet, T-003 and safety-triage schema versions.
- Backend intake requires the versioned triage object, rejects missing,
  contradictory or forged-version evidence and derives the immediate-danger
  signal from that object rather than from a free client flag.
- Immediate danger forces P0, critical severity, red explicit-decision
  boundary and `trust_safety_owner` routing even when the selected case family
  began elsewhere.
- The initial append-only `case.created` event stores the bounded triage
  evidence. No free text, location, contact detail or emergency-call content is
  added to the audit metadata.

## Local verification

- Focused support-domain and support-workflow tests: 32 passed, zero failed.
- Focused Flutter safety-flow tests: 3 passed, zero failed.
- Full Backend regression: 391 passed, zero failed, one local PostgreSQL
  integration test skipped because no local PostgreSQL service was configured.
- Privacy/retention validator tests: 56 passed, zero failed; both executable
  validators passed in their expected fail-closed draft state.
- Dependency audit: no high or critical advisory; one moderate advisory remains
  within the reviewed baseline.
- Secret scan: no high-confidence secret; all 12 findings matched the reviewed
  historical baseline.
- Full technical regression: 324 Flutter tests passed with one existing skip;
  the separate Google-only social-auth test passed; Web release build and smoke
  check passed; Android debug APK built successfully with OpenJDK 17.
- Exact GitHub run `32500301293` passed Backend including PostgreSQL 16 and the
  full Flutter/Web/Android debug regression. Signed-candidate construction and
  API-image publication stayed skipped behind their closed gates.

## Persistent boundaries

- The app does not place a call, contact emergency services or represent SIT as
  medical, police or emergency advice.
- No external support message is sent and no live support case is created by
  this package.
- No production, Cloud, VPS, Store, DNS, payment, public pilot or real-money
  state changed.
- No legal, operator, provider or professional safety approval is claimed.
