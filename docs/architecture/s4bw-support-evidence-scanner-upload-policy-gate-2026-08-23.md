# S4BW Support evidence scanner and upload-policy gate

Status: technically verified, non-live at exact implementation commit
`7f81757abe39bc50d3dc2af8fd7cc9464f7bf1f8`.

## Closed technical gap

The live Support Packet source requires approved upload limits before external
operation and forbids silent defaults. The existing private-support evidence
workflow was already disabled in production, simulation-only, configured with
scanner transport `none`, restricted to JPEG, PNG and WebP, and bounded by an
8 MiB technical default. S4BW makes the missing external decision boundary
explicit instead of presenting that default as approved policy.

The new readiness artifact binds the exact Drive source and the current
configuration, workflow and security-design source hashes. It requires eight
authentic decisions before support-evidence intake can become eligible:

1. scanner deployment mode;
2. scanner security review;
3. processor and transfer assessment;
4. approved upload-size limit;
5. approved MIME policy;
6. retention and legal-hold binding;
7. approved operator procedure; and
8. exact signed-candidate and environment binding.

All eight remain open. No scanner vendor or self-hosted deployment was chosen,
no provider was contacted, no contract or paid service was accepted, and no
file was uploaded.

## Fail-closed behavior

`tool/validate_support_evidence_external_readiness.mjs` verifies the exact
source bindings, disabled baseline, decision inventory and all-false mutation
boundaries. It rejects source drift, credential-shaped content, changed upload
defaults, production enablement, a non-`none` scanner transport, external-AI
use or a readiness claim without all eight authentic decisions.

The aggregate external-setup validator now requires the scanner/upload-policy
gate as gate 11 and executes the new validator first. Its ordinary preflight
reports 11/11 technically prepared gates, 0/11 externally ready gates, eight
required scanner decisions, zero completed decisions and `hold-no-go`. Strict
readiness intentionally fails on all 11 gates. The canonical Support Matrix
state remains 167 scenarios, 47 requiring external evidence and zero with that
evidence currently present.

Technical preparation here means only a source-bound manifest, validator,
tests and operator runbook. It is not an integrated scanner, approved upload
policy or intake authorization. P0B remains `HOLD` / `NO-GO`.

## Verification

The 22 direct tooling contracts pass: nine aggregate external-setup tests,
seven scanner-readiness tests and six Support Matrix traceability tests. A
further 70 support-evidence, privacy and retention contracts pass without a
live provider or private evidence.

The complete local gate passes analyzer zero, 385 Flutter tests plus one
documented skip, Google-only, Web/WebAssembly, loopback smoke and a 448-task
Android debug build with binary minSdk 24. Capacity started with 1,173,172 KiB
free and 3,201,028 KiB generated and ended with 1,176,200 KiB free and the
same generated footprint: zero generated growth.

Exact GitHub Actions run `32623897547` passes the implementation head with
PostgreSQL in 26 seconds, Backend in 1:16 and Flutter/Web/Android in 7:03.
Candidate signing and API-image publication remain skipped.
