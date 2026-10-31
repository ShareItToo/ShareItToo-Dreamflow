# Apple Direct-Web builder contract

Source-only successor. No provider, runtime, deployment, account-registration or
pilot approval is established by this document or the synthetic tests.

`tool/build_staging_web.mjs` accepts `--apple-web-readiness` followed by an
absolute external evidence-file path and an independently verified SHA-256 of
the complete canonical evidence bytes. Apple remains disabled without that
input. The consumer never collects provider material, produces a decision or
derives its approval digest from an untrusted file.

The file must have the current user's ownership, mode `0600`, one hard link and
a direct parent with the current user's ownership and mode `0700`. Symlink
components, unstable descriptors, non-regular files, oversized input, extra
fields and noncanonical JSON are rejected. Keep the input outside source.
This is a local trust boundary: a digest authenticates the expected bytes, not
the identity or truthfulness of whoever created them. The review authority must
independently verify the underlying readbacks and supply the expected digest.

The exact ordered field inventory is in
`tool/staging_apple_web_readiness.mjs`. Evidence schema 1 contains:

- Public Firebase Web configuration plus the Apple Services ID (`clientId`)
  and exact HTTPS Staging Return URL (`redirectUri`). The Return URL is taken
  from verified provider/backend configuration, never inferred from a fixture.
- The current Dart Direct-Web readiness schema 2, including Apple/Firebase
  Services ID, team and key identity digests, enabled provider/domain/Return URL
  checks and `existing_allowlisted_accounts_only` audience. The dormant
  Firebase-handler schema 1 cannot activate this flow.
- A separate, sanitized backend readback bound to the candidate source, exact
  observed runtime commit/image, Firebase project/app, API, Services ID, Return
  URL and team/key digests. It requires configured revocation, protected
  file-backed signing/encryption material, ownership protocol 2, enabled
  acquisition, a digest-bound enforced allowlist and existing-account-only
  behavior. It contains no credentials, account lists, tokens or secret paths.
- An independent approved review binding the candidate source and all three
  configuration/readiness/backend digests. Collector and reviewer identity
  digests must differ; the review also binds its evidence digest. Merely setting
  `activationEligible` cannot replace that decision. Synthetic evidence is
  rejected at envelope, backend and decision boundaries.

Provider/backend observations and the review have at most two-hour windows.
The review must follow both observations and expire no later than either.
Readiness timestamps use the Dart runtime's whole-second UTC representation.
Build input, sealing and candidate validation each enforce freshness. Historical
`current`/`rollback` reads validate the original bound validation time.

Apple-enabled artifacts use schema 7. The manifest, generated Dart defines,
bootstrap identity and served release profile digest bind the complete Apple
evidence. Google, Facebook and password enrollment keep their own independent
contracts; co-enabled providers must identify the same Firebase Web app. Apple
does not enable registration or inherit password invitation authority. Schema
1–6 readers remain unchanged for their existing profiles; an Apple-bearing
legacy artifact is invalid and cannot be introduced as a candidate.

`test/tool/staging_web_apple_profile.test.mjs` executes the actual builder CLI
against explicitly synthetic external compiler/smoke executables and validates
its generated manifest. `test/staging_apple_web_builder_contract_test.dart`
passes actual Node-generated defines through the Dart runtime contract. These
tests prove the source contract only; an Apple/Firebase/runtime readback and
independent release review remain necessary before any activation.
