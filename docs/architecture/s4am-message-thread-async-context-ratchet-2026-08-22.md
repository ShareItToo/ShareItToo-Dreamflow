# S4AM message-thread async-context ratchet - architecture

Status: locally verified on 22.08.2026 at implementation commit `d481515`.
This is a non-live source-safety reduction for `TD-RR-010`; it changes no
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Message-thread lifecycle boundaries

Four asynchronous chat paths previously retained the screen context:

- owner acceptance after choosing the two legal declarations;
- booking-detail navigation after request, item and owner hydration and after a
  renter delivery-selection lookup;
- handover/return time proposal after loading the persisted flow state; and
- other-party profile navigation after resolving a fallback user ID.

Each path now stops when the owning State has been disposed before later UI.
The owner route is protected after shared hydration, while the renter route
rechecks again after its additional delivery lookup. Both profile result
branches are protected by the same post-lookup check.

Six committed S4AM source contracts lock these boundaries and reject timing or
lint accommodations. Together with twelve existing owner-acceptance contracts,
eighteen source assertions pass. Ninety-six focused chat, booking, acceptance,
handover, return, QA, release-truth and confirmation Flutter tests retain the
surrounding behavior.

Because the message thread is source-bound by the release privacy inventory,
its exact source hash is updated together with this reviewed source change. The
privacy disclosure remains `draft`; no classification, approval or release
state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `188 -> 182`;
- `use_build_context_synchronously` `66 -> 60`;
- `lib/screens/message_thread_screen.dart` context bucket `6 -> 0`; and
- fingerprint
  `fb539341b569d96de829b1d4f9c0c706e6c65066d2eaeb3f0b563dfe33e35cf2`
  -> `44ca5afd2e1eb86cdac3fda478dbc76bde2de2682e903d506acf929c589908a8`.

All other code and path/code counts remained unchanged. The complete clean
local metadata gate passed at `d481515b71ec065fe1d80cc1bcaca3a2b8707acf`
with the exact 182-diagnostic snapshot, 384 Flutter tests plus one documented
skip, Google-only, Web build/smoke and one direct 448-task Android debug build.

This is another downward step for `TD-RR-010`, not closure. Further reviewed
source ratchets to zero plus exact-commit CI remain mandatory. P0B remains
`HOLD` / `NO-GO`.
