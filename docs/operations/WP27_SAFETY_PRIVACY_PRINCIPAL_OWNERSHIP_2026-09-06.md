# WP27 safety/privacy principal ownership

## Outcome

WP27 hardens the reachable user-report, block and unblock surfaces against
Account-A-to-B transitions. Every action now retains one immutable
principal/session owner and one screen-local action epoch from before its
first asynchronous boundary. The same owner is checked immediately before a
remote request, after the response, before any local cache write, before result
UI and before navigation.

Remote report, report-evidence and block-list requests resolve credentials only
for that captured token-free session owner. They never refresh or fall back to
the globally current account. Local safety state is written only to the
captured opaque principal. If A changes while B is current, A's late result is
discarded from B's UI and local state; a confirmed server-side A change is
reconciled when A next loads its authoritative state.

## Result truth

Only the following exact structured backend contracts are treated as a safe
rejection:

- `400`: invalid block/report target, reason, priority, evidence, details or
  reference; self/own-content reports; non-owned evidence; invalid harassment
  block-report fields;
- `401`: authentication required, invalid/expired session or inactive account;
- `403`: report target or upload forbidden;
- `404`: user, report target or upload not found;
- `409`: the defined harassment/report conflict states; and
- `429`: the structured `rate_limit_exceeded` contract.

HTTP `408`, intermediary responses, generic/unstructured 4xx, 422 and all
transport/5xx failures remain outcome-unknown. The UI therefore distinguishes
an exact rejection, a confirmed remote acceptance followed by local failure,
and a request that may have succeeded while its response was lost. Typed
results are handled before the generic catch and are not collapsed back into a
generic "not changed" message.

## Route and message-action ownership

Safety dialogs, general dialogs and sheets use exact route handles. An A-owned
route is dismissed on A-to-B invalidation, but the controller cannot pop the
current navigator route globally and therefore cannot close a newer B-owned
dialog or navigation element. The messages swipe menu now delegates before
its first await to an owner-capturing controller; the sheet close button and
every choice use that exact route handle. Read/archive/delete server calls also
retain the captured auth owner through mutation and authoritative refresh.

## Verification

- Flutter analyzer: zero findings across the 12 affected runtime files.
- Focused Flutter regression: 65 passed.
- Focused WP27/tool wiring: 15 passed.
- Complete repository tool inventory: 2,333 passed, zero failed.
- Full technical regression: passed, including 887 Flutter tests with 33
  declared skips, analyzer, Web/Wasm, loopback smoke and the Android debug
  build with minSdk 24.
- Exact implementation HEAD:
  `6b39ebf898a979951c330f6fba58fdd0951ffe9f`.
- Exact-head GitHub Regression `34032500401`: passed all four required jobs,
  including the independent clean-checkout reproducibility proof.
- Exact-head GitHub CodeQL `34032500382`: passed. Repository-wide open
  code-scanning alerts: zero.
- PR #7 remains Draft, open, mergeable and unmerged at the exact
  implementation HEAD.

The source ratchets changed because the protected runtime files, disclosure
bindings and their dependent evidence hashes changed. The update is mechanical
and validated: it changes no historical status, legal conclusion, provider
selection, billing state, approval or live gate. The active provider remains
`prepared-hold`.

## Boundaries and remaining risk

WP27 changes no Firebase Console, provider configuration, payment, Google Play,
Production, public registration, Cloud/VPS/DNS, physical device, OnePlus or PR
merge state. It creates no Android candidate.

`report_issue_screen.dart` remains a distinct booking return-case/evidence
workflow using its existing report-upload path. It is deliberately not claimed
as covered by this user-safety package and remains the leading candidate for a
separate principal/epoch transaction package after WP27 closure.

Machine-readable sanitized evidence:
`docs/evidence/release-readiness/wp27-safety-privacy-principal-ownership-20260906.json`.
