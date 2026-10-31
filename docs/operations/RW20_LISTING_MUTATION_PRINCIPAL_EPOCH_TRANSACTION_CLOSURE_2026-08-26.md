# RW20 listing mutation principal/epoch transaction closure

## Scope

RW20 follows verified RW19 closure
`176d35d6622aefaa833b2f2194ab5ae628c93257` and closes the remaining
repository-owned owner-listing write surfaces: create, edit, draft, publish,
pause, end, reactivate and delete, plus media upload, Blue Ocean review,
supply-enrichment awaits, result UI and subsequent owner navigation.

## Confirmed cause

The prior screens validated the visible Account A at selected points but later
called listing methods that could reacquire the globally current credential.
After an await, that allowed A's payload to race with B's token. Result dialogs,
last-create state, menus and navigation also lacked one uniform exact-owner and
exact-route lifetime.

RW20 passes one captured owner through coordinator, data layer and backend
repository, keeps remote truth typed, rolls back incomplete local commits and
binds every dialog or page to its exact route identity.

## Focused proof

The red-first matrix initially failed because owner-bound listing coordination,
typed outcomes and exact route ownership were absent. It now covers exact
structured rejection, `408` and unstructured unknown outcomes, stale A before
call, accepted A after B transition, accepted-but-local-incomplete truth,
action epoch, exact dialog preservation, exact-owner create events, local
rollback, delayed accepted result suppression, a real listing action dialog
during A-to-B transition, and UI wording that never claims an unknown outcome
was unchanged.

Permanent wiring additionally inventories all listing write call sites, binds
owner-only credential acquisition, checks typed-before-generic UI handling,
media/draft await revalidation and retained regression inclusion.

## Verification state

Implementation head:
`bd1d6f3b2289c85699dd220deaafe34f7ee183fd`.

The supported local technical regression passed on that exact head with
standard parallelism: Node 1956 passed and 0 skipped; Flutter 624 passed and 3
intentionally skipped; focused RW20 13/13; analyzer 0 issues; Web build, Wasm
dry run, loopback-only P0A smoke and Android debug build all passed. The
Android surface retained minimum SDK 24. No release candidate was created.

GitHub Regression run `32974917299` passed on the same exact head, including
PostgreSQL, backend, Flutter and clean-checkout reproducibility. CodeQL run
`32974917182` also passed on that exact head, with 0 open branch code-scanning
alerts at verification time.

The first complete local attempt exposed one real compatibility defect: local
developer authentication intentionally has no server `userId`. The new
listing guard had required a server ID for every mode and therefore rejected
the valid local Wave-0 owner. RW20 now keeps server-backed sessions strictly
bound to server `userId`, while backend-disabled local development may bind
only through the already-established exact normalized login email. A focused
test covers that boundary. The Wave-0 journey now awaits the actual button
future instead of sleeping for an arbitrary duration.

No retry accommodation, timeout extension, test exclusion, order dependency or
parallelism reduction was introduced or used.

## Ratchet cause

RW20 necessarily changes listing screens, data and backend repositories, and
the permanent regression. Protected predecessor hashes and mechanically stale
wiring expectations are refreshed to the stronger owner-bound paths only.
Security call-site inventories also retain the new listing-persistence
test-only session transition and the added owner-only repository credential
lookup.
Predecessor semantic decisions and verified implementation/closure heads remain
unchanged. Backend routes/schema, privacy, retention, provider, legal and gate
truth do not change.

## Residual boundary

No live backend/device/provider run, process-termination reconciliation,
release artifact, Store/Play, payment, real-money, pilot, legal or owner-gate
proof is claimed. Those remain separate external gates after repository-owned
closure.
