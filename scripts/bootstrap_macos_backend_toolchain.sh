#!/usr/bin/env bash
set -euo pipefail

node_formula='node@22'
node_major='22'
pnpm_version='11.16.0'
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
if [[ "$(uname -s)" != 'Darwin' ]]; then
  echo 'ERROR: This bootstrap is only for macOS.' >&2
  exit 1
fi

brew_bin="$(command -v brew || true)"
if [[ -z "$brew_bin" ]]; then
  echo 'ERROR: Homebrew is required to install the pinned Node major.' >&2
  exit 1
fi

if [[ "$mode" == 'install' ]]; then
  if ! "$brew_bin" list --versions "$node_formula" >/dev/null 2>&1; then
    "$brew_bin" install "$node_formula"
  fi
  "$brew_bin" link --overwrite --force "$node_formula"
fi

node_prefix="$($brew_bin --prefix "$node_formula")"
node_bin="$node_prefix/bin/node"
corepack_bin="$node_prefix/bin/corepack"
for required_file in "$node_bin" "$corepack_bin"; do
  if [[ ! -x "$required_file" ]]; then
    echo "ERROR: The Homebrew Node 22 toolchain is incomplete." >&2
    exit 1
  fi
done

node_version="$($node_bin --version)"
if [[ ! "$node_version" =~ ^v${node_major}\.[0-9]+\.[0-9]+$ ]]; then
  echo "ERROR: Expected Node 22, found ${node_version}." >&2
  exit 1
fi

if [[ "$mode" == 'install' ]]; then
  "$corepack_bin" install --global "pnpm@$pnpm_version"
  "$corepack_bin" enable pnpm
fi

hash -r
resolved_node="$(command -v node || true)"
resolved_pnpm="$(command -v pnpm || true)"
if [[ -z "$resolved_node" || -z "$resolved_pnpm" ]]; then
  echo 'ERROR: Restart the shell after Homebrew linking, then rerun --check.' >&2
  exit 1
fi
if [[ "$(node --version)" != "$node_version" ]]; then
  echo 'ERROR: PATH resolves a different Node version than Homebrew node@22.' >&2
  exit 1
fi
if [[ "$(pnpm --version)" != "$pnpm_version" ]]; then
  echo "ERROR: Expected pnpm ${pnpm_version} from Corepack." >&2
  exit 1
fi
if [[ "$(tr -d '[:space:]' < "$root/.node-version")" != "$node_major" ]]; then
  echo 'ERROR: Repository .node-version does not match the bootstrap.' >&2
  exit 1
fi
if ! grep -Fq "\"packageManager\": \"pnpm@$pnpm_version\"" \
    "$root/backend/package.json"; then
  echo 'ERROR: Backend packageManager does not match the bootstrap.' >&2
  exit 1
fi

printf 'SIT Backend toolchain: PASS (node=%s, pnpm=%s, mode=%s)\n' \
  "$node_version" "$pnpm_version" "$mode"
