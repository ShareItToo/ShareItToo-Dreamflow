# S4X Flutter analyzer debt ratchet

Status: locally verified, non-live; `TD-RR-010` remains open until zero.

## Canonical checks

From the repository root:

```sh
node --test test/tool/analyzer_baseline_wiring.test.mjs \
  test/tool/validate_flutter_analyzer_debt.test.mjs
flutter analyze 2>&1 \
  | node tool/validate_flutter_analyzer_debt.mjs --log -
```

The focused command must report seven passes. The validator must accept exactly
220 diagnostics and fingerprint
`3a2fcf242ac029bcf4e3f2b70a92660700f88b68a05e3a3fca7d81b94b5010bd`
until the next reviewed source reduction.

## Reduction procedure

For each bounded cleanup package:

1. fix a coherent source issue set and run its focused behavior tests;
2. run `flutter analyze` and confirm the total strictly decreased;
3. print the proposed current snapshot with
   `node tool/validate_flutter_analyzer_debt.mjs --log <log> --print-current`;
4. review every changed code and path/code bucket;
5. update the committed JSON in the same source commit; and
6. run the focused validator tests and complete technical gate.

Never raise the total, replace one finding with another, suppress a lint, make
warnings non-fatal or update the snapshot without a reviewed source fix. A
lower result without a matching ratchet is intentionally red so the removed
debt cannot silently return.

## Release boundary

The exact snapshot is containment, not closure. `TD-RR-010` closes only at zero
diagnostics with green exact-commit CI. The work must not change production,
Payment, Store, Cloud/VPS/DNS or pilot state. P0B remains `HOLD` / `NO-GO`.
