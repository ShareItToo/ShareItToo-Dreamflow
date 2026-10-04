# S4AU item-details RadioGroup ratchet - architecture

Status: locally verified on 23.08.2026 at implementation commit `618916e`.
This is a non-live Flutter API and analyzer-debt reduction for `TD-RR-010`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Typed selection ownership

Both item-detail delivery layouts now place their dropoff and return choices
under separate typed `RadioGroup` owners. The group callback retains the
existing State update and delivery-selection persistence. A Vermieter delivery
or pickup choice that is not offered remains visible with its lock indicator
and is explicitly `enabled: false`; the migration does not turn an unavailable
choice into an interactive one.

The express fallback sheet independently owns its rebook/cancel, dropoff and
return selections through three typed groups. The existing rebook/cancel
branch, fallback copy and confirmation action remain unchanged. None of the 18
`RadioListTile` widgets owns a deprecated `groupValue` or `onChanged` callback
after the migration.

Five committed S4AU contracts parse all 18 radio constructors, require the
seven typed group owners, retain four persistent delivery callbacks, prove all
four unavailable Vermieter tiles remain disabled and permanently register the
package in the complete technical gate. The preceding async-context contracts
remain green after their fallback extraction was made indentation-independent.
The combined focused source selection reports 59 passes; 96 focused booking,
cancellation, checkout, confirmation, status and notification Flutter tests
retain surrounding behavior.

Because the item-detail source is bound by the release privacy inventory, its
exact source hash is updated to
`3e3a29197cd72a355065212b7eeb7f59820a7a25ce58adbc0c1ba0a564bb0035`.
The privacy disclosure remains `draft`; no classification, approval or release
state changes.

## Analyzer ratchet and evidence

The exact analyzer snapshot moved only in the intended bucket:

- total `122 -> 86`;
- `deprecated_member_use` `36 -> 0` and removal of that code bucket;
- `lib/widgets/item_details_overlay.dart` deprecation bucket `36 -> 0`; and
- fingerprint
  `973a7abbc7427743d4b4073590aa0dfe3dfca12fd7edb938f457a5231060a96d`
  -> `d7a3e505c7549ebd2c9ab92b87ba05aba9171dc2341fb9770d3404239ea337bc`.

All `unused_element`, `unused_element_parameter`, `unused_field` and path/code
counts remained unchanged. The 59 focused source/analyzer/privacy contracts,
privacy and retention validators, exact analyzer validator and 96 focused
Flutter tests pass at `618916e`.

The exact clean-head technical gate used standard Flutter parallelism. It
reached 192 green Flutter results and then retained only an idle Flutter tool
and compiler, with no test worker and no further output for more than six
minutes. The process was terminated and the run is recorded as failed, not as
release evidence. No retry, serial replacement, reduced suite, timeout or
permanent command change was introduced. S4AT exact CI run `32600955120` is
green; exact-commit S4AU CI and the retained default-parallel stress evidence
remain required under `TD-RR-003`.

S4AU clears the complete deprecation category, but does not close `TD-RR-010`:
86 diagnostics in the remaining unused-code categories still require reviewed
downward ratchets to zero plus exact-commit CI. P0B remains `HOLD` / `NO-GO`.
