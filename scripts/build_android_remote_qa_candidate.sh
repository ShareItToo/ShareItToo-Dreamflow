#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_NAME="1.0.0-qa"
DEFAULT_BUILD_NUMBER="2026090101"
BUILD_NUMBER="${SIT_REMOTE_QA_BUILD_NUMBER:-$DEFAULT_BUILD_NUMBER}"
API_BASE_URL="https://staging.shareittoo.com/api/v1"
APPLICATION_ID="com.shareittoo.app.qa"
BRANCH="codex/master-workflow-20260808"

cd "$ROOT"

if [[ "${SIT_CONFIRM_REMOTE_QA:-0}" != "1" ]]; then
  echo "ERROR: Set SIT_CONFIRM_REMOTE_QA=1 for the private Remote QA candidate." >&2
  exit 1
fi
if [[ ! "$BUILD_NUMBER" =~ ^[0-9]{10}$ ]] ||
   (( 10#$BUILD_NUMBER < 10#$DEFAULT_BUILD_NUMBER )); then
  echo "ERROR: Remote QA build number must use YYYYMMDDNN and must not precede the baseline." >&2
  exit 1
fi
if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  echo "ERROR: Remote QA builds require the verified SIT branch." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Remote QA candidates require a clean committed worktree." >&2
  exit 1
fi
if [[ "${SIT_REQUIRE_STORE_SUBMISSION:-0}" == "1" ||
      "${SIT_ENABLE_STAGING_CRASH_DIAGNOSTIC:-0}" == "1" ||
      -n "${GOOGLE_MAPS_API_KEY:-}" ]]; then
  echo "ERROR: Store submission, Crashlytics diagnostics and client Maps credentials are forbidden." >&2
  exit 1
fi

commit="$(git rev-parse HEAD)"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || {
  echo "ERROR: Exact Git commit is unavailable." >&2
  exit 1
}

curl -fsS --max-time 20 \
  "$API_BASE_URL/listings?sort=newest&limit=1" \
  | node --input-type=module -e '
      let body = "";
      process.stdin.setEncoding("utf8");
      for await (const chunk of process.stdin) body += chunk;
      const parsed = JSON.parse(body);
      if (!Array.isArray(parsed.listings)) process.exit(1);
    '

node tool/validate_android_signing_config.mjs --require-canonical

source scripts/release_host_capacity_guard.sh
release_host_capacity_begin

cleanup_generated() {
  flutter clean >/dev/null
}
cleanup_on_exit() {
  local status="$?"
  trap - EXIT
  if ! cleanup_generated; then
    echo "ERROR: Generated Remote QA files could not be cleaned." >&2
    status=1
  fi
  exit "$status"
}
trap cleanup_on_exit EXIT
cleanup_generated

common_args=(
  --release
  "--build-name=$BUILD_NAME"
  "--build-number=$BUILD_NUMBER"
  --dart-define=SIT_REMOTE_QA_BUILD=true
  --dart-define=SIT_BACKEND_ENABLED=true
  "--dart-define=SIT_API_BASE_URL=$API_BASE_URL"
  "--dart-define=SIT_APP_COMMIT=$commit"
  "--dart-define=SIT_BUILD_NUMBER=$BUILD_NUMBER"
  --dart-define=SIT_RELEASE_CHANNEL=staging
  "--dart-define=SIT_BUNDLE_ID=$APPLICATION_ID"
  "--dart-define=SIT_CLIENT_BUILD=$BUILD_NAME+$BUILD_NUMBER"
  --dart-define=SIT_SOCIAL_GOOGLE_ENABLED=false
  --dart-define=SIT_SOCIAL_APPLE_ENABLED=false
  --dart-define=SIT_SOCIAL_FACEBOOK_ENABLED=false
  --dart-define=SIT_BLUE_OCEAN_LISTING_ASSISTANT=true
  --dart-define=SIT_STAGE_A_NON_BINDING_PILOT=true
  --dart-define=SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED=true
  --dart-define=SIT_BOOKING_GROUPS_PUBLIC_RELEASE_ALLOWED=false
  --dart-define=SIT_PLANNER_TECHNICAL_UI_ENABLED=true
  --dart-define=SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED=true
  --dart-define=SIT_LISTING_SETS_TECHNICAL_UI_ENABLED=true
)

SIT_REMOTE_QA_BUILD=1 \
SIT_DISABLE_FIREBASE_ANDROID_PLUGINS=1 \
flutter build appbundle "${common_args[@]}"

SIT_REMOTE_QA_BUILD=1 \
SIT_DISABLE_FIREBASE_ANDROID_PLUGINS=1 \
flutter build apk --target-platform android-arm64 "${common_args[@]}"

aab="build/app/outputs/bundle/release/app-release.aab"
apk="build/app/outputs/flutter-apk/app-release.apk"
[[ -f "$aab" && -f "$apk" ]] || {
  echo "ERROR: Remote QA AAB or arm64 APK was not created." >&2
  exit 1
}
jarsigner -verify "$aab" >/dev/null

android_sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$android_sdk_root" && -f android/local.properties ]]; then
  android_sdk_root="$(sed -n 's/^sdk\.dir=//p' android/local.properties | tail -n1)"
fi
if [[ -z "$android_sdk_root" ]]; then
  android_sdk_root="$HOME/Library/Android/sdk"
fi
build_tools="$(find "$android_sdk_root/build-tools" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n1)"
[[ -x "$build_tools/apksigner" && -x "$build_tools/aapt" ]] || {
  echo "ERROR: Android verification tools are unavailable." >&2
  exit 1
}

"$build_tools/apksigner" verify --verbose "$apk" >/dev/null
certificate="$("$build_tools/apksigner" verify --print-certs "$apk" | \
  sed -E -n 's/^(V[0-9]+ Signer:|Signer #[0-9]+) certificate SHA-256 digest: ([0-9A-Fa-f]{64})$/\2/p' | \
  head -n1 | tr '[:upper:]' '[:lower:]')"
canonical_certificate="098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4"
[[ "$certificate" == "$canonical_certificate" ]] || {
  echo "ERROR: Remote QA APK does not use the canonical owner signing certificate." >&2
  exit 1
}

badging="$("$build_tools/aapt" dump badging "$apk")"
grep -Fq "package: name='$APPLICATION_ID' versionCode='$BUILD_NUMBER' versionName='$BUILD_NAME'" <<< "$badging" || {
  echo "ERROR: Remote QA APK package or version identity is invalid." >&2
  exit 1
}
grep -Fq "application-label:'ShareItToo QA'" <<< "$badging" || {
  echo "ERROR: Remote QA APK is not visibly distinguishable from the Play app." >&2
  exit 1
}
grep -Fq "native-code: 'arm64-v8a'" <<< "$badging" || {
  echo "ERROR: Remote QA APK is not the expected arm64 split." >&2
  exit 1
}
flutter_runtime_entries="$(
  unzip -Z1 "$apk" |
    grep -E '^lib/[^/]+/(libapp|libflutter)\.so$' |
    LC_ALL=C sort
)"
expected_flutter_runtime_entries="$(printf '%s\n' \
  'lib/arm64-v8a/libapp.so' \
  'lib/arm64-v8a/libflutter.so')"
[[ "$flutter_runtime_entries" == "$expected_flutter_runtime_entries" ]] || {
  echo "ERROR: Remote QA APK Flutter runtime must be arm64-v8a only." >&2
  exit 1
}
packaged_native_abis="$(
  unzip -Z1 "$apk" |
    grep -E '^lib/[^/]+/[^/]+\.so$' |
    cut -d/ -f2 |
    LC_ALL=C sort -u |
    paste -sd, -
)"
[[ "$packaged_native_abis" == 'arm64-v8a,armeabi-v7a,x86_64' ]] || {
  echo "ERROR: Remote QA APK packaged native ABI inventory changed unexpectedly." >&2
  exit 1
}

manifest_dump="$("$build_tools/aapt" dump xmltree "$apk" AndroidManifest.xml)"
if grep -Fq 'android:debuggable(0x0101000f)=(type 0x12)0xffffffff' <<< "$manifest_dump"; then
  echo "ERROR: Remote QA APK must not be debuggable." >&2
  exit 1
fi
grep -Fq 'android:usesCleartextTraffic(0x010104ec)=(type 0x12)0x0' <<< "$manifest_dump" || {
  echo "ERROR: Remote QA APK must reject cleartext traffic." >&2
  exit 1
}

evidence_dir="build/release-evidence/remote-qa-android-$BUILD_NUMBER"
mkdir -p "$evidence_dir"
privacy_report="$evidence_dir/privacy-scan.json"
node tool/verify_android_binary_privacy.mjs \
  --application-id "$APPLICATION_ID" \
  --apk "$apk" \
  --aab "$aab" \
  --aapt "$build_tools/aapt" \
  --commit "$commit" \
  --api-base-url "$API_BASE_URL" \
  --version-name "$BUILD_NAME" \
  --version-code "$BUILD_NUMBER" \
  --output "$privacy_report"

archive_root="$HOME/Library/Application Support/ShareItToo/qa/remote-android"
archive_dir="$archive_root/$BUILD_NUMBER-$commit"
[[ ! -e "$archive_dir" ]] || {
  echo "ERROR: Exact Remote QA archive already exists and cannot be overwritten." >&2
  exit 1
}
mkdir -p -m 700 "$archive_root"
mkdir -m 700 "$archive_dir"

apk_name="shareittoo-qa-$BUILD_NAME-$BUILD_NUMBER-$commit-arm64.apk"
aab_name="shareittoo-qa-$BUILD_NAME-$BUILD_NUMBER-$commit.aab"
install -m 600 "$apk" "$archive_dir/$apk_name"
install -m 600 "$aab" "$archive_dir/$aab_name"
install -m 600 "$privacy_report" "$archive_dir/privacy-scan.json"
apk_sha="$(shasum -a 256 "$archive_dir/$apk_name" | awk '{print $1}')"
aab_sha="$(shasum -a 256 "$archive_dir/$aab_name" | awk '{print $1}')"
privacy_sha="$(shasum -a 256 "$archive_dir/privacy-scan.json" | awk '{print $1}')"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

printf '%s\n' \
  "{" \
  "  \"schemaVersion\": 1," \
  "  \"kind\": \"sit-android-private-remote-qa-candidate\"," \
  "  \"status\": \"built-owner-only-not-installed\"," \
  "  \"createdAt\": \"$created_at\"," \
  "  \"source\": {" \
  "    \"branch\": \"$BRANCH\"," \
  "    \"commit\": \"$commit\"," \
  "    \"applicationId\": \"$APPLICATION_ID\"," \
  "    \"versionName\": \"$BUILD_NAME\"," \
  "    \"buildNumber\": \"$BUILD_NUMBER\"" \
  "  }," \
  "  \"artifact\": {" \
  "    \"fileName\": \"$apk_name\"," \
  "    \"apkSha256\": \"$apk_sha\"," \
  "    \"aabFileName\": \"$aab_name\"," \
  "    \"aabSha256\": \"$aab_sha\"," \
  "    \"privacyReportSha256\": \"$privacy_sha\"," \
  "    \"abi\": \"arm64-v8a\"," \
  "    \"abiScope\": \"flutter-runtime-only\"," \
  "    \"flutterRuntimeAbi\": \"arm64-v8a\"," \
  "    \"packagedNativeAbis\": [\"arm64-v8a\", \"armeabi-v7a\", \"x86_64\"]," \
  "    \"canonicalOwnerSigningVerified\": true," \
  "    \"debuggable\": false" \
  "  }," \
  "  \"configuration\": {" \
  "    \"appLabel\": \"ShareItToo QA\"," \
  "    \"releaseChannel\": \"staging\"," \
  "    \"apiBaseUrl\": \"$API_BASE_URL\"," \
  "    \"firebaseConfigured\": false," \
  "    \"socialProvidersEnabled\": false," \
  "    \"externalProviderAllowed\": false," \
  "    \"realMoneyAllowed\": false," \
  "    \"productionAllowed\": false," \
  "    \"publicRegistrationAllowed\": false," \
  "    \"publicReleaseAllowed\": false" \
  "  }," \
  "  \"boundaries\": {" \
  "    \"installed\": false," \
  "    \"storeUploaded\": false," \
  "    \"testerListChanged\": false," \
  "    \"firebaseChanged\": false," \
  "    \"productionChanged\": false," \
  "    \"paymentChanged\": false" \
  "  }" \
  "}" > "$archive_dir/manifest.json"
chmod 600 "$archive_dir/manifest.json"

printf '%s\n' \
  "SHAREITTOO QA - PRIVATE REMOTE INSTALL" \
  "" \
  "Build: $BUILD_NAME+$BUILD_NUMBER" \
  "Source commit: $commit" \
  "Package: $APPLICATION_ID" \
  "API: $API_BASE_URL" \
  "APK SHA-256: $apk_sha" \
  "" \
  "INSTALLATION AUF DEM ONEPLUS" \
  "1. Lade ausschließlich die APK aus diesem privaten Ordner herunter." \
  "2. Öffne die Datei und erlaube Google Drive/Chrome einmalig die Installation unbekannter Apps, falls Android danach fragt." \
  "3. Installiere die App mit dem sichtbaren Namen ShareItToo QA." \
  "4. Die bestehende Play-App ShareItToo bleibt unverändert und parallel installiert." \
  "5. Prüfe nach dem Start zuerst Entdecken im WLAN und danach offline/online." \
  "" \
  "BEWUSSTE GRENZEN" \
  "Google/Apple/Facebook-Login, Push und Crashlytics sind in dieser privaten QA-App deaktiviert." \
  "Gastkatalog und klassische Staging-Anmeldung verwenden das erreichbare Staging-Backend." \
  "Keine Produktion, kein Store-Release und kein Echtgeld-Payment werden durch diese APK aktiviert." \
  > "$archive_dir/README_INSTALL_AND_VERIFY.txt"
chmod 600 "$archive_dir/README_INSTALL_AND_VERIFY.txt"

cleanup_generated
trap - EXIT
release_host_capacity_end

echo "Private Remote QA candidate created: build=$BUILD_NUMBER commit=$commit"
echo "Archive: $archive_dir"
