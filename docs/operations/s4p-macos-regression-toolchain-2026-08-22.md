# S4P macOS regression toolchain

Status: locally verified, non-live. The setup uses only free local Homebrew,
Corepack and FVM tooling.

## Install or repair

From the repository root:

```sh
bash scripts/bootstrap_macos_regression_toolchain.sh
```

The command installs or links the repository versions of Node 22, pnpm
11.16.0, Flutter 3.41.7, Dart 3.11.5 and Java 17. It does not configure a SIT
environment, read credentials or contact Firebase/Payment/Store services.

## Read-only verification

From a new shell:

```sh
bash scripts/bootstrap_macos_regression_toolchain.sh --check
```

Expected result:

```text
SIT Backend toolchain: PASS (node=v22.x.x, pnpm=11.16.0, mode=check)
SIT regression toolchain: PASS (flutter=3.41.7, dart=3.11.5, java=17, mode=check)
```

The Node patch may advance within Homebrew's maintained Node 22 formula; the
repository, Corepack and CI continue to enforce Node major 22 and exact pnpm,
Flutter and Java major contracts.

## Backend and PostgreSQL gate

```sh
cd backend
pnpm install --frozen-lockfile
pnpm test
pnpm run check
pnpm run security:audit
pnpm run security:secrets
pnpm run test:postgres:local
```

The audit fails from moderate severity upward. Firebase Storage and Firestore
are intentionally excluded optional dependencies because no Backend runtime
source imports those services. Do not re-enable them without a dedicated
runtime need, dependency audit and source-contract update.

## Full local gate

```sh
SIT_ALLOW_CANDIDATE_ROLLOVER=1 CI=true \
  bash scripts/technical_regression_check.sh
```

`CI=true` is allowed locally only for metadata-only handoff validation; it is
not GitHub CI, signed-device evidence or Store authorization. Do not substitute
a temporary Node runtime, Codex fallback pnpm, serial Flutter mode, fixed
PostgreSQL port, skipped audit or manual database reuse for a failed check.

## Boundaries

The setup changes only local developer tools and repository dependencies. It
does not deploy, upload, sign, pay, refund, contact users/providers or change
production, Cloud/VPS/DNS, Store or pilot state.
