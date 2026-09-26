# S4AJ owner-requests async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `9727cf6`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Owner-request lifecycle boundaries

The decline action awaited its status mutation and list refresh before opening
result UI through the owner-requests screen context. It already guarded the
mutation boundary, but a disposal during refresh remained unguarded. A second
State lifecycle check now stops that late result before popup creation.

The completed-rental inline review awaited current-user lookup before opening
the review sheet through the same State context. It now stops when that State
has been disposed. Acceptance, decline, review, quote, status-transition,
refresh and destination behavior are unchanged.

Three committed S4AJ source contracts lock both lifecycle boundaries and reject
lint suppression. Together with the existing owner-list and V5.1 acceptance
contracts, 21 assertions pass. Fifteen focused owner-request, pricing, checkout
and review Flutter tests retain hydration, strict quote, declaration and review
behavior. Existing product popup timers remain unchanged and are not a test or
release prerequisite.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `196 -> 194`;
- `use_build_context_synchronously` `74 -> 72`;
- `lib/screens/owner_requests_screen.dart` bucket `2 -> 0`; and
- fingerprint
  `80c9450eda2af563072e34fe4fc0a2fa31e166def4e6d5c6ac28d2930be0080e`
  -> `8d1861725889696144f3a632187bdc795d5abe599b33139f5bc3d95d60c65e98`.

All other code and path/code counts remained unchanged. The complete clean
local metadata gate passed at `9727cf6acfcb0cd7f1d17721540aede22f9287bc`
with the exact 194-diagnostic snapshot, 384 Flutter tests plus one documented
skip, Google-only, Web build/smoke and one direct 448-task Android debug build.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
