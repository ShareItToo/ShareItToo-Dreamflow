# Staging Web Phase 0 closure — 2026-10-01

## Decision

**TECHNICAL PASS.** The separate Web/CORS and safe synthetic-catalog Phase 0
prerequisite is closed. This is not Mission / Blue Ocean completion, Production
or Google Play release evidence, real-user acceptance, provider activation,
legal approval or real-payment proof. The next product package is P2 — durable,
non-binding mission need.

## Exact source and runtime

- Source/Ops HEAD: `441d28608fbffaab2e12aa79dd880375bc2f25cf`.
- Exact-HEAD Regression `36841477458`: success, four core jobs green.
- Exact-HEAD CodeQL `36841477439`: success.
- Runtime source: `6c0ef70db2656df3e378add858d5f5157388127e`.
- Runtime image digest:
  `sha256:16a90e4fbc3710e37c9e319fe5db545d6da6348448848c94c6bfc661eac47357`.
- Publication run `36834482750`, publication-manifest SHA-256
  `50074f2a9d3c43d30714ac9992854d9766a271f256ae169cb926b91bb24ad61b`.
- Staging Web release `1.0.0+2026092905`, source
  `1ebc6eaf695e0cd9365680cdecd711b3edbb5586`, manifest SHA-256
  `b050417566e4cda220e07c94693d27fd47740fb818ea6bfc0616dc561e9bbfa3`.

## Promotion and independent readback

Attempt-01 stopped before canonical database mutation at
`synthetic_sandbox_provision_isolated_failed` and completed verified cleanup.
The cause was bounded to two exact, non-secret worker sources installed as
root-owned `0600` but executed as UID/GID `100:101`; Git tracks them as `0644`.
Their bytes remained exact. Mode-only normalization to tracked `0644` passed a
networkless exact-image worker read/import probe. A fresh attempt-02 no-mutation
preflight then bound the same target/config/runtime/publication/Ops/ledger
tuple, and execution completed once.

Protected attempt-02 artifacts:

- evidence:
  `/docker/shareittoo/evidence/green-promotion-d3c2f5d7-ops-441d2860-to-6c0ef70d-attempt-02.json`,
  root-owned `0600`, single-link, SHA-256
  `b74975dccf56616e7231d7e0697c2351988efd8af09030974066baf4b1b16cad`;
- backup: same path plus `.pgdump`, root-owned `0600`, single-link, SHA-256
  `201eb969e478fcbe400fabb373741f223a7526051b63a04e3c6d3eb5ec071a6c`.

Independent readback proved the canonical API running the exact image and
revision with zero host ports on the exact Green/provider networks and only the
approved uploads/MFA/Firebase mounts. Schema remains `98`; ledger digest remains
`796f0e19572f4883435d5825baae9004b1f5ec2e706a4114d7731cf2a21cf196`.
Before/after database-state projections are byte-equivalent: two fixture users,
retained auth/refresh/login-audit counts `6/6/6`, active auth/refresh `0/0`, one
identity, one listing/upload, and zero booking/request/payment-command effects.
All isolated rehearsal containers and networks are absent. D3 is retained as a
stopped exact seal.

## HTTP and browser acceptance

- `https://staging.shareittoo.com/api/version` returns exact runtime `6c0…` and
  environment `test`.
- Exact-origin OPTIONS for `https://staging.shareittoo.com` returns `204`, the
  same `Access-Control-Allow-Origin`, and the bounded allowed-method set.
- The Staging catalog returns exactly one strict Item-compatible row classified
  `synthetic_noncontractual_catalog_only`, with `realOffer`, `ownerDeclaration`,
  `bookingAllowed` and `paymentAllowed` all false.
- Its exact image returns HTTP `200` and `image/webp`.
- A fresh browser tab visibly showed the synthetic card and notice. Opening it
  showed `Synthetische Testansicht`, the explicit invented-data/image disclaimer
  and disabled `Nicht buchbar – nur Katalogtest`; no browser warning/error was
  present. No price, rental-cart or reservation action was exposed.
- The earlier protected two-role login/me/logout/token-rejection proof remains
  separately bound to the preserved auth baseline; promotion readback proves
  its full auth digest and counts did not change. This catalog acceptance did
  not create a new authenticated session or alter those retained rows.
- `https://shareittoo.com` remains the unchanged Production surface and its
  catalog remains empty. Ordinary iteration stays on Staging.

## Safety boundaries and next package

Payment, mail, push and identity remain memory-only; Stripe live mode is false;
external Listing AI and technical Sandbox/provider traffic remain off; Google
registration remains closed. The synthetic catalog row cannot create a real
offer, owner declaration, booking, payment or contract.

The incident-prevention source successor adds exact `0644`/hash/no-follow
worker checks and an exact-image UID/GID `100:101` networkless syntax/import
gate before any quiesce or backup. It changes no product/runtime behavior and
must pass its own exact-HEAD source review/CI. After that successor, start P2;
do not replay Phase 0 or upload an ordinary iteration to Google Play.
