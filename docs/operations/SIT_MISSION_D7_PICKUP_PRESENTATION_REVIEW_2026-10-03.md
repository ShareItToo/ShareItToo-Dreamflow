# D7 synthetic pickup presentation review

Result: **PASS for the bounded source/widget contract only.** D7 in the
[Mission masterplan](../product/SIT_MISSION_MASTERPLAN_2026-09-30.md) remains
open for human usefulness and coordination-effort evidence.

Reviewed source: `154f8fd92830da0bcd0edde0164f119f64dbb646` on
`codex/master-workflow-20260808`. No source or test correction was justified
by this review. This document does not attest deployment or live availability.

## Contract and consumer boundary

- `lib/widgets/mission_web_entry.dart` keeps D6-v1 unchanged and adds the
  detached `D7-pickup-presentation-2026-10-03.1` display contract. A plan must
  cover every component exactly once and match the identical display snapshot
  and its positive source revisions. Missing, duplicate, mismatched or invalid
  values suppress the complete pickup plan.
- Unknown or changed area/time states contain no positive value. They render
  explicit unknown/recheck text; stale area and time labels disappear. Two
  components in the same coarse area remain separate. Only two closed synthetic
  time windows have localized Berlin-time labels; raw UTC/revisions stay out of
  visible text and semantics.
- `lib/screens/mission_web_entry_screen.dart` is the sole product constructor
  of pickup examples. It supplies different synthetic areas and windows, marks
  local corrections as changed, and resets only the local example. The copy
  explicitly says that examples are not agreed, pickups are separate, and no
  delivery or combined pickup is promised. There is no owner identity field or
  owner-grouping inference; real owner/booking coordination is outside this
  presentation contract.
- `lib/screens/app_link_destination_screen.dart` dispatches the isolated screen.
  `lib/config/mission_web_entry_config.dart` requires Web plus the independent
  `SIT_MISSION_WEB_PREVIEW_ENABLED` flag, default false. Off/native states show
  unavailable without examples or controls; release ignores test seams.
- `test/tool/mission_web_entry_boundary.test.mjs` checks the complete allowed
  consumer inventory, pure Flutter presentation imports, no identity/location/
  travel fields and no backend/provider side effects. Legacy booking, payment,
  search and listing flows gain no consumer from D7.

## Focused verification

Executed on 2026-10-03, each with exit 0:

```sh
flutter test test/mission_web_entry_test.dart test/mission_web_entry_route_test.dart --reporter expanded
node --test test/tool/mission_web_entry_boundary.test.mjs
```

Flutter: **36/36**. Node boundary: **7/7**. Coverage includes fail-closed mapping,
immutable snapshots, unknown/changed values, DE/EN copy and Berlin windows,
native/default-off rejection, owned route/back behavior, and keyboard
correction/reset with no added focusable control. Layout/semantics fixtures
cover widths 390, 1440, 1920 and 3840 at height 1000 and text scales 1 and 2.
These are widget fixtures, not a physical mobile or browser usability study.

No full regression, build, flag change, runtime/provider action or human user
test was part of this review. No D1–D6 decision or approval is implied.

Next: Sol reviews this bounded contract result; a separately scoped D7 user
test must establish whether separate pickup locations/times and their effort
are understood before the masterplan D7 risk can close.
