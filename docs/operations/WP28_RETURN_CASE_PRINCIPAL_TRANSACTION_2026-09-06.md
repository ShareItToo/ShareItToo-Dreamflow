# WP28 return-case principal transaction

## Outcome

WP28 closes the booking return-case and issue-report path that remained outside
WP27. The screen captures one immutable principal/session owner and one action
epoch before its first asynchronous boundary. Evidence upload, the final
remote request, any local/QA write, result presentation and route completion
all retain and recheck that same owner.

The Staging path no longer writes a local success before server confirmation
and never re-resolves credentials from the globally current account. Hard
return issues use the existing V5.2 return-case endpoint through an exact
owner-bound repository method. Soft booking issues are now persisted through
the authenticated booking-report endpoint instead of remaining a local-only
note. The local/QA branch validates the exact participant, quoted amount,
evidence, return T0 and inclusive 48-hour report window before persistence.

## Result truth

Only exact structured backend status/code contracts are safe rejections:

- `400`: the defined idempotency, report-field, evidence, return reason,
  details and contested-amount validation contracts;
- `401`: authentication required, invalid/expired session or inactive account;
- `403`: moderation, report-target or V5.2 return-case forbidden;
- `404`: booking or report target not found;
- `409`: exact idempotency, active-report, contract, booking-state,
  report-window, authorization-amount or existing-return-case conflicts; and
- `429`: structured `rate_limit_exceeded`.

HTTP `408`, intermediary or unstructured 4xx, `422`, transport failures and
5xx remain outcome-unknown. A confirmed server acceptance followed by local
finalization/current-owner failure remains separately identified. Typed
results are handled before the generic catch, so the UI cannot collapse these
states into a false "Meldung fehlgeschlagen" or "nicht geändert" result.

## Account and route isolation

An Account-A response arriving after Account B becomes current is never shown
as B truth. If the server already accepted A's action, the typed failure keeps
that acceptance fact while suppressing A result UI under B. Authoritative A
state is reconciled when A is loaded again.

The screen and every notice retain exact route handles. An A-to-B transition
removes only the A-owned report screen or A-owned dialog. It never pops the
current navigator stack and therefore cannot close a newer B dialog or route.

## Verification

- Flutter analyzer: zero findings across the five affected runtime files.
- Focused WP28 Flutter tests: 7 passed.
- Focused WP28 wiring tests: 8 passed.
- V5.2 handover/return workflow tests: 13 passed.
- Complete repository tool inventory: 2,341 passed, zero failed.
- Complete local technical regression: passed with the documented
  metadata-only handling for unavailable historical private archives,
  including Flutter, analyzer, Web/Wasm, loopback smoke and Android debug
  build with minSdk 24.
- Repository secret scan: passed; no high-confidence secret in history or the
  working tree.
- Exact implementation HEAD:
  `ffaef68daabd6f34487044f5307e92129d3b84a6`.
- Exact-head GitHub Regression `34036280507`: passed all four required jobs,
  including the independent clean-checkout reproducibility proof.
- Exact-head GitHub CodeQL `34036280537`: passed. Repository-wide open
  code-scanning alerts: zero.
- PR #7 remains Draft, open, mergeable and unmerged at the exact
  implementation HEAD.

The initial full local run correctly stopped at the unavailable private
candidate archive. The unchanged complete gate then passed through its
established `CI=true` metadata-only branch. This is not Store, signing, archive
byte or physical-device acceptance.

## Ratchet cause and boundaries

The source ratchets change because `DataService`, `BackendRepository` and the
booking issue screen are protected disclosure/retention inputs. All dependent
hashes and the few exact validator constants were refreshed mechanically.
Parsed JSON comparison confirms that those historical evidence changes affect
only SHA-256 fields. The 2,341-test inventory confirms closure of the complete
dependency chain.

No historical status, legal conclusion, provider selection, billing state,
approval or live gate changed. The active provider remains `prepared-hold`.
WP28 creates no Android candidate and changes no Firebase Console, payment,
Google Play, Production, public registration, Cloud/VPS/DNS, physical device,
OnePlus or PR-merge state.

Machine-readable sanitized evidence:
`docs/evidence/release-readiness/wp28-return-case-principal-transaction-20260906.json`.
