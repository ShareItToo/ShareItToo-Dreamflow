#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_NAME="1.0.0"
DEFAULT_BUILD_NUMBER="2026082303"
BUILD_NUMBER="${SIT_LOCAL_QA_BUILD_NUMBER:-$DEFAULT_BUILD_NUMBER}"
API_BASE_URL="http://127.0.0.1:18080/api/v1"
APPLICATION_ID="com.shareittoo.app"

cd "$ROOT"

if [[ "${SIT_CONFIRM_LOCAL_INTERNAL_QA:-0}" != "1" ]]; then
  echo "ERROR: Set SIT_CONFIRM_LOCAL_INTERNAL_QA=1 for the bounded R2 local candidate." >&2
  exit 1
fi
if [[ ! "$BUILD_NUMBER" =~ ^[0-9]{10,12}$ ]] ||
   (( 10#$BUILD_NUMBER < 10#$DEFAULT_BUILD_NUMBER )); then
  echo "ERROR: Local QA build number must be numeric and must not precede the R2 baseline." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: The R2 local QA candidate requires a clean committed worktree." >&2
  exit 1
fi
if [[ "${SIT_REQUIRE_STORE_SUBMISSION:-0}" == "1" ||
      "${SIT_ENABLE_STAGING_CRASH_DIAGNOSTIC:-0}" == "1" ]]; then
  echo "ERROR: Store submission and Crashlytics diagnostics are forbidden for R2." >&2
  exit 1
fi

commit="$(git rev-parse HEAD)"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || {
  echo "ERROR: Exact Git commit is unavailable." >&2
  exit 1
}

SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  SIT_FIREBASE_VALIDATION_PLATFORM=android \
  SIT_BUILD_PREFLIGHT_ONLY=1 \
  bash scripts/build_android_release_candidate.sh

source scripts/release_host_capacity_guard.sh
release_host_capacity_begin

cleanup_generated() {
  flutter clean >/dev/null
}
cleanup_on_exit() {
  local status="$?"
  trap - EXIT
  if ! cleanup_generated; then
    echo "ERROR: Generated R2 files could not be cleaned." >&2
    status=1
  fi
  exit "$status"
}
trap cleanup_on_exit EXIT
cleanup_generated

SIT_LOCAL_INTERNAL_QA_SIGNING=1 \
SIT_CONFIRM_LOCAL_INTERNAL_QA=1 \
flutter build apk \
  --debug \
  "--build-name=$BUILD_NAME" \
  "--build-number=$BUILD_NUMBER" \
  --dart-define=SIT_BACKEND_ENABLED=true \
  "--dart-define=SIT_API_BASE_URL=$API_BASE_URL" \
  "--dart-define=SIT_APP_COMMIT=$commit" \
  "--dart-define=SIT_BUILD_NUMBER=$BUILD_NUMBER" \
  --dart-define=SIT_RELEASE_CHANNEL=internal \
  "--dart-define=SIT_BUNDLE_ID=$APPLICATION_ID" \
  "--dart-define=SIT_CLIENT_BUILD=$BUILD_NAME+$BUILD_NUMBER" \
  --dart-define=SIT_SOCIAL_GOOGLE_ENABLED=false \
  --dart-define=SIT_SOCIAL_APPLE_ENABLED=false \
  --dart-define=SIT_SOCIAL_FACEBOOK_ENABLED=false \
  --dart-define=SIT_BLUE_OCEAN_LISTING_ASSISTANT=true \
  --dart-define=SIT_STAGE_A_NON_BINDING_PILOT=true \
  --dart-define=SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED=true \
  --dart-define=SIT_BOOKING_GROUPS_PUBLIC_RELEASE_ALLOWED=false \
  --dart-define=SIT_PLANNER_TECHNICAL_UI_ENABLED=true \
  --dart-define=SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED=true \
  --dart-define=SIT_LISTING_SETS_TECHNICAL_UI_ENABLED=true

apk="build/app/outputs/flutter-apk/app-debug.apk"
[[ -f "$apk" ]] || { echo "ERROR: R2 APK was not created." >&2; exit 1; }

android_sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$android_sdk_root" && -f android/local.properties ]]; then
  android_sdk_root="$(sed -n 's/^sdk\.dir=//p' android/local.properties | tail -n1)"
fi
if [[ -z "$android_sdk_root" ]]; then
  android_sdk_root="$HOME/Library/Android/sdk"
fi
build_tools_root="$android_sdk_root/build-tools"
build_tools="$(find "$build_tools_root" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n1)"
[[ -x "$build_tools/apksigner" && -x "$build_tools/aapt" ]] || {
  echo "ERROR: Android verification tools are unavailable." >&2
  exit 1
}

"$build_tools/apksigner" verify --verbose "$apk" >/dev/null
certificate="$($build_tools/apksigner verify --print-certs "$apk" | \
  sed -E -n 's/^(V[0-9]+ Signer:|Signer #[0-9]+) certificate SHA-256 digest: ([0-9A-Fa-f]{64})$/\2/p' | \
  head -n1 | tr '[:upper:]' '[:lower:]')"
canonical_certificate="098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4"
[[ "$certificate" == "$canonical_certificate" ]] || {
  echo "ERROR: R2 APK does not match the canonical installed-app signing relationship." >&2
  exit 1
}
"$build_tools/aapt" dump badging "$apk" | \
  grep -Fq "package: name='$APPLICATION_ID' versionCode='$BUILD_NUMBER' versionName='$BUILD_NAME'" || {
    echo "ERROR: R2 APK package or version identity is invalid." >&2
    exit 1
  }

manifest_dump="$($build_tools/aapt dump xmltree "$apk" AndroidManifest.xml)"
grep -Fq 'android:debuggable(0x0101000f)=(type 0x12)0xffffffff' <<< "$manifest_dump" || {
  echo "ERROR: R2 APK is not explicitly debuggable." >&2
  exit 1
}
grep -Fq 'android:usesCleartextTraffic(0x010104ec)=(type 0x12)0xffffffff' <<< "$manifest_dump" || {
  echo "ERROR: R2 APK cannot reach the ADB-reversed local backend." >&2
  exit 1
}
unset manifest_dump certificate canonical_certificate

archive_root="$HOME/Library/Application Support/ShareItToo/qa/android"
archive_dir="$archive_root/$BUILD_NUMBER-$commit"
[[ ! -e "$archive_dir" ]] || {
  echo "ERROR: Exact R2 archive already exists and cannot be overwritten." >&2
  exit 1
}
mkdir -p -m 700 "$archive_root"
mkdir -m 700 "$archive_dir"
apk_name="shareittoo-local-qa-$BUILD_NAME-$BUILD_NUMBER-$commit.apk"
install -m 600 "$apk" "$archive_dir/$apk_name"
apk_sha="$(shasum -a 256 "$archive_dir/$apk_name" | awk '{print $1}')"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

printf '%s\n' \
  "{" \
  "  \"schemaVersion\": 1," \
  "  \"kind\": \"sit-android-local-blue-ocean-qa-candidate\"," \
  "  \"status\": \"built-owner-only-not-installed\"," \
  "  \"createdAt\": \"$created_at\"," \
  "  \"source\": {" \
  "    \"branch\": \"codex/master-workflow-20260808\"," \
  "    \"commit\": \"$commit\"," \
  "    \"applicationId\": \"$APPLICATION_ID\"," \
  "    \"versionName\": \"$BUILD_NAME\"," \
  "    \"buildNumber\": \"$BUILD_NUMBER\"" \
  "  }," \
  "  \"artifact\": {" \
  "    \"fileName\": \"$apk_name\"," \
  "    \"apkSha256\": \"$apk_sha\"," \
  "    \"ownerOnly\": true," \
  "    \"canonicalSigningRelationshipVerified\": true," \
  "    \"debuggable\": true" \
  "  }," \
  "  \"configuration\": {" \
  "    \"buildType\": \"debug-canonical-local-qa\"," \
  "    \"releaseChannel\": \"internal\"," \
  "    \"apiBaseUrl\": \"$API_BASE_URL\"," \
  "    \"adbReverseRequired\": \"tcp:18080\"," \
  "    \"blueOceanMockUi\": true," \
  "    \"stageANonBindingPilotEnabled\": true," \
  "    \"requiredLocalBackendProvider\": \"mock\"," \
  "    \"g3TechnicalUi\": true," \
  "    \"g4TechnicalUi\": true," \
  "    \"g5TechnicalUi\": true," \
  "    \"externalProviderAllowed\": false," \
  "    \"realMoneyAllowed\": false," \
  "    \"productionAllowed\": false," \
  "    \"publicRegistrationAllowed\": false," \
  "    \"publicReleaseAllowed\": false" \
  "  }," \
  "  \"boundaries\": {" \
  "    \"installed\": false," \
  "    \"aabCreated\": false," \
  "    \"storeUploaded\": false," \
  "    \"providerCallPerformed\": false," \
  "    \"apiBillingCreated\": false," \
  "    \"productionChanged\": false," \
  "    \"cloudChanged\": false," \
  "    \"paymentChanged\": false" \
  "  }" \
  "}" > "$archive_dir/manifest.json"
chmod 600 "$archive_dir/manifest.json"

node tool/validate_android_local_qa_candidate.mjs

cleanup_generated
trap - EXIT
release_host_capacity_end

echo "R2 local Android QA candidate created: build=$BUILD_NUMBER, commit=$commit, archive=owner-only."
