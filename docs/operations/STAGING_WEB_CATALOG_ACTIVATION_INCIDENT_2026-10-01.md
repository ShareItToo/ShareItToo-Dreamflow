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

## Source successor

The successor performs bounded read-only `docker inspect` convergence against
the immutable original container ID after stop/rename. Success still requires
the stopped sealed name, exact config, host configuration, mounts, image,
environment, and exact network-name-to-network-ID mapping. Only inspection is
retried; stop, rename, create, network attach and start remain single-attempt
mutations. Permanent drift fails closed and enters the existing exact rollback.
The returned diagnostic has a fixed sanitized code and phase without observed
container values.

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

This source successor is not live activation evidence and does not authorize a
remote run.
