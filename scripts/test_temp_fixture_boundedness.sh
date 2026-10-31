#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMP_ROOT="${TMPDIR:-/tmp}"
TEMP_ROOT="${TEMP_ROOT%/}"

TEST_FILES=(
  test/tool/test_temp_fixtures.test.mjs
  test/tool/validate_device_evidence.test.mjs
  test/tool/run_staging_synthetic_booking.test.mjs
  test/tool/clean_staging_store_feed.test.mjs
  test/tool/diagnose_android_authenticated_links.test.mjs
  test/tool/diagnose_android_controlled_fcm.test.mjs
  test/tool/prepare_android_device_test.test.mjs
  test/tool/prepare_store_screenshot_fixture.test.mjs
  test/tool/provision_staging_test_accounts.test.mjs
  test/tool/run_staging_listing_ai_acceptance.test.mjs
  test/tool/run_isolated_android_authenticated_links_diagnostic.test.mjs
  test/tool/run_isolated_android_role_booking_diagnostic.test.mjs
  test/tool/diagnose_store_review_disposable_deletion.test.mjs
  test/tool/diagnose_store_review_safety_actions.test.mjs
)

is_tracked_fixture() {
  case "$1" in
    sit-progress-evidence-*|sit-device-progress-*|sit-device-evidence-*|\
    sit-synthetic-booking-*|sit-feed-clean-*|sit-authenticated-links-*|\
    sit-fcm-*|sit-device-prep-*|sit-store-screenshot-*|\
    sit-staging-account-test-*|sit-staging-account-partial-*|\
    sit-staging-account-verified-*|sit-wp08-listing-ai-*|\
    sit-protected-authenticated-links-*|\
    sit-protected-role-booking-*|sit-review-delete-*|sit-review-safety-*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

fixture_snapshot() {
  local fixture_count=0
  local fixture_kib=0
  local directory
  local directory_kib

  while IFS= read -r -d '' directory; do
    if ! is_tracked_fixture "${directory##*/}"; then
      continue
    fi
    directory_kib="$(du -sk "$directory" | awk '{print $1}')"
    fixture_count=$((fixture_count + 1))
    fixture_kib=$((fixture_kib + directory_kib))
  done < <(find "$TEMP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'sit-*' -print0)

  printf '%s %s\n' "$fixture_count" "$fixture_kib"
}

cd "$ROOT"

read -r before_count before_kib < <(fixture_snapshot)

for test_run in 1 2; do
  echo "Temp-fixture boundedness run ${test_run}/2"
  node --test "${TEST_FILES[@]}"
done

read -r after_count after_kib < <(fixture_snapshot)

if [[ "$after_count" != "$before_count" || "$after_kib" != "$before_kib" ]]; then
  echo "ERROR: tracked test fixtures grew from ${before_count}/${before_kib} KiB to ${after_count}/${after_kib} KiB." >&2
  exit 1
fi

echo "Temp-fixture boundedness passed: ${before_count}/${before_kib} KiB -> ${after_count}/${after_kib} KiB."
