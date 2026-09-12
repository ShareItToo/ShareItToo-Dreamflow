# WP05 — support case reads and follow-up ownership

Status: LOCAL CORRECTION / FULL NORMAL PASS / FINAL COLD AND DEVICE PROOF OPEN.

Implementation: `e8d53d776401fd3b880f8d505dd0cacd7f4c11d1`.
Machine checkpoint:
`docs/evidence/release-readiness/wp05-support-case-read-local-20260904.json`.

Base: `a67a002d325d34b67a679c16d1224ce2a0adfe48`, branch
`codex/master-workflow-20260808`, worktree
`/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`.

## Why this package

The prior intake package proved four additional read-side P1s: a populated
list, server-confirmed empty list, direct case detail and notification detail
could all show A's delayed result after switching to B. Their four stable-A
controls passed. This package addresses those paths and their two subsequent
writes (appeal and DSA locator), not unrelated notification/moderation actions.

New real-HTTP-helper mock tests first failed in 15 specific cases while four
same-A controls passed: eight wrong-owner dispatch/401 retry paths, four
malformed-list coercions, loss of public case messages and two missing/invalid
message lists. Source inspection confirms the Backend already returns public
`messages`; the client was discarding them even though the view requires them.
No real support request, user data, server or provider was used in these tests.

## Resulting behavior

- All three screens share an immutable interaction owner, initialization
  epoch and exact owned-route lifecycle. The initiating session is checked
  before each read and before any result is accepted. A-to-B-to-A cannot
  revive an invalidated interaction; reopen the view for the new session.
- Initial loading is explicitly pending; an unavailable session shows no
  case data. Backend/parse failure is a load error, never a successful empty
  list. Only an actual, well-formed completed list can show the empty state.
- Read failures also check the stored owner before propagation, including
  when a session-change event was missed. The original error is rethrown for
  still-current A, not converted to a generic success or empty replacement.
- A pending future is observed even if its view is abandoned during bootstrap.
  The original future and error are retained for FutureBuilder. This avoids
  an unhandled abandoned error without converting its result or weakening
  displayed failure semantics.
- All four BackendRepository methods require the captured owner and the
  existing owner-only HTTP helper; no global-session 401 retry. List entries
  and message arrays are strict, and the existing public messages are retained.
- Appeal and locator forms capture their parent view's owner before their
  first await, check before sending and before reload/error display, and keep
  the original expected version and idempotency key. Ambiguous outcomes remain
  “not safely confirmed,” not “nothing happened.” No local substitute is made.
- Help Center and support notification entries pass the captured owner through
  owned navigation. Invalidation removes only A's exact route; a later B dialog
  remains. Existing server case-ID/number/schema checks remain unchanged.

## Focused proof

- 58 UI/support tests pass, including 23 maintained read/follow-up ownership
  cases, existing same-session forms, accessibility/keyboard tests, intake
  isolation and Help Center behavior. Tests cover missing owner, pending/error/
  empty distinction, A-to-B-to-A, exact route removal, pre-submit switch and
  late write success/failure without a change event.
- 25 enabled HTTP-helper tests pass: 19 read/follow-up and six earlier intake.
  The read/follow-up profile is mandatory in the normal regression and uses
  only a zone-local MockClient with a loopback base; no live traffic.
- Nine intake/read wiring tests and 207 combined privacy/retention/RW/wiring
  tests pass. New inventory assertions cover all current direct entrypoints,
  shared owner lifecycle, strict error/empty handling and both follow-up forms.
- Changed-file analyzer reports zero issues; the secret scan passes with the
  unchanged reviewed historical baseline. No suppressions or new waivers.

Two additional negative tests exposed a late-read-error invalidation omission
while this correction was being developed; owner verification now also occurs
on failure. An initial form probe had not rendered the post-edit enabled button
before tapping it. It now explicitly pumps that state and asserts the button
is enabled; no added delay, reduced concurrency or retry-to-green was used.

Proof log SHA-256 values:

- HTTP red: `6dcd33d7ea947bbdcf9dae7e546a5c61774fa0415efcc31c0739581006828ec0`.
- HTTP green: `e659cf5a2a01240eb53222fbdd22b2eafbc23ba9727000a91d54f31b31a18f0a`.
- Late-error red: `c82b451c08a91773e1d6969a5b6102b7e3d3801fa15435dbad01efe35d431c62`.
- UI green: `932dba0913002ce8da385f58ac6b1a28fb49c2c21b71ac72f2421814cfedd30f`.
- Analyzer: `e93cc7238c54148dfc9507b75846b054eba70e7125e511bdfbcd2959cc77a9a3`.

## Bindings, remaining work and boundaries

The first full run stopped at three legacy source-wiring assertions, with
2,182 of 2,185 tool tests passing. Two searched for the old ownerless method
signature and one for the old loader spelling. They now locate the new
required-owner signature and owner-bound read while retaining all final
decision, appeal-version/idempotency and exact case-ID checks, with additional
owner-only transport assertions. No behavior check was removed or waived.

Current-source inventory hashes and dependent exact ratchets were mechanically
refreshed against the base. No source path, non-hash claim, approval or validator
assertion was removed; no legal, retention, provider or historical CI state was
promoted. No schema migration. An ordinary reviewed revert plus matching source
bindings is the rollback path; it would restore the known client failures.

The final full normal regression passes: 2,185 tool tests, 724 default Flutter
tests plus all mandatory profiles (33 explicit default profile skips), whole
analyzer zero issues, Web build/Wasm dry run, loopback Web smoke and Android
debug build in 20 seconds. R11 confirms minSdk24, 14 permissions and eight
exported components; normal capacity/footprint limits pass. No standalone Wasm
runtime, signed artifact, real-device or external-CI proof is inferred.
Full normal log SHA-256:
`e296124769b8c4ca05635e0bc8f37d6ba8e5d36485064b73b7f1de76637ad232`.

Exact new-HEAD cold proof remains required: the previous intake run stopped
at npm advisory HTTP503/timeouts,
not a passed audit. No immediate retry loop or security-audit workaround is
introduced. Scoped-SDK-entrypoint technical debt remains PARTIAL until its
maintained deterministic closure and eventual exact CI.

Frozen signed/installed Pixel `2026090403` remains source
`f6a9a41471058c9f80ffd01283c42b9d74a8845c` and contains neither support correction.
No signed archive, device, Staging Backend, actual case, SMS, OnePlus, Store,
production, provider or account changed. GitHub/auth/push/CI remain owner-deferred,
not waived. Full device support acceptance and the encompassing Goal remain open.

The next bounded prerequisite is the already documented scoped-SDK invocation
debt, which caused a real wrong-SDK signed-build failure earlier. Move the
effective-selection check and scoped environment into a maintained, tested
entrypoint without altering global settings, SDK packages or release checks.
Consolidate the next full cold run on the final frozen successor source after
that prerequisite, covering both support corrections and the build entrypoint.
This is sequencing, not a waiver or a claim that cold verification passed here.
Do not distribute/build a signed successor until its exact required proof passes.

Preserve the exact local implementation commit. Do not infer broad notification,
moderation, legacy thread persistence or complete release readiness from this
bounded package.
