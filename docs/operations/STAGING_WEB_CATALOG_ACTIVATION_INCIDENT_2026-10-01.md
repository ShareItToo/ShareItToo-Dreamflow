# Staging Web catalog activation incident — 2026-10-01

## Preserved result

The one-shot catalog activation did not complete and must not be retried from
the retained manifest. The replacement API passed the enabled-config and
public synthetic-catalog readbacks. It was then removed by the runner's
rollback before any final database readback. The original API, exact disabled
environment and zero-entry public catalog were restored. The private backup is
retained and no success evidence exists.

The original sanitized inner error was lost because the outer capsule performed
its own rollback assertion before preserving that error. Therefore the exact
inner code is not recoverable. Event ordering narrows the primary failure to the
read-only window between replacement public readback and the first final
database command: applied-env readback or sealed-original inspect/assertion.
The immediate sealed-container assertion is the only Docker-state read in that
window and is treated as the likely race, not as a proven exact error code.

The fresh exact-source attempt from commit
`74b40275b0e19686a8385dcac7e58033f4a76be9` also failed closed and is
non-retriable. Its sanitized failure code is
`catalog_activation_public_readback_invalid`; the fixed failure phase was not
yet present, so the retained evidence does not prove whether the replacement
or final public gate rejected the readback. Independent closure again verified
**PASS-safe rollback**: original API
`cf0548721f2c4c0df061edc0ca8d5f42a4a4e4f6301779aed05ce81eb624ee2a` is
running, the disabled environment has SHA-256
`8b5cd415a6b2a06f93c7911d130d274fee9eca5af0634529ae5e6fd51dae9441`,
the public catalog and active sessions remain zero, and database, payment and
provider boundaries are unchanged. The root-owned `0600` failure evidence is
sanitized, reports rollback restored and has SHA-256
`8f12e6bda8435cdbc6b746245dc0474cd810d66b38b9f3fa7949d56bb734522e`;
the backup and manifest remain retained while lock, controller, replacement
and seal artifacts are absent.

## Source successor

The successor performs bounded read-only `docker inspect` convergence against
the immutable original container ID after stop/rename. Success still requires
the stopped sealed name, exact config, host configuration, mounts, image,
environment, and exact network-name-to-network-ID mapping. Only inspection is
retried; stop, rename, create, network attach and start remain single-attempt
mutations. Permanent drift fails closed and enters the existing exact rollback.
The returned diagnostic has a fixed sanitized code and phase without observed
container values.

The next source successor also gives each post-start public gate an eight-read,
100-ms bounded convergence window. These reads are observational only; all
five mutation phases remain one-shot. Persistent public status, count, photo
or noncontractual-truth drift fails closed, rolls back and exposes only the
fixed failure code, the whitelisted replacement-or-final phase and sanitized
rollback result. Success evidence is written only after the stable final public
gate.

The exact-source `a74de55fa955eae2ecc38b83155066fc5eff98a4` attempt then
failed closed with code `catalog_activation_public_readback_not_converged` at
the fixed phase `catalog_activation_replacement_public_readback`. Independent
closure verified **PASS-safe rollback**. Its root-owned `0600` failure evidence
has SHA-256
`bef02de748ea93c11e071bd7486e90fea7db5b6898bfcd23337f25c5babe0d18`;
manifest SHA-256 is
`10f4d221d6eda5df1bece3862943a8d6363c56097a200d60bb48ac2f8bfd8630`,
and the retained backup matches the restored disabled environment SHA-256
`8b5cd415a6b2a06f93c7911d130d274fee9eca5af0634529ae5e6fd51dae9441`.
No success evidence, lock, controller, replacement or seal remains.

A reviewed isolated diagnostic, script SHA-256
`1a030137a6f6c9fa23875525a76f424a0247d427faa3008c0295c99ac3aa5fc9`,
started a loopback-only application process with the catalog flag enabled and
database transactions forced read-only. Its fixed-schema result passed process,
flag, response shape, HTTP status, count, page count, title, notice, photo,
catalog class and all noncontractual truth predicates; only the ID predicate
failed. Source inspection proves the cause: `publicListingFromRow` used the
authoritative relational ID for classification but spread persisted payload
into the public shape without restoring that ID, so an absent or forged payload
ID could escape. The source successor applies `id: listingId` after payload
fields. This diagnosis and source fix are not live activation evidence and do
not permit reuse of the failed manifest. The currently installed runtime image
predates the fix; a later attempt therefore requires a newly built, verified
and promoted runtime containing the fix before a fresh manifest and namespace
can be prepared.

That runtime prerequisite is now satisfied by the separately promoted D3
runtime `d3c2f5d7d7516d3bfaac4b61689c2c433924cc6e`, image digest
`sha256:31b8b015eb0635b9fbb7d6c5e54ef43fe089d5b953dba8fa446aae2122a5888a`,
using reviewed Ops `84408c04c0387a4412b8542ca1381d1be110ed1b`.
Independent promotion closure passed; this fact does not reactivate an old
manifest or namespace. A fresh schema-2 login proof on D3 is retained at
`/docker/shareittoo/evidence/web-login-proof-84408c04-20261001T061535Z/evidence.json`,
SHA-256 `0d320a50b458e5cf296ee5a1662cba7401db4a6c337e8591cc78ae914bb7eee5`.
It proves cumulative auth history `4/4/4 -> 6/6/6`, exact marker `2/2/2`, both
principals and both referential relationships, with zero active auth state and
unchanged prior-history, identity and catalog digests. The catalog flag remains
`false` and public count remains zero. This source binding still performs no
manifest preparation or activation.

## Reviewed execution-capsule requirements

A future fresh capsule must, before any secondary checks:

1. parse the entrypoint's sanitized failure object and exclusively persist it
   as a root-owned `0600` incident JSON in the fresh evidence namespace;
2. never serialize command arguments, environment values, run IDs, raw inspect
   records or stderr other than the sanitized fixed-schema object;
3. validate a restored API with immutable container ID, exact normalized
   config/host/mount/image/environment, exact network inventory and IDs, plus
   separate running, health, version and disabled-catalog assertions;
4. exclude volatile endpoint IDs, IP/MAC addresses and runtime DNS attachment
   fields from the restart-stable comparison; and
5. keep the activation mutation non-retriable and require a fresh manifest and
   fresh namespace for any later authorized attempt.

For every non-root bind-mounted worker, protected host evidence parents remain
root-owned `0700` and are never weakened for host UID traversal. The root Docker
daemon first verifies every source file's exact metadata, hash and non-symlink
identity. The exact runtime namespace must then prove the worker UID/GID can
traverse every mounted target parent, read every mounted target, and pass the
required syntax check/import before the worker starts.

Import proof covers the complete transitive source tree at its expected target
layout, not only the entrypoint directory. Fresh extracted source is normalized
to the intended controller ownership with reviewed bytes and `0755`/`0644`
modes before Git checks; `safe.directory` is never a substitute. Wrapper output
assertions derive their exact backup/evidence paths from the hash-verified
manifest and never duplicate alternate basenames.

## Browser projection incident after successful activation

The later reviewed one-shot D3 activation completed and the public API returned
HTTP 200 with exactly one correctly classified, noncontractual synthetic row.
Browser acceptance nevertheless showed `Noch keine Anzeigen` without a console
error. Source inspection proved the Flutter catalog loader was correctly
discarding the row because `Item.fromJson` remained strict while the synthetic
server projection omitted mandatory item fields. The source-only successor
keeps that parser strict and leaves ordinary projection unchanged. For the sole
synthetic row it now ignores persisted payload authority, builds the complete
public item from relational owner/listing values, emits only coarse Heilbronn
coordinates and the one exact bound public image, and fails the row closed if
relational or media evidence is incomplete. Booking, payment, ownership and
real-offer claims remain false. This record is not deployment or browser PASS.

This source successor is not live activation evidence and does not authorize a
remote run.
