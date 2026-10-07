# S4BM Android Gradle warning visibility - architecture

Status: technically verified on 23.08.2026 at implementation head
`1ad3410bd144be6fe5c5af65f1dd6a586573ad3d`. This package changes only
Android build diagnostics and their fail-closed ownership boundary. It changes
no app behavior, dependency version, permission, production, Payment, Store,
Cloud/VPS/DNS, pilot or activation state.

## One visible build, one ownership boundary

The complete release-readiness gate previously executed Gradle with its
default warning summary. A successful build therefore said that deprecated
features existed without retaining their individual sources. S4BM keeps the
single direct `:app:assembleDebug` invocation but adds `--warning-mode all`,
captures its combined output, preserves the original build failure and then
prints the complete output unchanged.

After a successful build, the gate rejects any warning location beginning
with the current checkout's `android/` Build-file or Settings-file path. This
is the SIT-owned Gradle-script boundary. Warnings from resolved plugin or
Flutter toolchain paths remain visible and must be removed through compatible
bounded upstream updates; they are not silently suppressed and do not become
an accepted baseline.

The source contract proves that exactly one Android build remains, the full
output is printed, `none`/`summary` warning modes cannot replace `all`, both
SIT-owned path checks remain active and the contract itself remains registered
in the complete gate. Existing one-attempt and release-host capacity contracts
continue to guard the same command position and prohibit retry/timing
workarounds.

## Verification

Eleven focused warning, one-attempt, capacity and lifecycle contracts pass.
The complete local gate passes analyzer zero, 385 Flutter tests plus one
documented skip, Google-only, Web/Wasm, loopback smoke and one 448-task Android
build. Its full Android output attributes remaining Gradle warnings to
third-party Pub-cache or Flutter SDK paths and no SIT-owned Gradle script. The
gate starts with 4,638,936 KiB effective capacity and ends with 1,333,388 KiB
free, 3,308,856 KiB generated and 8 KiB growth.

Exact clean-host CI `32615539334` passes at the implementation head:

- repository-owned PostgreSQL-16 fresh-cluster proof: 40 seconds;
- Backend, audit, Compose and image build: 1:23;
- Flutter/Web/Android: 6:27;
- analyzer zero, 385 passes plus one documented skip, Google-only pass,
  positive Wasm result and Android `BUILD SUCCESSFUL`; and
- full Android warning locations are under `/home/runner/.pub-cache/...`, no
  checked-out SIT Android build/settings warning was accepted.

Publication and signed-candidate steps remain skipped. S4BM closes
`TD-RR-016`; all 16/16 deterministic exit contracts are retained. External
readiness remains 0/10 and P0B remains `HOLD` / `NO-GO`.
