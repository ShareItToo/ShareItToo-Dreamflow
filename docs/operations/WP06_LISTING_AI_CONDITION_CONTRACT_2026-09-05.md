# WP06 — Listing-AI condition/editor contract closure

Status: COMPLETE for the local developer evaluation and the shared structured
output contract. External Staging Listing AI remains disabled. This package did
not change a provider, deployment, listing, device, Store or production state.

## Finding and correction

Four bounded synthetic image evaluations through the officially supported
local `codex_local_dev` path exposed a deterministic contract mismatch. The
provider schema previously accepted arbitrary prose in `condition`, while the
Android editor can apply only `new`, `like-new`, `good`, `acceptable` or
`worn`. A plausible model answer could therefore validate on the backend but
silently fail to populate the user-visible condition field.

Implementation commit
`e2559ada5e466be7b947755dec3bb5db2ccdb941` makes those five codes the single
domain authority, binds the provider schema to their exact enum, rejects prose
at runtime and translates only the local developer adapter's typed empty
sentinel. The adapter prompt names the exact codes and retains the existing
owner-confirmation, uncertainty, no-publication and no-price-authority rules.
It does not grant Codex authentication to the SIT runtime.

The preceding tooling-only commit
`e534375d14874d88817630b882cd1c1c0af7aa9c` ignores local provider-project
cache, vault and state paths. It contains no credential and does not change a
runtime provider.

## Evaluation evidence

After the correction, four previously unevaluated synthetic fixture classes
passed the structured contract:

| Fixture | Condition | Confidence | Owner confirmation | Publication |
| --- | --- | --- | --- | --- |
| home projector | `like-new` | MEDIUM | required | forbidden |
| cordless drill | `like-new` | MEDIUM | required | forbidden |
| camping tent | `good` | MEDIUM | required | forbidden |
| mirrorless camera | `like-new` | MEDIUM | required | forbidden |

All four evaluations used ChatGPT/Codex subscription authentication only in the
developer tool, reported no API billing and extracted no credential. No output
was published or written to Staging. These fixtures prove schema interoperability
and safe draft semantics; they do not prove external runtime-provider access,
model quality for arbitrary user images or price-engine coverage.

## Verification

- Focused domain/gateway/adapter tests: 47 passed.
- Complete maintained local technical regression: passed, including backend,
  Flutter profiles, analyzer with zero issues, Web/Wasm, loopback and Android
  minSdk 24 build.
- Exact clean-checkout R10 at the implementation commit: passed; second Android
  build was byte-identical and source/artifact inventories and cleanup passed.
  The normal root temporary volume failed closed at its capacity preflight; the
  unchanged runner then passed with the already verified external build volume
  as `TMPDIR`. This is recorded as host capacity, not a product or release
  dependency.
- GitHub Regression run
  `https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/33941394258`:
  passed, including exact clean reproducibility.
- GitHub CodeQL run
  `https://github.com/walidwalidchraibi-dot/ShareItToo-Dreamflow/actions/runs/33941394251`:
  passed; open code-scanning alerts: 0.
- PR #7 remains Draft, open, mergeable and unmerged.

The private R10 report remains outside Git. Its SHA-256 is
`a79271f84868314e50bf208e4240790cf786d96690f35b98885840f64c8990f5`.

## Retained boundaries and next finding

No dedicated external OpenAI API key is present in the verified local private
configuration, and no Staging external-AI activation occurred. Stripe CLI
authentication and V5.2 legal approval are unrelated and remain separate.

The evaluation also exposed a distinct price-domain question: the private
Listing-AI catalog allows categories that have no regional price rule, while
one mapped category currently points to a semantically unrelated price family.
That is not part of this condition-contract fix. It must be reproduced and
resolved in its own package without inventing market prices or narrowing the
already proven candidate evidence.

Sanitized machine evidence:
`docs/evidence/release-readiness/wp06-listing-ai-condition-contract-20260905.json`.
