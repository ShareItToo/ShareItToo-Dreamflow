# P0A closed-pilot technical readiness - 21.08.2026

## Final technical result

P0A assembles a fail-closed technical matrix for the existing single-item,
disabled same-owner multi-item and disabled project-cart/planner paths. It also
re-runs account, cancellation, withdrawal, handover/return, damage and
`needsReview`, export/deletion, recovery and synthetic payment boundaries.

The package result is deliberately **HOLD**, not launch-ready:

- 13 cells are technically passed;
- one current-source physical Pixel cell is blocked by signature/data
  preservation;
- one earlier Pixel evidence cell is historical only;
- one signed-candidate cell is not applicable under the authorization.

The exact counts and evidence references are machine-validated in
`docs/evidence/p0a/closed-pilot-readiness-matrix.json`.

Implementation commit `540583829361a402066f85c81716ba60d7d475cc` is the
exact draft-PR head validated by GitHub Actions run `32433274526`. GitHub also
validated synthetic PR merge result
`6bff2509868afd3be4f5ac8ad3829d589e7f186d`.

## Safety and legal boundary

No public pilot, real payment, live provider traffic, production mutation,
Store submission, signed candidate, account-permission change or destructive
device action is permitted or performed. Production defaults remain payment
disabled; staging and device validation remain memory/test only with Stripe
livemode false.

This technical matrix does not replace legal review. Contract wording,
withdrawal/cancellation treatment, damage allocation, data-protection review
and any consumer/commercial classification remain subject to the existing legal
gate. No historical legal snapshot is changed.

## Evidence commands

```text
node --test test/tool/validate_p0a_closed_pilot_readiness.test.mjs
node tool/validate_p0a_closed_pilot_readiness.mjs
bash scripts/p0a_closed_pilot_regression.sh
bash scripts/technical_regression_check.sh
```

The technical regression builds current-source web and Android debug artifacts.
The web artifact is served only on loopback for an HTTP smoke check. No artifact
is signed, uploaded or submitted.

Exact CI evidence passed:

- 333 of 333 backend tests, including PostgreSQL 16 integration;
- 321 Flutter tests plus one documented skip and the separate Google-only
  profile test;
- P0A validator counts 13 passed, one blocked, one historical and one not
  applicable, with real money and live provider traffic false;
- analyzer at the accepted improved 222 findings;
- current-source web debug and loopback smoke;
- current-source Android debug APK;
- secret scan, production/staging Compose validation and commit-labelled API
  image build.

The dependency audit retains one transitive moderate advisory and no high or
critical advisory. Signed-candidate build and image publication were skipped.

## Data lifecycle and rollback

P0A adds no database migration, new user-data category, provider integration or
runtime collection. It reads existing source and prior evidence and adds only
documentation, a local loopback smoke, a focused regression and a validator.
Rollback is therefore a source revert of those artifacts; no live data or
device state changes are required.

## Gates carried to P0B

- current-source physical-device evidence;
- signed-candidate authorization and final-binary binding;
- independent legal approval;
- real payment/provider approval and evidence;
- operational role assignments, backup and absence tests;
- founder-independent unit economics and operating proof;
- explicit cohort, region, category and activation authorization.

P0B-READINESS may analyze these gates but may not activate any of them.

P0A is therefore formally closed as **technical HOLD**. The result authorizes
only continuation to the independent, non-activating P0B-READINESS dossier.
