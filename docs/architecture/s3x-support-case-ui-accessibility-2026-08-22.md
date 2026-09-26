# S3X support case UI accessibility - architecture

Status: locally and CI-verified non-live implementation on 22.08.2026 at exact
commit `3f96e93e721dcf5daef948ca7370856511293829`; GitHub regression run
`32561101446` is green for PR merge snapshot
`051f0da94e4a7b81900b54429628ce3a489687c5`. This package changes no
Backend workflow, production setting, payment, Store, Cloud/VPS/DNS state or
public rollout.

## Source basis

- Drive `09_SIT_SUPPORT_SOURCE_OF_TRUTH_V1.md`: user-facing support information
  must be understandable, restrained and free of internal codes.
- Drive `13_SIT_SUPPORT_TEST_MATRIX_V1.md`, scenarios `SUP-143` through
  `SUP-152`.
- Existing canonical support-case list/detail, published decision, appeal and
  blocked-user filter behavior.

## Presentation boundary

The server remains authoritative for case status, deadline and published final
decision. Flutter maps the supported status values to short German labels and
never renders an internal lifecycle code. A waiting-user case presents the
required action and its server-supplied deadline as a separate highlighted
information block. A published final decision retains the five distinct
sections `Entscheidung`, `Auswirkung`, `Begründung`, `Umsetzung` and
`Überprüfung`.

Closed cases continue to expose the bounded review request only when the
canonical appeal projection allows it. The `Blockiert` messages filter remains
conditional on a non-empty blocked-user set; an empty or no-longer-valid
selection normalizes back to the active view.

## Accessibility controls

- Case cards form an explicit widget-order traversal group and remain
  keyboard-activatable through their native button semantics.
- Each card has one stable semantic label and a detail-opening hint.
- Status chips expose text semantics and do not depend on color alone.
- Section titles are semantic headings; decorative icons and timeline dots are
  excluded from the accessibility tree.
- Automated widget coverage exercises two-times text scaling without clipping,
  a minimum 48 logical-pixel case-card target and Tab/Enter activation.

## Verification and residual boundary

Focused verification passes 19 Flutter widget tests and three static contract
tests. The latter bind every matrix scenario from `SUP-143` through `SUP-152`
to user copy, semantic order, large-text, keyboard, target-size, appeal and
empty-blocked-filter assertions. Privacy/Retention validation passes with the
new source hash. The complete local technical regression also passes: the
accepted 220-issue analyzer baseline, 367 Flutter tests with one documented
Google-profile skip, the separate Google-only profile test, Web build/loopback
smoke and Android debug APK build are green. GitHub repeated those gates and
passed all 493 Backend/PostgreSQL tests without skips. The signed-candidate
step and API-image publication were skipped; Draft PR #7 remained open,
mergeable and unmerged.

Automated semantics and layout checks do not replace a manual TalkBack or
VoiceOver pass on a signed physical-device candidate. That evidence remains a
later explicit device/release gate; S3X does not claim it.
