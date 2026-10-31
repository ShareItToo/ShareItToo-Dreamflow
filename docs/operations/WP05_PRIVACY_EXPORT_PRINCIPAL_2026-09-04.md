# WP05 — account-bound privacy export

Status: **FULL NORMAL AND CLEAN-CHECKOUT REGRESSION PASS / SUCCESSOR DEVICE AND GITHUB PROOF PENDING**.

## Why this interrupts the next functional export

While preparing the actual support/privacy acceptance, source inspection found
that `PrivacyInfoScreen` awaited a password dialog before selecting credentials,
then appended six independently current local data areas. It neither captured
the initiating session nor dismissed its dialog on account change. The generic
HTTP helper could refresh/retry against the then-current session. This is a
concrete privacy-sensitive precondition, not a speculative broad hardening Goal.

At clean base `66f1d6c0c9d414712a21c30a9b76528e532fe947`, two UI tests first
failed because A's password dialog remained after the session-change event,
including underneath an unrelated B dialog. An initial test-harness attempt
missed the button under the app bar; correcting the hit-test placement exposed
the actual failure. No real export, account deletion, support submission,
credential inspection or Pixel interaction occurred during this package.

The older RW16 action inventory did not include `privacy.export`; its guarded
entries therefore never proved this operation safe. This package adds that
specific action to current acceptance. It does not claim a complete re-audit of
all security-sensitive screens or change old closure scope.

## Implemented invariant

- Load a known token-free owner using a stable authentication epoch. Capture
  that owner and the screen revision synchronously before the action's first
  await; serialize the whole password/export/share operation.
- Recheck owner before the password prompt and after it. The backend requires
  the explicit captured owner and the existing owner-only HTTP helper; no
  global credential lookup or automatic 401 retry against another account.
- Validate the server export schema, account identity, data object and timestamp.
  Recheck before and after every one of the six local sections; reject a
  mismatching local account ID or any incomplete/failed section, rather than
  exporting an empty/partial replacement.
- Check owner again immediately before handing bytes to the native share API,
  and before any outcome. A-to-B-to-A with another epoch cannot revive A.
- Dismiss only exact owned password/outcome routes. Never pop the current
  navigator to remove A's dialog; a later B dialog must survive.
- Share cancellation is not reported as confirmed delivery. Once an export
  has legitimately been handed to the operating system while A is current,
  Flutter cannot revoke an external share; subsequent A outcomes are suppressed
  after a switch. No stronger revocation or on-device cache cleanup is claimed.

The screen's old stagger animation scheduled new delayed futures on every
frame/rebuild, leaving uncancellable timers at disposal. It now uses one
widget-owned ticker with a bounded interval. Tests dispose immediately: no
extra sleep, reduced concurrency or timer suppression was introduced. Outcome
dialogs are explicitly dismissed and route-owned, not delayed toast timers.

## Verification so far

- 21 focused service/widget tests: session/dialog ownership, each local-read
  boundary, malformed/foreign server output, failed local reads, delayed A
  results, same-owner complete payload and native-share result handling.
- Default disabled-backend test plus 21 existing B10 accessibility/release
  truthfulness tests: combined 43 pass with randomized order seed 7.
- Four enabled-backend tests run the actual repository/HTTP path under a
  zone-local MockClient: A credential/password-only body, stale A rejection,
  no B refresh/retry after 401, and late real-helper response isolation.
  This profile is mandatory in the normal regression and sends no live traffic.
- 190 focused wiring/privacy/RW validation tests pass; changed-file analyzer
  reports zero issues.
- Full normal regression is terminal PASS: 2,174 tool tests, 687 default
  Flutter tests plus all mandatory profiles (33 default profile skips do not
  replace those runs), whole analyzer zero issues, Web build/Wasm dry run,
  loopback Web smoke and Android debug build. Android minSdk is 24; the R11
  surface check passes with 14 permissions and eight exported components.
  The build completed in 24 seconds; source/capacity checks remained intact.
  Final full-regression log SHA-256:
  `612621fa36265ad16df04b8f645ef73f64604293ab1801ece7bbe9a936e33da3`.

The first full attempt stopped honestly at 37 tool failures: an old G2
call-location assertion plus the retention inventory's stale client source
hash. G2 now checks both UI delegation and service data coverage; the retention
source hash and dependent current ratchets were refreshed. All 183 affected
G2/retention/RW tests passed before the successful full rerun. No test was
excluded and neither retention policy nor provider activation changed.

The secret scan initially flagged literal synthetic test-password arguments.
Fixtures now use the established named synthetic-proof pattern; no real secret
was involved, and scanner rules/baseline were not loosened. The subsequent
Git-history/working-tree secret scan passes with only the existing reviewed
historical baseline. Eventual GitHub and successor-device acceptance are not
yet claimed.

## Exact implementation clean-checkout closure

Implementation is committed at `7dddc6c86161a99d72d9163aa5af08a510e9d91f`.
The exact detached, public-input-only checkout passed locked dependency
restores, backend tests and syntax, dependency audit, secret scan, isolated
PostgreSQL and the complete technical gate (673 seconds). A second forced
Android debug build passed in 48 seconds. Both APKs are byte-identical:
231,273,111 bytes, SHA-256
`d4af92b4ab56a3df0de4f5c4db074fc2949caf977645e71b2b0cce966036bfaa`.
All 794 extracted entries match; no metadata-normalization exception was needed.

All 116 migrations, 84 assets, dependency/font inventories and the clean
checkout remained unchanged. Generated project output was 3,266,391 KiB and
isolated caches 6,133,864 KiB, within unchanged limits. The runner removed its
temporary checkout, isolated caches and APK copies; no source, protected input
or retained signed archive was deleted. No purge or retry was needed.

Machine evidence is
`docs/evidence/release-readiness/wp05-privacy-export-clean-reproducibility-20260904.json`,
SHA-256 `280a291808e4edafc230ea4fc352eb11b132078a3e2c6852d056745eb7c3eccc`.
The execution-only validator passes on the exact implementation source.
Private runner log SHA-256:
`4ecf2828122512d14c6e18592abf9ef7856d10ba95ad85158a6ab5e645be811c`.
The runner's legacy `nextPackage: R11` label does not authorize a new Goal.
These are disposable debug artifacts using the pre-successor version, not a
new signed 0402 release or a change to its frozen evidence. GitHub is deferred.

## Source bindings and candidate separation

The privacy source inventory now includes `privacy_export_service.dart`.
Existing RW5–RW9 export-call checks follow the implementation from the screen
to that service; new checks additionally enforce screen delegation, all six
sections, owner-only HTTP and mandatory profile execution. No section or
privacy/retention claim was removed.

Current-source SHA bindings and dependent hash ratchets were mechanically
refreshed. The bounded refresher compares every non-hash claim to base, allowing
only the one added privacy source path; validator constant updates are hash-only.
Historical candidate/CI hashes and approval/provider states remain unchanged.
This is not legal approval, a fresh backend deployment, or device evidence.

Frozen installed Pixel candidate remains `2026090402` / source
`bfd3e9e4422a6a6e6bf3c09bd825c6a089909d04`. Its archive and earlier provisional
results remain immutable. **It does not contain this correction.** The current
mobile-source drift means the old private no-drift wrapper must reject further
claims that 0402 equals the corrected source. Full regression and exact
clean-checkout proof are complete. Build a separately versioned successor and test its
real export/support flows using disposable Staging accounts. GitHub remains
explicitly deferred, not waived. No OnePlus, Store, production or provider change.
