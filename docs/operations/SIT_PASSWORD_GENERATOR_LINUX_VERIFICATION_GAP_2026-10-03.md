# Password invitation generator — Linux verification FIX

Project: ShareItToo/SIT. Source HEAD `75a8782c`; read-only preflight at
`2026-10-03T14:17:04Z`. Host reports `Darwin 25.5.0 arm64`.

## Result

**FIX: no reachable pre-existing local Linux container runtime.** No image was
pulled, installed, started, inspected or modified. Image identity/digest, Linux
kernel, container UID and in-container Python/Node versions are **NOT VERIFIED**.
The Linux `renameat2(RENAME_NOREPLACE)` branch and the 16-test suite/Node adapter
were **not executed on Linux**. The earlier macOS PASS is not portability proof.

## Read-only evidence

- `docker`, `podman`, `colima`, `container`, `nerdctl` and `lima` were not found
  on PATH; attempted Docker context/image inventory exited 127 (`command not
  found`), before any daemon contact or image retrieval.
- Checked common binary locations in `/usr/local/bin`, `/opt/homebrew/bin`,
  `/Applications/Docker.app/Contents/Resources/bin`, `/opt/orbstack/bin` and the
  user's `.docker/bin`; no candidate Docker/Podman/Colima/Lima CLI was present.
- `/Applications` showed no Docker or OrbStack application. Common Docker,
  Docker Desktop and Colima sockets were absent. Process-name-only inspection
  found no Docker/Podman/Colima/OrbStack/Lima/containerd process.
- These observations establish no **usable runtime for this bounded task**;
  they do not establish that no archived image exists anywhere on disk. No
  image store or other host was searched to bypass the local-only boundary.

Committed generator inputs are unchanged:

| Source | SHA-256 |
|---|---|
| `tool/generate_staging_password_invitation.py` | `7015601ffe9a2f07d653968ee67b0e1da614f21f33dfbe362755847dea299235` |
| `test/tool/staging_password_invitation_generator_test.py` | `d55359ee8a5f5e250ba58a3b2785ea91610e7ca2d59f71b24e2b2b43bdcfc82e` |
| `test/tool/staging_password_invitation_generator.test.mjs` | `90dc8144e27e8dc3aa6711772e7de47199a8b0669ef3ebbd0bfc6188dfc59ccb` |

## Exact next verification gate

Use an already available, verified Linux image containing both Python and Node,
or obtain a separate authorization for the missing runtime/image. Pin its
immutable image ID and available repository digest; refuse implicit pulls.
Do not substitute a tag or the host's macOS result for Linux identity.

Run as a non-root numeric UID with networking disabled, read-only root/source,
all capabilities dropped, no-new-privileges, and private tmpfs working/output.
Expose only the committed generator, two test files, backend resolver module
and necessary package metadata—not the entire host repository or credential
directories. No Docker socket, environment secret files or provider mounts.

Execute the full 16-test Python suite and Node adapter, preserving their real
backend parser/resolver compatibility checks. Record Linux kernel/architecture,
Python/Node versions, effective UID, image identity/digest, exact source hashes,
test counts, exclusive rename/no-overwrite outcome, 0600/0700 enforcement,
permission/link/tamper/collision/expiry/leakage/cleanup results and container exit.
Verify both empty private work/output space and removal of the disposable
container. Do not prune unrelated containers, caches or images.

## Cleanup and boundary

No container, temporary source tree, generated invitation, host output registry
or test artifact was created in this attempt. There was therefore no container
or secret-file cleanup to perform. The only added repository artifact is this
gap document. Product/backend/config/Compose sources, provider work and foreign
capsule were untouched. No live account, mail, activation, deploy, commit or push.
