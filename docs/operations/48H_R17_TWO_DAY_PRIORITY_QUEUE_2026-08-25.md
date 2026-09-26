# R17 two-day priority queue

Status: **VERIFIED — FULL REGRESSION PASSED — CODEQL PASSED — READY FOR FINAL DECISION**

R17 starts from exact R16 closure head
`dda99ed03660c509d3e713799b7001e4e6680b79` and works only the three findings
admitted by R16. It does not open another product, Support, Business, Global,
Payment, migration or provider package.

## Finding results

### `R16-P0-SEC-HISTORY-001` — owner gate prepared, still open

No secret value was read, copied or inferred. The exact safe owner procedure
and completion token are recorded in
`docs/operations/48H_R17_GITGUARDIAN_HISTORY_REVIEW_OWNER_GATE.md`. Until the
current GitGuardian check succeeds, build, upload, human pilot and PR merge
tokens remain invalid. Independent code work is complete.

### `R16-P1-STAGE-A-BINDING-001` — resolved fail-closed

Every Blue Ocean release candidate now receives
`SIT_STAGE_A_NON_BINDING_PILOT=true`; the same truth is stored in the private
archive manifest and the archive rejects a Blue Ocean artifact if the gate is
missing. The local Blue Ocean QA builder carries the same flag.

In that mode, Flutter does not load a binding remote quote, display contract
declaration checkboxes or enable request submission. It shows an unverbindliche
price simulation and the disabled action `Mietanfrage im Stage-A-Pilot
gesperrt`. The default V5.2 development configuration remains binding so its
legal/contract regression continues to run. That retained regression exposed
and corrected one stale client-build declaration (`2026082301` versus the
actual repository build `2026082302`), so future immutable acceptance metadata
again names the exact client build.

### `R16-P1-WAVE0-SURFACE-001` — resolved by honest scope reduction

G3/G4/G5 remain release-mode locked. The corrected participant path contains
only closed-Staging listing work, search, project/Saved, non-reserving cart and
feedback. Rental request, accept/reject, Payment/Refund/Payout,
handover/return/damage/`needsReview` and G3/G4/G5 are explicitly `not-run`.
The previous R14/N9 documents remain historical; the R17 template supersedes
their broader human task list for the next candidate.

## Changed behavior and rollback

The change is build-time, narrow and reversible: removing the Stage-A define
returns the ordinary binding V5.2 development path, while the release builder
itself always couples Blue Ocean to non-binding. No migration or stored data is
changed. Before an authorized build, rollback is a normal revert of the R17
implementation commit. Never weaken the archive check to make an artifact pass.

## Verification

Focused legacy checkout, Stage-A profile and archive tests pass; the Stage-A
profile is compiled with the exact non-binding dart define. R17 artifact tests,
privacy/source hash validation and the full candidate-rollover regression pass
in CI-metadata mode. Exact implementation commit
`57a9616951510be353044a0d4d764e429e271d89` passed GitHub Regression
`32784610782`, CodeQL workflow `32784610640` and Advanced Security check
`97614261868`, with zero open PR code-scanning alerts. No candidate was built,
no Pixel or human data was changed and no live surface was accessed.

Next package after exact verification: `48H_REMOTE_READINESS_DECISION` only.
