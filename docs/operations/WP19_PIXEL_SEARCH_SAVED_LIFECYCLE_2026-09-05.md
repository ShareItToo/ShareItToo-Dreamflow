# WP19 — current-candidate Pixel search and saved-state lifecycle

Status: **COMPLETE ON THE PHYSICAL PIXEL** for exact signed Staging candidate
`1.0.0+2026090506`. WP19 changes diagnostic tooling and evidence only; runtime
source remains `d350e3e26f03ec52eac1a86c1cf400148dfd50b1` and no replacement
candidate was built.

## Physical product proof

Using two distinct previously E-mail-verified Staging principals, a fresh
isolated active listing was found through the real search UI with its unique
query and the exact `Werkzeuge & Kleingeräte` filter. The renter opened the
exact listing detail and saved it to the built-in `Für später` list.

After a force-stop and relaunch without logout, the same renter still saw the
exact saved item in three stable, fully loaded observations. After switching
to the owner, the exact renter-saved item was absent in three stable
observations. Switching back restored the renter's exact saved item in three
stable observations. The renter then removed only that assignment through the
real search result and the list stayed absent across three settled
observations.

Cleanup ended the isolated listing, confirmed its public removal and restored
the protected owner session. No unrelated saved item was changed. No booking,
contract, reservation or payment was created.

## Deterministic device semantics

Four pre-proof attempts stopped safely and each independently retired its
isolated listing before restoring the protected owner. They exposed only
diagnostic assumptions, not runtime defects:

- Android represents the empty `Was` field by type and position while omitting
  its visual hint from semantics;
- the long tool-category label wraps across two semantic lines;
- Android Back can hide the keyboard while field focus and its suggestion
  overlay remain, so the static category label must first establish the
  unfocused state;
- the long exact listing title can wrap, while generic lower-page detail labels
  are outside the initial viewport.

The final diagnostic matches the unique enabled editor nearest the visible
`Was` label, normalizes semantic line wrapping, requires the query field to be
unfocused before opening the category picker, and binds the detail screen to
the normalized exact title, isolated fixture location and availability action.
These are state-based prerequisites. No timeout was raised, no test
parallelism was reduced and no success assertion was weakened.

## Verification and boundaries

Diagnostic implementation HEAD:
`3f0154bc317b0e76b3bad697b28f9f6a179bdeeb`. Complete local regression passes
2,292 tool tests, 864 Flutter tests with 33 declared skips, analyzer with zero
findings, Web/Wasm, loopback and Android. Exact-head GitHub Regression
`33988972753` passes backend, Flutter, PostgreSQL and the independent
clean-checkout reproducibility job. Exact-head CodeQL `33988972858` passes,
and there are zero open code-scanning alerts.

No runtime application, candidate, deployment, Firebase console, provider,
Google Play, tester list, Production, public registration, Stripe, real money,
OnePlus or PR-merge state changed. PR #7 remains Draft, open and unmerged.
