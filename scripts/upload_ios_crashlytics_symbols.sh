#!/usr/bin/env bash
set -euo pipefail

project_dir="${PROJECT_DIR:-}"
pods_root="${PODS_ROOT:-}"
dsym_dir="${DWARF_DSYM_FOLDER_PATH:-}/${DWARF_DSYM_FILE_NAME:-}"
firebase_plist="${project_dir}/Runner/GoogleService-Info.plist"
uploader="${pods_root}/FirebaseCrashlytics/upload-symbols"

fail() {
  echo "error: $*" >&2
  exit 1
}

if [[ -z "$project_dir" || -z "$pods_root" ]]; then
  fail "Crashlytics symbol upload requires the Xcode PROJECT_DIR and PODS_ROOT environment."
fi

if [[ ! -f "$firebase_plist" ]]; then
  if [[ "${SIT_REQUIRE_FIREBASE:-0}" == "1" ]]; then
    fail "GoogleService-Info.plist is required for a Firebase-enabled Apple release."
  fi
  echo "Crashlytics symbol upload skipped: Firebase Apple configuration is not present."
  exit 0
fi

[[ -x "$uploader" ]] || fail "Firebase Crashlytics upload-symbols is unavailable. Run pod install first."
[[ -d "$dsym_dir" ]] || fail "The Runner dSYM directory is unavailable: $dsym_dir"

"$uploader" -gsp "$firebase_plist" -p ios "$dsym_dir"
echo "Crashlytics symbols uploaded for the signed Apple build."
