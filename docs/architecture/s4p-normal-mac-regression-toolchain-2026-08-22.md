# S4P normal Mac regression toolchain - architecture

Status: locally verified on 22.08.2026 at exact package head
`3a2543118782429de38c7f81c63cf09449d90a17`. Backend bootstrap implementation
is `427232e3d42ad2e68982c96746373bd789653c04`; full-regression bootstrap is
`0e65de32cfb056808a2545590082448781c25ce0`. This is a local/free
release-readiness package for `TD-RR-001`, `TD-RR-003` and `TD-RR-004`; it
changes no production, Payment, Store, Cloud/VPS/DNS or pilot state.

## Stable normal-shell contract

The repository now pins Node major 22 in `.node-version`, Flutter 3.41.7 in
`.fvmrc`, pnpm 11.16.0 in `backend/package.json` and Java major 17 in the macOS
regression bootstrap. CI already uses the same Node/Flutter/Java versions.

`bootstrap_macos_backend_toolchain.sh` installs Homebrew `node@22` when absent,
links it normally, activates exactly pnpm 11.16.0 through Corepack and verifies
the repository pins. `bootstrap_macos_regression_toolchain.sh` composes that
check with Homebrew Java 17 and FVM Flutter 3.41.7/Dart 3.11.5, then exposes the
FVM global binaries through the normal Homebrew bin directory. Both scripts
have a read-only `--check` mode.

On this Mac mini a completely new login shell now resolves:

- `/opt/homebrew/bin/node`, Node `v22.23.2`;
- `/opt/homebrew/bin/pnpm`, pnpm `11.16.0`;
- `/opt/homebrew/bin/flutter`, Flutter `3.41.7`;
- `/opt/homebrew/bin/dart`, Dart `3.11.5`; and
- `/opt/homebrew/bin/java`, OpenJDK `17.0.20.1`.

No copied Node runtime, Codex-internal fallback, PATH prefix or `JAVA_HOME`
override is needed for the supported commands.

## Dependency-surface security correction

The first normal-shell production audit exposed one moderate transitive
`uuid 9.0.1` advisory exclusively below Firebase Admin's optional Storage
tree. SIT imports only Firebase Auth and Messaging; neither Storage nor
Firestore exists in Backend runtime sources.

The pnpm workspace now ignores exactly those two unused optional dependency
trees. This removes 123 unused packages rather than forcing an incompatible
transitive major or muting the advisory. A committed contract test binds the
absence of Storage/Firestore runtime imports and vulnerable lock entries. CI
now runs the repository audit script at `moderate` rather than accepting only
high/critical findings. The resulting production audit reports zero known
vulnerabilities.

No Firebase project, credential, Cloud resource or service configuration was
read or changed by this dependency correction.

## Deterministic proof

Five toolchain contract tests cover the Node/pnpm pins, bootstrap installation
flow, mutation-free check mode, Flutter/CI version agreement and stable
Flutter/Dart/Java links. A new login shell then passed:

1. both bootstrap `--check` commands;
2. `pnpm install --frozen-lockfile`;
3. the full Backend suite, syntax checks, moderate audit and secret scan;
4. the repository-owned PostgreSQL 16 runner, including two consecutive
   normal-shell fresh-cluster runs with temp roots `0 -> 0`; and
5. the complete technical regression with standard Flutter parallelism, Web
   smoke and Android debug, without PATH/JAVA_HOME overrides.

The Flutter suite was not serialized and no retry, sleep, copied runtime,
alternate pnpm version, fixed database port or skipped audit became an
acceptance condition.

## Remaining formal boundary

The local implementation and clean repeated evidence satisfy the local parts
of `TD-RR-001` and `TD-RR-004`. Both remain formally open because the register
requires green CI on the exact commit and the stored GitHub CLI credential is
expired. `TD-RR-003` likewise retains its exact-commit CI/stress requirement
despite another complete standard-parallel local pass.

The local technical gate used `CI=true` only for the documented metadata-only
handoff validation. It does not establish actual GitHub CI, a signed device or
candidate, Store submission, deployment or release readiness.

## Local verification

- toolchain contract tests: 5 passed;
- Firebase optional-surface/focused Auth and Messaging tests: 22 passed;
- Backend: 600 passed, one expected no-database skip;
- production dependency audit: zero known vulnerabilities;
- repository-owned PostgreSQL 16 integration: passed at exact head; two
  consecutive normal-shell clean runs passed earlier in the same bounded
  package;
- complete technical regression: passed;
- analyzer: accepted 220-issue baseline;
- Flutter: 379 passed and one documented skip at standard parallelism;
- separate Google-only, Web debug/loopback smoke and Android debug APK: passed;
- Privacy/Retention and P0B validators: passed and remained fail-closed;
- syntax, diff and secret checks: passed.

P0B remains `HOLD` / `NO-GO`. GitHub push and exact-commit CI are not claimed;
draft PR #7 remains unmerged.
