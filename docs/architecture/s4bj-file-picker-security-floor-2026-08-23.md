# S4BJ file-picker security floor - architecture

Status: technically verified on 23.08.2026 at implementation head
`95b0ead45c6a7706b4a65a1f054cd2a87403b289`. This package raises one
client dependency floor and migrates its three call sites. It changes no
upload destination, data category, Android permission, product flow,
production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Security and compatibility boundary

The locked `file_picker` version moved from 10.3.3 to 11.0.3. The upstream
11.0.2 record fixes a path-traversal vulnerability while resolving Android
content-provider paths. Version 11.0.3 also removes Apache Tika from Android
MIME detection. SIT now declares `^11.0.3`, locks the exact registry checksum
and therefore cannot silently resolve below the reviewed security floor.

Version 11 changes `FilePicker` from the instance-style `.platform` API to
static methods. Listing creation, message attachments and handover/return
evidence now use `FilePicker.pickFiles()` with their prior type, extension,
multiple-selection and in-memory-data arguments unchanged. A permanent source
contract binds the declared floor, lock version, absence of the old API and
exactly three reviewed calls. The Android photo-picker policy still rejects
broad media-library permissions.

No Apache Tika coordinate remains in the selected Android dependency graph.
The package's two existing Kotlin unchecked-cast warnings and wider third-party
Gradle/manifest deprecations remain visible; they are not suppressed and this
package does not claim to close them.

## Verification

Four focused dependency/API/photo-policy contracts, analyzer zero, all 384
Flutter tests plus one documented skip and exact Privacy/Retention validation
pass. The first complete local gate correctly stopped before work because the
Mac's effective release capacity was 4,161,440 KiB, below the fixed 4 GiB
minimum. No threshold or test parameter changed. Generated build output was
cleaned, and one obsolete, regenerable 10.3.3 package-cache entry was moved
recoverably off the constrained data volume.

The identical complete gate then passed from 4,211,432 KiB effective capacity
with Google-only, Web build/smoke and one direct 448-task Android debug build.
It ended with 1,011,156 KiB free and 3,193,032 KiB generated. The manual cache
move is not release evidence; exact clean-host CI is the deterministic exit.

Exact CI run `32613104943` passes at the implementation head:

- repository-owned PostgreSQL-16 fresh-cluster proof: 35 seconds;
- Backend: 1:22;
- Flutter/Web/Android: 6:24; and
- signed candidate and publication: skipped.

S4BJ is technically complete. `TD-RR-012` remains closed through its retained
capacity guard and clean-host exact CI, not through local cleanup. External
readiness remains 0/10 and P0B remains `HOLD` / `NO-GO`.
