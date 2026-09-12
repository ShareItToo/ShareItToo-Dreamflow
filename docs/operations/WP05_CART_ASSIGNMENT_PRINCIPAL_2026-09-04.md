# WP05 cart assignment — initiating-account correction

Status: correction implemented; focused, full normal and exact clean proof PASS.
Successor/device and GitHub remain OPEN.
Source under test: `b748e3befcef7b0af0efe93135a510a98b56ba16`, canonical
`/Users/walidchraibi/Worktrees/SIT-master-workflow-20260808`, branch
`codex/master-workflow-20260808`. Only evidence documents changed during probes.
The preceding project-creation correction retains its separate exact clean
proof. Installed0404/source55a1 is unchanged and contains neither correction.
GitHub remains owner-deferred; no remote/auth/CI/PR/push activity.

## Concrete decision and evidence

`wishlists_screen.dart::_assignCartItem` opens an untracked modal sheet before
capturing an initiating account. It completes via the current Navigator and
its result is installed with mounted-only checks. The controlled local widget
probe proves that A's assignment sheet remains after A-to-B while a newer B
dialog remains on top. Stable A successfully assigns its item to its own project.

`DataService.assignRentalCartItemToProject` reads a cart, then calls the unbound
`BackendRepository.putRentalCartItem`. The enabled-backend HTTP mock returns A's
cart while installing B's synthetic session. The following PUT actually uses
B's synthetic authorization with A's item/listing/project data. Stable A uses A
and completes. This is a demonstrated mock dispatch, not an assertion that real
server validation accepted cross-account data or that the Pixel leaked data.

Each profile has one passing control and one failed desired invariant. No real
network, account, provider, payment, cart or device mutation occurs. The private
probe uses only fabricated example.invalid identities and HTTP interception.
No concurrency, timeout, cache purge, or failed-result waiver is used.

## Implemented correction and verification

The assignment captures the verified snapshot owner/epoch and reserves its own
sheet before the first await. The sheet contains the captured project list;
its callbacks complete only its exact tracked route. Account invalidation closes
that route and its owned notices; a late A finally cannot erase B's newer sheet
handle. Busy ownership is released on principal change, not inherited by B.

The optional owner on `getRentalCart` and `assignRentalCartItemToProject` is kept
through guest sync, local queues and HTTP. A dedicated owner-bound GET and the
existing owner-bound item PUT replace global credential selection in this chain.
The cart reload supplies its own captured owner. Stale reads/results are rejected;
guest fallback is not exposed after a principal change. A failed or lost reply
is shown only to the initiating account as unconfirmed, not definitely unsaved;
the UI asks for a reload before retrying. No server acceptance is undone or
silently claimed when A's result is rejected after switching to B.

The new maintained test file has12 default controls and7 enabled HTTP controls,
including both original red cases, stable guest/A, silent replacement, actual
logout/relogin epoch, stale explicit owner, late success/401/error, exact A
completion beneath B, preservation of B's later assignment handle, uncertain
notice ownership, and malformed auth rejection. The enabled profile is mandatory
in the complete regression. Five structural guards protect the owner chain,
route identity and profile inventory; the previous six project guards stay green.
Focused totals:35 default Flutter PASS,15 enabled HTTP PASS,11 wiring PASS.

The expanded first widget run had34 passes/one failure: the existing toast's
two-second callback was still pending at test teardown. The test now crosses
that exact existing deadline using Flutter's virtual clock and asserts B's
dialog survives the callback. This is a deterministic delayed-callback check,
not wall-clock waiting, a timeout/concurrency change, or a production timer fix.
TD-WP05-ASSIGNMENT-FIXTURE-DEADLINE is closed for this fixture only. The original
failure is retained. Two initial analyzer brace-style notices were corrected,
not suppressed. Final focused analyzer: zero issues.

The full normal gate passes through the unchanged v2 scoped profile:2221 tool
tests,747 default Flutter tests/33 declared-profile skips plus ALL required
profiles, analyzer0, Web build/Wasm dry run, local-loopback smoke and Android
debug43s. R11 retains minSdk24/14permissions/8exported components. This is not a
standalone Wasm-runtime test or full offline-device acceptance. Full log SHA256:
`ac90a9a6b688c2b68b170f7df186200552ce922b4875879516743b31b9f43afe`.
Debug APK SHA256:
`76d50ab9cf886bf6eb8344599afd948f398269b1734332180887d26bb67eb478`.
This normal debug output is not an archived or signed successor.

After successful regression, standard scoped Flutter cleanup removed about3GB
of regenerable intermediates;11286818816bytes (about10.5GiB) remained free.
The signed0404 APK/AAB hashes were independently rechecked unchanged. No
account, signing input, user file, other project or signed archive was deleted.
The debug digest is retained, but the generated debug APK itself is not archived.

Exact hash propagation updated24 JSON bindings and5 validator hash constants in
two rounds. All non-hash claims, memberships and validator assertions were
compared unchanged; a repeat was independently verified as a no-op. Full tool
tests pass on the final bindings. No old device/candidate/CI evidence is promoted.
Machine proof: `docs/evidence/release-readiness/wp05-cart-assignment-principal-local-20260904.json`.

Exact clean-source R10 now passes on
`b28da2aa06816fd47eefe3a6657e7674e92cce03`, through the same maintained v2
profile. The fresh detached clone has no protected inputs or reused dependency
caches. Locked restores, backend tests/syntax/audit/secrets, PostgreSQL and full
technical regression657s pass; a second Android build45s produces byte-identical
APK files and extracted entries. Debug SHA256:
`829f512e133867c76f161ecfce55d60968f2db3fde7b7e8ed9d0afbd60244a97`.
Source inventories and the checkout remain unchanged, capacity limits hold,
and the runner removes its checkout, caches and APK copies. The enclosing
wrapper exits zero. Independent source, command, identity, inventory, hash and
cleanup assertions pass. New evidence:
`docs/evidence/release-readiness/wp05-cart-assignment-principal-clean-20260904.json`
(SHA256 `c5bba254e1a63e3a4e66003f55884a87d7db0d8fc60662d9a82c50585905bc5a`).
No signed artifact, Pixel update, GitHub result, provider change or full-cart
acceptance is inferred from this debug proof. The next remaining-action probes
are independent of this established assignment closure.

## Bounded sequence and exit (steps1–3 now locally verified)

1. Bind the exact assignment sheet and its completion to the captured snapshot
   owner/epoch; dismiss only A's route and preserve newer B routes.
2. Carry that owner through the prerequisite cart read, guest synchronization,
   local queue and item upsert. A response or 401 must not select B credentials.
   Reject stale results and suppress A-only errors/navigation under B.
3. Permanently include stable owner/guest, silent switch, logout/relogin epoch,
   late success/error and HTTP cross-account controls in the normal regression.
4. Refresh exact source hashes only, preserve all non-hash legal/privacy/provider
   facts, and run focused checks, analyzer, full regression and exact clean proof.
5. Only after this closure and residual cart-path classification, freeze a new
   distinctly versioned signed Pixel successor; never overwrite0404 evidence.

Direct cart add/delete/recheck, item navigation and complete booking groups
are not proved safe by the assignment probe. They require bounded classification
before claiming complete cart acceptance. Do not silently expand this correction
to all security actions, providers, backend business rules or unrelated support.
Stop the affected action on contradictory privacy/security/release evidence;
do not block independent work merely because GitHub is deferred. No Store,
OnePlus, SMS, paid provider or production action is authorized by this package.

Private retained logs: `SIT_WP05_0404_EVIDENCE.ZJuzfC/cart-assignment-red-widget.log`
and `cart-assignment-red-http.log`, under the existing task workspace. Exact
digests and post-correction outcomes must be appended at closure, never replace
these red-first observations with a later green result.
