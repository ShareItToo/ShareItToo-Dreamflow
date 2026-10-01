# Post-promotion Web fixture login proof

This source package prepares a fresh proof after Green promotion. It performs no
live login, catalog activation, API restart or database mutation. The immutable
bootstrap remains fixture/credential/schema provenance. A fresh binding and the
verified current image bind the runtime being tested; the child must receive
that exact runtime commit and `/version` must agree.

Schema-2 binding/evidence separates per-marker records (zero before, exactly two
after execution) from cumulative retained sessions, refresh records and login
audits. `authHistory` records exact before/after counts plus equal SHA-256 digests
of prior sessions, refresh records and login audits. Prior rows are preserved;
each family must grow by exactly two. Default preflight has zero growth and no
authentication or reconciliation writes. Existing identity/catalog/forbidden-
effect checks, token rejection and bounded cleanup remain required.

## Two source packages

1. Review, commit and gate the repeat-safe login runner and focused tests. Deploy
   that exact clean source read-only into a fresh protected directory. Verify
   current Staging runtime/image, runtime UID/GID and tool/import availability.
   The known starting runtime is `34194c42e5e477144b5db5a8eeb6c2d476c7aeef`,
   image `sha256:0403a5f60b94a8aa91d7cbf29ae503aea989d85aeb72fcf4cf6dc14a801670b9`;
   take fresh readbacks rather than assuming this remains current. Host Node20
   cannot run the controller: use the exact verified Node22 image, root
   controller and identical absolute source paths for host Docker bind mounts.
   Prepare a new one-hour binding and run its default preflight. Then separately
   execute the authorized two-role proof and verify protected evidence plus
   cleanup. Preserve historical bootstrap/credentials/evidence bytes unchanged.
2. Only after successful live proof, read its exact bytes using the protected
   descriptor contract. In a separate reviewed commit, pin its SHA-256 and Ops
   commit in the catalog consumer, validate schema 2 and exact current
   runtime/image, and bind cumulative DB counts to `authHistory.after` (expected
   4/4/4 after one prior successful proof, but only actual evidence is authority).
   Require the same history, identity and catalog digests. Refresh relevant
   tests/bindings and gates before any new activation preparation.

The catalog consumer's existing historical digest/Ops constants are deliberately
unchanged in package 1. It rejects the new runtime and schema-2 proof until
package 2 is complete. No placeholder hash, compatibility exception or historical
proof reuse may bridge the two packages.

## CLI contract after exact-source gate

All paths below denote fresh owner-only external files. The input directory and
its immutable `adapter.json` / `credentials.json` must retain the runtime-reader
ownership/modes required by `readProtectedFixtureLoginInput` (currently 100:101,
directory 0700, files 0600), verified against the image before use. Binding and
evidence are root:root 0600 beneath a root:root 0700 evidence directory.

```text
node <exact-source>/backend/ops/staging_web_fixture_login_verifier.mjs --prepare <protected-input-directory> <new-binding.json> <new-evidence.json>
node <exact-source>/backend/ops/staging_web_fixture_login_verifier.mjs <new-binding.json> <binding-sha256>
node <exact-source>/backend/ops/staging_web_fixture_login_verifier.mjs <new-binding.json> <binding-sha256> --execute <exact-login-ops-commit> <immutable-bootstrap-run-id>
```

Do not change the current runtime while its binding is in use. An expired
binding, differing current image, nonzero active sessions, historical-row drift,
credential mismatch or unexpected side effect fails closed without automatic
retry. A new proof does not establish browser acceptance or Phase 0 completion.
