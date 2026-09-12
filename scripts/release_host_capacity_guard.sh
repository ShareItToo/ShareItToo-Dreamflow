#!/usr/bin/env bash

# This file is sourced by the complete technical gate and the release builder
# so before/after measurements stay in one process without temporary state.

readonly RELEASE_HOST_EFFECTIVE_BUDGET_KIB=$((5 * 1024 * 1024))
readonly RELEASE_HOST_MAX_GENERATED_KIB=$((5 * 1024 * 1024))
readonly RELEASE_HOST_MIN_END_FREE_KIB=$((512 * 1024))

release_host_capacity_free_kib() {
  df -Pk "$ROOT" | awk 'NR == 2 { print $4 }'
}

release_host_capacity_generated_kib() {
  local total=0
  local path
  local size

  for path in build .dart_tool android/.gradle; do
    if [[ -e "$ROOT/$path" ]]; then
      size="$(du -sk "$ROOT/$path" | awk '{ print $1 }')"
      total=$((total + size))
    fi
  done

  printf '%s\n' "$total"
}

release_host_capacity_begin() {
  RELEASE_HOST_BEFORE_FREE_KIB="$(release_host_capacity_free_kib)"
  RELEASE_HOST_BEFORE_GENERATED_KIB="$(release_host_capacity_generated_kib)"
  readonly RELEASE_HOST_BEFORE_FREE_KIB
  readonly RELEASE_HOST_BEFORE_GENERATED_KIB

  local effective_kib
  effective_kib=$((
    RELEASE_HOST_BEFORE_FREE_KIB + RELEASE_HOST_BEFORE_GENERATED_KIB
  ))

  if (( effective_kib < RELEASE_HOST_EFFECTIVE_BUDGET_KIB )); then
    echo "ERROR: Release host has ${effective_kib} KiB free plus replaceable build capacity; ${RELEASE_HOST_EFFECTIVE_BUDGET_KIB} KiB is required." >&2
    exit 1
  fi

  echo "Release-host capacity start: ${RELEASE_HOST_BEFORE_FREE_KIB} KiB free, ${RELEASE_HOST_BEFORE_GENERATED_KIB} KiB generated, ${effective_kib} KiB effective."
}

release_host_capacity_end() {
  local after_free_kib
  local after_generated_kib
  local growth_kib

  after_free_kib="$(release_host_capacity_free_kib)"
  after_generated_kib="$(release_host_capacity_generated_kib)"
  growth_kib=$((after_generated_kib - RELEASE_HOST_BEFORE_GENERATED_KIB))

  if (( after_generated_kib > RELEASE_HOST_MAX_GENERATED_KIB )); then
    echo "ERROR: Release gate generated footprint is ${after_generated_kib} KiB; the deterministic bound is ${RELEASE_HOST_MAX_GENERATED_KIB} KiB." >&2
    exit 1
  fi

  if (( after_free_kib < RELEASE_HOST_MIN_END_FREE_KIB )); then
    echo "ERROR: Release host ended with ${after_free_kib} KiB free; ${RELEASE_HOST_MIN_END_FREE_KIB} KiB is required." >&2
    exit 1
  fi

  printf '{"status":"passed","beforeFreeKiB":%s,"afterFreeKiB":%s,"beforeGeneratedKiB":%s,"afterGeneratedKiB":%s,"generatedGrowthKiB":%s,"effectiveBudgetKiB":%s,"maxGeneratedKiB":%s,"minimumEndFreeKiB":%s}\n' \
    "$RELEASE_HOST_BEFORE_FREE_KIB" \
    "$after_free_kib" \
    "$RELEASE_HOST_BEFORE_GENERATED_KIB" \
    "$after_generated_kib" \
    "$growth_kib" \
    "$RELEASE_HOST_EFFECTIVE_BUDGET_KIB" \
    "$RELEASE_HOST_MAX_GENERATED_KIB" \
    "$RELEASE_HOST_MIN_END_FREE_KIB"
}
