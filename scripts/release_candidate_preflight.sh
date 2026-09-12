#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_ID="com.shareittoo.app"

cd "$ROOT"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v dart >/dev/null 2>&1 || fail "dart is required for store metadata validation."
command -v node >/dev/null 2>&1 || fail "node is required for public store page validation."
node tool/validate_android_toolchain.mjs
node --check tool/verify_public_store_pages.mjs
node --check tool/verify_brand_assets.mjs
node --check tool/verify_android_binary_privacy.mjs
node --check tool/validate_device_evidence.mjs
node --check tool/validate_legal_readiness.mjs
node --check tool/validate_support_launch_content.mjs
node --check tool/validate_product_safety_readiness.mjs
node --check tool/validate_privacy_disclosures.mjs
node --check tool/validate_retention_deletion_readiness.mjs
node --check tool/diagnose_store_review_accounts.mjs
node --check tool/diagnose_store_review_safety_actions.mjs
node --check tool/diagnose_store_review_disposable_deletion.mjs
node --check tool/validate_store_review_access.mjs
node --check tool/validate_b11_release_docs.mjs
node --check tool/validate_google_play_internal_handoff.mjs
node --check tool/validate_google_play_closed_testing.mjs
node --check tool/prepare_google_play_closed_testing_observation.mjs
node --check tool/validate_google_play_closed_testing_feedback.mjs
node --check tool/validate_google_play_production_access_application.mjs
node --check tool/validate_apple_testflight_handoff.mjs
node --check tool/prepare_android_device_test.mjs
node --check tool/diagnose_android_app_links.mjs
node --check tool/diagnose_android_authenticated_session.mjs
node --check tool/diagnose_android_authenticated_links.mjs
node --check tool/run_isolated_android_authenticated_links_diagnostic.mjs
node --check tool/diagnose_android_offline_realtime.mjs
node --check tool/run_staging_synthetic_booking.mjs
node --check tool/prepare_store_screenshot_fixture.mjs
node --check tool/validate_firebase_release_config.mjs
node --check tool/validate_phone_verification_readiness.mjs
node --check tool/validate_android_signing_config.mjs
node tool/verify_brand_assets.mjs
if [[ "${SIT_ALLOW_CANDIDATE_ROLLOVER:-0}" == "1" ]]; then
  dart run tool/validate_store_metadata.dart --allow-candidate-rollover
else
  dart run tool/validate_store_metadata.dart
fi
node tool/validate_device_evidence.mjs
if [[ "${SIT_ALLOW_CANDIDATE_ROLLOVER:-0}" == "1" ]]; then
  node tool/validate_phone_verification_readiness.mjs --allow-candidate-rollover
else
  node tool/validate_phone_verification_readiness.mjs
fi
node tool/validate_legal_readiness.mjs
node tool/validate_support_launch_content.mjs
node tool/validate_product_safety_readiness.mjs
node tool/validate_privacy_disclosures.mjs
node tool/validate_retention_deletion_readiness.mjs
node tool/validate_store_review_access.mjs
node tool/validate_google_play_closed_testing.mjs
if [[ "${SIT_ALLOW_CANDIDATE_ROLLOVER:-0}" == "1" ]]; then
  node tool/validate_google_play_closed_testing_feedback.mjs --allow-candidate-rollover
else
  node tool/validate_google_play_closed_testing_feedback.mjs
fi
node tool/validate_google_play_production_access_application.mjs
if [[ "${SIT_ALLOW_CANDIDATE_ROLLOVER:-0}" == "1" ]]; then
  [[ "${SIT_RELEASE_CHANNEL:-internal}" == "internal" ]] || \
    fail "Candidate rollover is restricted to the internal channel."
  [[ "${SIT_API_BASE_URL:-https://staging.shareittoo.com/api/v1}" == \
      "https://staging.shareittoo.com/api/v1" ]] || \
    fail "Candidate rollover is restricted to the isolated staging API."
  [[ "${SIT_REQUIRE_STORE_SUBMISSION:-0}" != "1" ]] || \
    fail "Candidate rollover is forbidden for a Store-submission build."
  node tool/validate_b11_release_docs.mjs --allow-candidate-rollover
else
  node tool/validate_b11_release_docs.mjs
fi
firebase_validation_platform="${SIT_FIREBASE_VALIDATION_PLATFORM:-all}"
[[ "$firebase_validation_platform" =~ ^(android|ios|all)$ ]] || \
  fail "SIT_FIREBASE_VALIDATION_PLATFORM must be android, ios, or all."

# Keep direct preflight runs aligned with the release builder and the full
# regression check. The Android Firebase file is local, permission-restricted
# and git-ignored; derive its public client values only in this process and do
# not print or persist them in another file.
firebase_config_path="$ROOT/android/app/google-services.json"
firebase_ios_config_path="$ROOT/ios/Runner/GoogleService-Info.plist"
firebase_required_names=(
  SIT_FIREBASE_PROJECT_ID
  SIT_FIREBASE_MESSAGING_SENDER_ID
  SIT_FIREBASE_STORAGE_BUCKET
  SIT_FIREBASE_ANDROID_APP_ID
  SIT_FIREBASE_ANDROID_API_KEY
)
firebase_env_missing=false
for firebase_name in "${firebase_required_names[@]}"; do
  if [[ -z "${!firebase_name:-}" ]]; then
    firebase_env_missing=true
    break
  fi
done
if [[ "$firebase_validation_platform" =~ ^(android|all)$ &&
      -f "$firebase_config_path" && "$firebase_env_missing" == "true" ]]; then
  firebase_env_lines="$(node --input-type=module - "$firebase_config_path" <<'NODE'
import { readFileSync } from 'node:fs';
import { deriveAndroidFirebaseReleaseEnvironment } from './tool/validate_firebase_release_config.mjs';

const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const values = deriveAndroidFirebaseReleaseEnvironment(config);
for (const [name, value] of Object.entries(values)) {
  process.stdout.write(`${name}=${value}\n`);
}
NODE
)"
  while IFS='=' read -r firebase_name firebase_value; do
    case "$firebase_name" in
      SIT_FIREBASE_PROJECT_ID|SIT_FIREBASE_MESSAGING_SENDER_ID|SIT_FIREBASE_STORAGE_BUCKET|SIT_FIREBASE_ANDROID_APP_ID|SIT_FIREBASE_ANDROID_API_KEY)
        if [[ -z "${!firebase_name:-}" ]]; then
          printf -v "$firebase_name" '%s' "$firebase_value"
          export "$firebase_name"
        fi
        ;;
      *)
        fail "Unexpected Firebase environment field."
        ;;
    esac
  done <<< "$firebase_env_lines"
  unset firebase_env_lines firebase_value
fi
if [[ "$firebase_validation_platform" =~ ^(ios|all)$ &&
      -f "$firebase_ios_config_path" ]]; then
  firebase_env_lines="$(node --input-type=module - "$firebase_ios_config_path" <<'NODE'
import { readFileSync } from 'node:fs';
import {
  deriveIosFirebaseReleaseEnvironment,
  parseGoogleServiceInfoPlist,
} from './tool/validate_firebase_release_config.mjs';

const config = parseGoogleServiceInfoPlist(readFileSync(process.argv[2], 'utf8'));
const values = deriveIosFirebaseReleaseEnvironment(config);
for (const [name, value] of Object.entries(values)) {
  process.stdout.write(`${name}=${value}\n`);
}
NODE
)"
  while IFS='=' read -r firebase_name firebase_value; do
    case "$firebase_name" in
      SIT_FIREBASE_PROJECT_ID|SIT_FIREBASE_MESSAGING_SENDER_ID|SIT_FIREBASE_STORAGE_BUCKET|SIT_FIREBASE_IOS_APP_ID|SIT_FIREBASE_IOS_API_KEY)
        if [[ -z "${!firebase_name:-}" ]]; then
          printf -v "$firebase_name" '%s' "$firebase_value"
          export "$firebase_name"
        fi
        ;;
      *)
        fail "Unexpected Apple Firebase environment field."
        ;;
    esac
  done <<< "$firebase_env_lines"
  unset firebase_env_lines firebase_value
fi
node tool/validate_firebase_release_config.mjs --platform "$firebase_validation_platform"
if [[ "${SIT_ALLOW_CANDIDATE_ROLLOVER:-0}" == "1" ]]; then
  node tool/validate_apple_testflight_handoff.mjs --allow-android-candidate-rollover
else
  node tool/validate_apple_testflight_handoff.mjs
fi
if [[ "${SIT_REQUIRE_STORE_SUBMISSION:-0}" == "1" ]]; then
  [[ "${SIT_LEGAL_PROVIDER_APPROVED:-false}" == "true" ]] || \
    fail "Store submission requires an explicitly approved legal provider identity."
  legal_provider_fields=(
    SIT_LEGAL_PROVIDER_NAME
    SIT_LEGAL_PROVIDER_ADDRESS
    SIT_LEGAL_REPRESENTATIVE
    SIT_LEGAL_CONTENT_RESPONSIBLE
    SIT_LEGAL_CONTACT_EMAIL
  )
  for field_name in "${legal_provider_fields[@]}"; do
    [[ -n "${!field_name:-}" ]] || \
      fail "Store submission requires $field_name."
  done
  [[ "${SIT_LEGAL_CONTACT_EMAIL}" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || \
    fail "SIT_LEGAL_CONTACT_EMAIL must be a valid email address."
  [[ "${SIT_FACEBOOK_APP_ID:-}" =~ ^[1-9][0-9]{5,24}$ ]] || \
    fail "Store submission requires the real public Meta App ID."
  [[ -n "${SIT_FACEBOOK_CLIENT_TOKEN:-}" && \
     "${SIT_FACEBOOK_CLIENT_TOKEN}" != "not-configured" ]] || \
    fail "Store submission requires the real public Meta Client Token."
  [[ "${SIT_GOOGLE_REVERSED_CLIENT_ID:-}" =~ ^com\.googleusercontent\.apps\.[0-9]+-[0-9A-Za-z_-]+$ ]] || \
    fail "Store submission requires the real Apple Google Sign-In URL scheme."
  node tool/validate_firebase_release_config.mjs --require-configured --platform all
  node tool/validate_device_evidence.mjs --require-passed
  node tool/validate_legal_readiness.mjs --require-approved
  node tool/validate_support_launch_content.mjs --require-approved
  node tool/validate_product_safety_readiness.mjs --require-approved
  node tool/validate_privacy_disclosures.mjs --require-approved
  node tool/validate_retention_deletion_readiness.mjs --require-approved
  node tool/validate_store_review_access.mjs --require-ready
  node tool/validate_google_play_closed_testing.mjs --require-production-access
  node tool/validate_google_play_production_access_application.mjs --require-approved
  dart run tool/validate_store_metadata.dart --require-submittable
  node tool/verify_public_store_pages.mjs
fi

version="$(awk '/^version:/ {print $2; exit}' pubspec.yaml)"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+\+[0-9]{10}$ ]] || \
  fail "pubspec version must use semantic version plus YYYYMMDDNN build number."

build_number="${version##*+}"
(( 10#$build_number <= 2100000000 )) || fail "Android versionCode exceeds the Play limit."

grep -Fq "applicationId = \"$EXPECTED_ID\"" android/app/build.gradle || \
  fail "Android applicationId does not match $EXPECTED_ID."
grep -Fq "namespace = \"$EXPECTED_ID\"" android/app/build.gradle || \
  fail "Android namespace does not match $EXPECTED_ID."
grep -Fq "PRODUCT_BUNDLE_IDENTIFIER = $EXPECTED_ID;" ios/Runner.xcodeproj/project.pbxproj || \
  fail "iOS bundle identifier does not match $EXPECTED_ID."

# Search only version-controlled release sources. Recursive grep also sees
# Gradle/Flutter caches created by an earlier debug build and can therefore
# report stale identity strings that are not part of the candidate.
legacy_identity_found="$(git grep -nE \
  "com\.mycompany|CounterApp|Dreamflow|dreamflow" \
  -- android ios lib pubspec.yaml || true)"
if [[ -n "$legacy_identity_found" ]]; then
  fail "Legacy application identity remains in release source files."
fi

grep -Fq "applinks:shareittoo.com" ios/Runner/Runner.entitlements || \
  fail "iOS associated-domain entitlement is missing."
grep -Fq '<key>aps-environment</key>' ios/Runner/Runner.entitlements || \
  fail "iOS push-notification entitlement is missing."
grep -Fq 'android:autoVerify="${sitAppLinksAutoVerify}"' \
  android/app/src/main/AndroidManifest.xml || \
  fail "Android verified links must use the guarded manifest placeholder."
grep -Fq 'manifestPlaceholders.sitAppLinksAutoVerify = remoteQaRequested ? "false" : "true"' \
  android/app/build.gradle || \
  fail "Android verified links must remain enabled for production identities and disabled for Remote QA."
grep -Fq 'android:label="${sitAppLabel}"' android/app/src/main/AndroidManifest.xml || \
  fail "Android app labels must use the guarded manifest placeholder."
grep -Fq 'android:allowBackup="false"' android/app/src/main/AndroidManifest.xml || \
  fail "Android application backup must be disabled."
grep -Fq 'android:usesCleartextTraffic="${sitUsesCleartextTraffic}"' \
  android/app/src/main/AndroidManifest.xml || \
  fail "Android cleartext traffic must use the guarded manifest placeholder."
grep -Fq 'manifestPlaceholders.sitUsesCleartextTraffic = "false"' \
  android/app/build.gradle || \
  fail "Android cleartext traffic must remain disabled by default."
grep -Fq 'android:maxSdkVersion="32"' android/app/src/main/AndroidManifest.xml || \
  fail "Legacy Android read-storage permission must be capped at API 32."
grep -Fq 'android:maxSdkVersion="28"' android/app/src/main/AndroidManifest.xml || \
  fail "Legacy Android write-storage permission must be capped at API 28."
if grep -Fq 'android:requestLegacyExternalStorage' android/app/src/main/AndroidManifest.xml; then
  fail "Legacy Android external storage mode must not be enabled."
fi
[[ -f android/app/src/main/res/xml/backup_rules.xml ]] || \
  fail "Android backup exclusion rules are missing."
[[ -f android/app/src/main/res/xml/data_extraction_rules.xml ]] || \
  fail "Android data extraction rules are missing."

if command -v plutil >/dev/null 2>&1; then
  plutil -lint ios/Runner/Info.plist ios/Runner/Runner.entitlements >/dev/null
fi

master_description="$(file assets/images/shareittoo_app_icon_master.png)"
[[ "$master_description" == *"1024 x 1024"* ]] || \
  fail "App icon master must be exactly 1024 x 1024 pixels."

[[ -f android/key.properties ]] || \
  fail "android/key.properties is required for a signed release build."
if [[ "${SIT_REQUIRE_STORE_SUBMISSION:-0}" == "1" ||
      "${SIT_REQUIRE_CANONICAL_SIGNING:-0}" == "1" ||
      "${SIT_REQUIRE_CANONICAL_SIGNING:-}" == "true" ]]; then
  node tool/validate_android_signing_config.mjs --require-canonical
else
  node tool/validate_android_signing_config.mjs
fi

echo "Release candidate preflight passed for $EXPECTED_ID, version $version."
