# N7 Blue Ocean evaluation corpus

Status: **IMPLEMENTED — SYNTHETIC ONLY — NON-LIVE**

## Decision

N7 uses a versioned, executable JSON corpus rather than screenshots, real
objects or provider output. The corpus contains 22 listing/image/provider/
publication cases, 24 named pricing cases and a generated 90-combination price
matrix across every Stage-A category, replacement-value band and supported
condition. All inputs are synthetic, deterministic and safe for repository and
CI use. No external model, scanner, credential, account, personal data or
billed call is required.

The runner composes the actual N3 gateway, N4 image preflight, N5 regional
price engine and N6 review/publication boundary. It covers clear and uncertain
objects, multiple angles, accessory decisions, sensitive backgrounds,
prompt-like image text, timeout, malformed output, budget refusal, full owner
editing, draft rejection, manual fallback and the explicit no-auto-publish
rule. Price coverage includes every configured dimension plus geography,
source-quality mix, weighted outlier handling, shrinkage, authentic-demand
bounds, synthetic zero weight, owner options, duration, override and V5.2 fee
order.

## Evaluated correction

The first N7 run exposed one real contract mismatch: N6 placed optional G5
follow-up linking in the same transaction as the main publication. A rejected
or unavailable G5 link therefore rolled back an otherwise complete,
owner-authorized main listing, contrary to Part IV section 42.

The corrected boundary commits the main publication, upload binding, immutable
receipt and publication audit first. Optional G5 linking then runs in a second
transaction. A failure returns a generic non-blocking status, writes only a
minimized best-effort audit record and never retries automatically. It never
includes the underlying exception, source input or personal data. The main
listing remains published. A fresh PostgreSQL 16 route test proves this exact
failure path and stored publication truth.

This is not a live behavior activation: the assistant remains default-off, the
mock remains non-production and G5 remains behind its existing technical gate.

## Verification and rollback

The 48 executable corpus tests and all 90 generated price combinations pass.
Seven validator mutation tests and the permanent validator pass. The fresh
PostgreSQL 16 integration passes, including the G5 failure audit and retained
main listing. The complete supported candidate-rollover regression also passes:
711 Backend tests plus one documented skip, PostgreSQL 16, 387 Flutter tests
plus one documented skip, Web/Wasm, loopback smoke and the 448-task Android
debug build. GitHub regression run `32673817497` and CodeQL run `32673817482`
are exact and successful at implementation commit
`a6248a7cd97711eddcf9211c0c3a8cccdf1858c7`. N7 is complete and N8 is active.

Rollback is a normal revert of the corpus, tests, evidence and post-publication
G5 boundary. No schema or retained user data is added by N7.
