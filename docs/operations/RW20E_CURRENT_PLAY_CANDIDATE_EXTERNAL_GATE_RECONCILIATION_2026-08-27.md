# RW20E — Current Play candidate external-gate reconciliation

Status: **TECHNICALLY CLOSED, EXACT-SHA VERIFIED, HOLD / NO-GO**

## Purpose

The canonical external-gate surfaces had retained direct Pixel, Firebase and
accessibility evidence for candidate `2026082302` after exact candidate
`2026082601` became the current Google Play Internal draft. RW20E corrects that
temporal ambiguity without changing either historical fact set.

## Current truth

- `2026082601` is the current exact signed and hash-bound candidate.
- It is owner-reported as uploaded, processed and saved only as an inactive
  Internal draft.
- Active Internal version `2026081509` remains unchanged.
- Candidate `2026082601` is not expected on the OnePlus and every device result
  for it remains `NOT_RUN`.
- The next Store gate is exactly `GOOGLE_PLAY_INTERNAL_RELEASE_GO`.
- Any later non-destructive OnePlus access also requires exactly
  `ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO`.

## Historical boundary

Direct Pixel privacy, update, touch-target, lifecycle, authenticated safe-link,
Firebase default-off and TalkBack-attempt evidence remains valid only for
historical candidate `2026082302`. Application source changed before candidate
`2026082601`; therefore no physical pass transfers to the current candidate.

The technical setup manifest, machine and human execution boards, and Walid
action pack now expose this boundary. Current references identify RW20
candidate truth; historical physical references are stored separately.

## Fail-closed invariants

- No current Firebase device-default, accessibility, lifecycle or authenticated
  behavior pass is claimed.
- No release activation, review submission, tester change or device access is
  inferred from upload processing.
- Release and device gates remain independent and ungranted.
- No Console, Store, Production, Payment, provider, Firebase, Cloud/VPS/DNS,
  device, tester-list, PR-merge or credential action occurred in RW20E.

## Verification

Implementation head `028cb20ecf7a5775a534ee3bff8e4893204a2301`
passes the full local technical regression at standard parallelism, including
the complete Flutter suite, Web/Wasm, loopback smoke, Android debug and the
resource guard. Exact GitHub Regression `33036420665` and CodeQL
`33036420668` pass on that SHA; the independent clean-checkout proof passes,
the image-publish job is skipped and the branch reports zero open code-scanning
alerts. No workaround is introduced.
