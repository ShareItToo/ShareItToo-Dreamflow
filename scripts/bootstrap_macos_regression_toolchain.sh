#!/usr/bin/env bash
set -euo pipefail

flutter_version='3.41.7'
dart_version='3.11.5'
java_formula='openjdk@17'
java_major='17'
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode='install'

if [[ "${1:-}" == '--check' ]]; then
  mode='check'
  shift
fi
if [[ "$#" -ne 0 ]]; then
  echo "ERROR: Usage: $0 [--check]" >&2
  exit 64
fi

if [[ "$mode" == 'check' ]]; then
  bash "$root/scripts/bootstrap_macos_backend_toolchain.sh" --check
else
  bash "$root/scripts/bootstrap_macos_backend_toolchain.sh"
fi

brew_bin="$(command -v brew || true)"
if [[ -z "$brew_bin" ]]; then
  echo 'ERROR: Homebrew is required for Java 17 and FVM.' >&2
  exit 1
fi

if [[ "$mode" == 'install' ]]; then
  if ! "$brew_bin" list --versions "$java_formula" >/dev/null 2>&1; then
    "$brew_bin" install "$java_formula"
  fi
  if ! "$brew_bin" list --versions fvm >/dev/null 2>&1; then
    "$brew_bin" install fvm
  fi
  "$brew_bin" link --overwrite --force "$java_formula"
fi

fvm_bin="$(command -v fvm || true)"
if [[ -z "$fvm_bin" ]]; then
  echo 'ERROR: FVM is unavailable after Homebrew setup.' >&2
  exit 1
fi
if [[ "$mode" == 'install' ]]; then
  "$fvm_bin" install "$flutter_version"
  "$fvm_bin" global "$flutter_version" --force
fi

global_flutter_bin="$($fvm_bin api context | node --input-type=module -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  const value = JSON.parse(input)?.context?.globalCacheBinPath;
  if (typeof value !== "string" || value.trim() === "") process.exit(2);
  process.stdout.write(value.trim());
')"
if [[ ! -x "$global_flutter_bin/flutter" || ! -x "$global_flutter_bin/dart" ]]; then
  echo 'ERROR: FVM global Flutter SDK is incomplete.' >&2
  exit 1
fi

brew_prefix="$($brew_bin --prefix)"
if [[ "$mode" == 'install' ]]; then
  ln -sfn "$global_flutter_bin/flutter" "$brew_prefix/bin/flutter"
  ln -sfn "$global_flutter_bin/dart" "$brew_prefix/bin/dart"
fi
hash -r

resolved_flutter="$(command -v flutter || true)"
resolved_dart="$(command -v dart || true)"
resolved_java="$(command -v java || true)"
if [[ -z "$resolved_flutter" || -z "$resolved_dart" || -z "$resolved_java" ]]; then
  echo 'ERROR: Flutter, Dart and Java must resolve in the normal shell PATH.' >&2
  exit 1
fi
if [[ "$(flutter --version 2>/dev/null | sed -n '1s/^Flutter \([^ ]*\).*/\1/p')" \
      != "$flutter_version" ]]; then
  echo "ERROR: Expected Flutter ${flutter_version}." >&2
  exit 1
fi
if [[ "$(dart --version 2>&1 | sed -n 's/^Dart SDK version: \([^ ]*\).*/\1/p')" \
      != "$dart_version" ]]; then
  echo "ERROR: Expected Dart ${dart_version}." >&2
  exit 1
fi
java_version="$(java -version 2>&1 | sed -n '1s/.*version "\([0-9]*\).*/\1/p')"
if [[ "$java_version" != "$java_major" ]]; then
  echo "ERROR: Expected Java ${java_major}." >&2
  exit 1
fi
if ! grep -Fq "\"flutter\": \"$flutter_version\"" "$root/.fvmrc"; then
  echo 'ERROR: Repository .fvmrc does not match the regression toolchain.' >&2
  exit 1
fi

printf 'SIT regression toolchain: PASS (flutter=%s, dart=%s, java=%s, mode=%s)\n' \
  "$flutter_version" "$dart_version" "$java_major" "$mode"
