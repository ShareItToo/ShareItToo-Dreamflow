# Offline Staging invitation generator — source-only Ops package

Baseline: `10d5d878`. This tool neither enables enrollment nor reads runtime
secrets, sends mail, provisions a principal, changes an allowlist or deploys.
Backend and Web enrollment flags remain independently default-OFF.

## Input contract

Only three absolute path arguments are accepted: `--request-file`,
`--allowlist-file`, `--output-bundle`. Never put email, principal, token, TTL or
JSON content in arguments, environment variables or shell command history.
The caller creates both input files outside the repository in protected storage.
Each must be a current-user-owned regular **0600** file with exactly one link;
symlinks at any path component, FIFOs, directories, duplicate JSON keys, extra
fields, unsafe permissions, another UID and oversized files are rejected.

Request JSON has exactly `email`, `userId`, `ttlSeconds`. Email must already be
normalized (lowercase, no surrounding whitespace, valid ASCII email syntax).
TTL is an integer from 1 through 86400 seconds. The ID must already occur in the
explicit sanitized allowlist JSON:

```json
{"schema":"sit-staging-access-allowlist","version":1,"allowedUserIds":["synthetic-user-001"]}
```

That example is a **synthetic schema example**, not authorization to create a
real invitation. Ops must obtain an accurate allowed-ID snapshot through an
independently authorized process. The generator verifies the supplied file,
not live server membership; the backend rechecks its authoritative allowlist.

The output bundle path must not exist. Its parent must be owned by the current
UID with exact **0700** permissions; path components cannot be symlinks. On
macOS, use canonical `/private/...` rather than `/tmp` symlink paths. Bundle
basename is limited to ASCII letters, digits, underscore and hyphen (1–64).

## Publication and secret boundaries

The tool uses the OS CSPRNG for a fresh 32-byte/256-bit base64url token. It writes
and fsyncs two exclusive **0600**, single-link regular files in a new private
staging directory, verifies metadata and content again, then atomically
publishes a **0700** bundle with a no-replace directory rename:

- `handoff.json`: schema/version, exact recipient email, token, expiry.
- `server-record.json`: schema/version, tokenDigest, emailDigest, userId,
  issuedAt, expiresAt. No plaintext email or token.

The server digest is `SHA256(token)`; email binding is
`SHA256(tokenDigest + "\n" + normalizedEmail)`. Timestamps use millisecond UTC
ISO format. The backend configuration reader expects an array of the five
invitation fields: schema/version are an Ops envelope, **not** backend fields.
Any later authorized importer must validate and unwrap that envelope; this
package does not install or print a runtime configuration.

macOS uses `renameatx_np(RENAME_EXCL)` and Linux uses
`renameat2(RENAME_NOREPLACE)`. Missing primitives/unsupported filesystems fail
closed; there is no unsafe check-then-rename or hardlink fallback. Caught
pre-publication failures remove only the generator's two known files and its
own temporary directory. Existing destinations, including racing empty
directories and symlinks, are preserved.

Successful stdout contains only status, output paths and SHA-256 file hashes;
stderr stays empty. Failure emits only `{"status":"denied"}` and exit 1.
If publication succeeded but directory fsync failed, exit 2 and status
`publication_unconfirmed` identify the complete bundle by paths/hashes. Do not
blindly retry or delete it; verify local durability first. Exit 0 is `created`.
No secret exception details, recipient or principal appear in output.

No credentials are zeroized by claim. A killed process/power loss can leave a
private incomplete `.sit-invitation-*` directory; it is never a published
bundle and needs narrowly targeted authorized recovery. Same-UID/root
adversaries, backups and copied files are outside filesystem isolation: retain
inputs/handoff only for approved private delivery, then dispose under the
existing secret-handling policy. Never commit, upload, paste into chat, or feed
the handoff into analytics. This tool has no delivery/retention automation.

Deterministic entropy/clock and failure hooks require explicit in-process
`test_mode=True`; they are not accepted by the production CLI or environment.
All tests use namespaced synthetic inputs in temporary directories; no generated
record is loaded into a server or delivered.

## Evidence and next gate

Red-first: the new test module failed on missing implementation. Green: 16
Python tests, exposed through the standard Node test runner, cover permission,
UID/type, all path-link forms, duplicates/no-overwrite/racing targets, malformed
email/user/TTL/JSON, unknown IDs, expiry and backward clocks, hook gating,
post-write tampering, output leakage, atomic cleanup and durability uncertainty.
A real Node import checks generated digests against the committed backend
configuration reader/resolver, wrong email, future issuance and exact expiry.

```sh
node --test test/tool/staging_password_invitation_generator.test.mjs
python3 -B test/tool/staging_password_invitation_generator_test.py -v
```

Verified here on macOS/Python 3.9.6. Linux support is fail-closed source, not
Linux runtime proof. Next gate: Sol review of final source, then separately
authorized operator delivery/configuration procedure. No live invitation,
mail, activation or staging enrollment acceptance is claimed.
