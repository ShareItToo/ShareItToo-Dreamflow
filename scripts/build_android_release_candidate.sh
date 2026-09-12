#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANNEL="${SIT_RELEASE_CHANNEL:-internal}"
API_BASE_URL="${SIT_API_BASE_URL:-https://staging.shareittoo.com/api/v1}"
REQUIRE_CLEAN="${SIT_REQUIRE_CLEAN:-1}"

case "${SIT_BLUE_OCEAN_LISTING_ASSISTANT:-0}" in
  1|true) blue_ocean_listing_assistant=true ;;
  0|false|'') blue_ocean_listing_assistant=false ;;
  *)
    echo "ERROR: SIT_BLUE_OCEAN_LISTING_ASSISTANT must be 0, 1, false, or true." >&2
    exit 1
    ;;
esac
stage_a_non_binding_pilot="$blue_ocean_listing_assistant"
listing_ai_execution_location=disabled
listing_ai_model=''
if [[ "$blue_ocean_listing_assistant" == true ]]; then
  listing_ai_execution_location=android_on_device
  listing_ai_model='mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1'
fi
case "${SIT_CLOSED_PILOT_ENVELOPE:-0}" in
  1|true) closed_pilot_envelope=true ;;
  0|false|'') closed_pilot_envelope=false ;;
  *)
    echo "ERROR: SIT_CLOSED_PILOT_ENVELOPE must be 0, 1, false, or true." >&2
    exit 1
    ;;
esac
stage_a_pilot_id="${SIT_STAGE_A_PILOT_ID:-}"
booking_groups_technical_ui=false
planner_technical_ui=false
supply_enrichment_technical_ui=false
listing_sets_technical_ui=false
if [[ "$closed_pilot_envelope" == "true" ]]; then
  if [[ "$blue_ocean_listing_assistant" != "true" ||
        "$stage_a_pilot_id" != "heilbronn_wave0" ||
        "$CHANNEL" != "internal" ||
        "$API_BASE_URL" != "https://staging.shareittoo.com/api/v1" ||
        "${SIT_REQUIRE_STORE_SUBMISSION:-0}" == "1" ]]; then
    echo "ERROR: The closed pilot envelope requires exact heilbronn_wave0 Internal Staging no-submission configuration." >&2
    exit 1
  fi
  booking_groups_technical_ui=true
  planner_technical_ui=true
  supply_enrichment_technical_ui=true
  listing_sets_technical_ui=true
elif [[ -n "$stage_a_pilot_id" ]]; then
  echo "ERROR: SIT_STAGE_A_PILOT_ID is accepted only with SIT_CLOSED_PILOT_ENVELOPE=1." >&2
  exit 1
fi
case "${SIT_REQUIRE_CANONICAL_SIGNING:-0}" in
  1|true) require_canonical_signing=true ;;
  0|false|'') require_canonical_signing=false ;;
  *)
    echo "ERROR: SIT_REQUIRE_CANONICAL_SIGNING must be 0, 1, false, or true." >&2
    exit 1
    ;;
esac
if [[ "$blue_ocean_listing_assistant" == "true" &&
      ("$CHANNEL" != "internal" ||
       "$API_BASE_URL" != "https://staging.shareittoo.com/api/v1" ||
       "${SIT_REQUIRE_STORE_SUBMISSION:-0}" == "1") ]]; then
  echo "ERROR: Blue Ocean listing assistance is restricted to the non-public Internal Staging candidate." >&2
  exit 1
fi

cd "$ROOT"

if [[ "$REQUIRE_CLEAN" == "1" ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Commit-bound release builds require a clean Git worktree." >&2
  exit 1
fi

commit="$(git rev-parse HEAD)"
version="$(awk '/^version:/ {print $2; exit}' pubspec.yaml)"
build_name="${version%%+*}"
build_number="${version##*+}"

# The Android Firebase file is local and git-ignored. Derive its public client
# values in memory when the caller did not already provide them, so the exact
# file that Gradle packages is also the source for Dart FirebaseOptions. The
# values are passed directly to the build without being printed or copied into
# another configuration file.
firebase_config_path="$ROOT/android/app/google-services.json"
firebase_android_names=(
  SIT_FIREBASE_PROJECT_ID
  SIT_FIREBASE_MESSAGING_SENDER_ID
  SIT_FIREBASE_STORAGE_BUCKET
  SIT_FIREBASE_ANDROID_APP_ID
  SIT_FIREBASE_ANDROID_API_KEY
)
firebase_value_missing=false
for firebase_name in "${firebase_android_names[@]}"; do
  if [[ -z "${!firebase_name:-}" ]]; then
    firebase_value_missing=true
    break
  fi
done
if [[ -f "$firebase_config_path" && "$firebase_value_missing" == "true" ]]; then
  command -v node >/dev/null 2>&1 || {
    echo "ERROR: node is required to validate the local Firebase configuration." >&2
    exit 1
  }
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
        echo "ERROR: Unexpected Firebase environment field." >&2
        exit 1
        ;;
    esac
  done <<< "$firebase_env_lines"
  unset firebase_env_lines firebase_value
fi

SIT_FIREBASE_VALIDATION_PLATFORM=android bash scripts/release_candidate_preflight.sh

common_args=(
  --release
  "--build-name=$build_name"
  "--build-number=$build_number"
  "--dart-define=SIT_BACKEND_ENABLED=true"
  "--dart-define=SIT_API_BASE_URL=$API_BASE_URL"
  "--dart-define=SIT_APP_COMMIT=$commit"
  "--dart-define=SIT_BUILD_NUMBER=$build_number"
  "--dart-define=SIT_RELEASE_CHANNEL=$CHANNEL"
  "--dart-define=SIT_BUNDLE_ID=com.shareittoo.app"
  "--dart-define=SIT_CLIENT_BUILD=$build_name+$build_number"
  "--dart-define=SIT_BLUE_OCEAN_LISTING_ASSISTANT=$blue_ocean_listing_assistant"
  "--dart-define=SIT_STAGE_A_NON_BINDING_PILOT=$stage_a_non_binding_pilot"
  "--dart-define=SIT_STAGE_A_PILOT_ID=$stage_a_pilot_id"
  "--dart-define=SIT_BOOKING_GROUPS_TECHNICAL_UI_ENABLED=$booking_groups_technical_ui"
  "--dart-define=SIT_BOOKING_GROUPS_PUBLIC_RELEASE_ALLOWED=false"
  "--dart-define=SIT_PLANNER_TECHNICAL_UI_ENABLED=$planner_technical_ui"
  "--dart-define=SIT_SUPPLY_ENRICHMENT_TECHNICAL_UI_ENABLED=$supply_enrichment_technical_ui"
  "--dart-define=SIT_LISTING_SETS_TECHNICAL_UI_ENABLED=$listing_sets_technical_ui"
)

social_google_enabled=false
if [[ "${SIT_SOCIAL_GOOGLE_ENABLED:-0}" == "1" ||
      "${SIT_SOCIAL_GOOGLE_ENABLED:-}" == "true" ]]; then
  social_google_enabled=true
fi
social_apple_enabled=false
if [[ "${SIT_SOCIAL_APPLE_ENABLED:-0}" == "1" ||
      "${SIT_SOCIAL_APPLE_ENABLED:-}" == "true" ]]; then
  social_apple_enabled=true
fi
social_facebook_enabled=false
if [[ ("${SIT_SOCIAL_FACEBOOK_ENABLED:-0}" == "1" ||
       "${SIT_SOCIAL_FACEBOOK_ENABLED:-}" == "true") &&
      "${SIT_FACEBOOK_APP_ID:-}" =~ ^[1-9][0-9]{5,24}$ &&
      -n "${SIT_FACEBOOK_CLIENT_TOKEN:-}" &&
      "${SIT_FACEBOOK_CLIENT_TOKEN}" != "not-configured" ]]; then
  social_facebook_enabled=true
fi
common_args+=(
  "--dart-define=SIT_SOCIAL_GOOGLE_ENABLED=$social_google_enabled"
  "--dart-define=SIT_SOCIAL_APPLE_ENABLED=$social_apple_enabled"
  "--dart-define=SIT_SOCIAL_FACEBOOK_ENABLED=$social_facebook_enabled"
)

if [[ -n "${SIT_FACEBOOK_APP_ID:-}" ]]; then
  export SIT_FACEBOOK_APP_ID
fi
if [[ -n "${SIT_FACEBOOK_CLIENT_TOKEN:-}" ]]; then
  export SIT_FACEBOOK_CLIENT_TOKEN
fi

if [[ "${SIT_ENABLE_STAGING_CRASH_DIAGNOSTIC:-0}" == "1" ]]; then
  diagnostic_run_id="${SIT_STAGING_CRASH_DIAGNOSTIC_RUN_ID:-}"
  if [[ "$API_BASE_URL" != "https://staging.shareittoo.com/api/v1" ||
        "$CHANNEL" != "internal" ||
        "${SIT_REQUIRE_STORE_SUBMISSION:-0}" == "1" ||
        ! "$diagnostic_run_id" =~ ^b11-[a-z0-9-]{6,64}$ ]]; then
    echo "ERROR: Controlled Crashlytics diagnostics require internal staging, a safe run ID, and a non-submission build." >&2
    exit 1
  fi
  common_args+=(
    "--dart-define=SIT_ENABLE_STAGING_CRASH_DIAGNOSTIC=true"
    "--dart-define=SIT_STAGING_CRASH_DIAGNOSTIC_RUN_ID=$diagnostic_run_id"
  )
fi

firebase_define_names=(
  SIT_FIREBASE_PROJECT_ID
  SIT_FIREBASE_MESSAGING_SENDER_ID
  SIT_FIREBASE_STORAGE_BUCKET
  SIT_FIREBASE_ANDROID_APP_ID
  SIT_FIREBASE_ANDROID_API_KEY
  SIT_FIREBASE_IOS_APP_ID
  SIT_FIREBASE_IOS_API_KEY
)
for define_name in "${firebase_define_names[@]}"; do
  define_value="${!define_name:-}"
  if [[ -n "$define_value" ]]; then
    common_args+=("--dart-define=$define_name=$define_value")
  fi
done

legal_define_names=(
  SIT_LEGAL_PROVIDER_APPROVED
  SIT_LEGAL_PROVIDER_NAME
  SIT_LEGAL_PROVIDER_ADDRESS
  SIT_LEGAL_REPRESENTATIVE
  SIT_LEGAL_CONTENT_RESPONSIBLE
  SIT_LEGAL_CONTACT_EMAIL
  SIT_LEGAL_CONTACT_PHONE
  SIT_CONSUMER_DISPUTE_APPROVED
  SIT_CONSUMER_DISPUTE_CONFIGURATION_VERSION
  SIT_CONSUMER_DISPUTE_BODY_NAME
  SIT_CONSUMER_DISPUTE_BODY_ADDRESS
  SIT_CONSUMER_DISPUTE_BODY_WEBSITE
  SIT_CONSUMER_DISPUTE_PARTICIPATION_STATUS
)
for define_name in "${legal_define_names[@]}"; do
  define_value="${!define_name:-}"
  if [[ -n "$define_value" ]]; then
    common_args+=("--dart-define=$define_name=$define_value")
  fi
done

# A Maps credential belongs only on the backend. Refuse legacy build
# environments so it cannot accidentally be embedded in a release binary.
if [[ -n "${GOOGLE_MAPS_API_KEY:-}" ]]; then
  echo "ERROR: GOOGLE_MAPS_API_KEY must not be embedded in an app build; configure GOOGLE_MAPS_SERVER_API_KEY only on the backend." >&2
  exit 1
fi

if [[ "${SIT_REQUIRE_FIREBASE:-0}" == "1" ]]; then
  node tool/validate_firebase_release_config.mjs --require-configured --platform android
fi

if [[ "${SIT_BUILD_PREFLIGHT_ONLY:-0}" == "1" ]]; then
  echo "Android release build preflight passed without creating artifacts."
  exit 0
fi

source scripts/release_host_capacity_guard.sh
release_host_capacity_begin

# A signed candidate produces both a large AAB and APK. Always own the
# generated Flutter lifecycle so a previous debug/release build cannot consume
# the physical reserve that is still needed to archive both exact artifacts.
# The private owner-only archive is outside Flutter's generated tree and is
# created only after all verification has passed.
release_candidate_clean_generated() {
  flutter clean >/dev/null
}

release_candidate_cleanup_on_exit() {
  local status="$?"
  trap - EXIT
  if ! release_candidate_clean_generated; then
    echo "ERROR: Generated Android release files could not be cleaned deterministically." >&2
    status=1
  fi
  exit "$status"
}

trap release_candidate_cleanup_on_exit EXIT
release_candidate_clean_generated

node tool/run_checked_android_build.mjs appbundle "${common_args[@]}"
node tool/run_checked_android_build.mjs apk "${common_args[@]}"

aab="build/app/outputs/bundle/release/app-release.aab"
apk="build/app/outputs/flutter-apk/app-release.apk"
[[ -f "$aab" ]] || { echo "ERROR: AAB was not created." >&2; exit 1; }
[[ -f "$apk" ]] || { echo "ERROR: APK was not created." >&2; exit 1; }

# Upload keys are intentionally self-signed. Verify the JAR signature itself;
# `-strict` would reject the expected self-signed certificate chain.
jarsigner -verify "$aab" >/dev/null

android_sdk_root="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -z "$android_sdk_root" && -f android/local.properties ]]; then
  android_sdk_root="$(sed -n 's/^sdk\.dir=//p' android/local.properties | tail -n1)"
fi
if [[ -z "$android_sdk_root" ]]; then
  android_sdk_root="$HOME/Library/Android/sdk"
fi
build_tools_root="$android_sdk_root/build-tools"
build_tools="$(find "$build_tools_root" -mindepth 1 -maxdepth 1 -type d | sort -V | tail -n1)"
[[ -x "$build_tools/apksigner" ]] || { echo "ERROR: apksigner is unavailable." >&2; exit 1; }
[[ -x "$build_tools/aapt" ]] || { echo "ERROR: aapt is unavailable." >&2; exit 1; }
"$build_tools/apksigner" verify --verbose "$apk" >/dev/null
signing_certificate_sha256="$("$build_tools/apksigner" verify --print-certs "$apk" | \
  sed -E -n 's/^(V[0-9]+ Signer:|Signer #[0-9]+) certificate SHA-256 digest: ([0-9A-Fa-f]{64})$/\2/p' | \
  head -n1 | tr '[:upper:]' '[:lower:]')"
[[ "$signing_certificate_sha256" =~ ^[0-9a-f]{64}$ ]] || {
  echo "ERROR: APK signing certificate SHA-256 could not be verified." >&2
  exit 1
}
canonical_signing_certificate_sha256="098f485e57161558e911fc3c742845925584db31c474cdba08dda02feb0129a4"
if [[ ("${SIT_REQUIRE_STORE_SUBMISSION:-0}" == "1" || \
       "$require_canonical_signing" == "true") && \
      "$signing_certificate_sha256" != "$canonical_signing_certificate_sha256" ]]; then
  echo "ERROR: Candidate is not signed by the canonical ShareItToo upload certificate." >&2
  exit 1
fi
"$build_tools/aapt" dump badging "$apk" | grep -Fq "package: name='com.shareittoo.app' versionCode='$build_number' versionName='$build_name'" || {
  echo "ERROR: APK package or version identity does not match the release request." >&2
  exit 1
}

evidence_dir="build/release-evidence/android-$build_number"
mkdir -p "$evidence_dir"
privacy_report="$evidence_dir/privacy-scan.json"
node tool/verify_android_binary_privacy.mjs \
  --apk "$apk" \
  --aab "$aab" \
  --aapt "$build_tools/aapt" \
  --commit "$commit" \
  --api-base-url "$API_BASE_URL" \
  --version-name "$build_name" \
  --version-code "$build_number" \
  --output "$privacy_report"

aab_sha="$(shasum -a 256 "$aab" | awk '{print $1}')"
apk_sha="$(shasum -a 256 "$apk" | awk '{print $1}')"
privacy_report_sha="$(shasum -a 256 "$privacy_report" | awk '{print $1}')"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
firebase_configured=false
if [[ -n "${SIT_FIREBASE_PROJECT_ID:-}" && \
      -n "${SIT_FIREBASE_MESSAGING_SENDER_ID:-}" && \
      -n "${SIT_FIREBASE_ANDROID_APP_ID:-}" && \
      -n "${SIT_FIREBASE_ANDROID_API_KEY:-}" ]]; then
  firebase_configured=true
fi

printf '%s\n' \
  "{" \
  "  \"platform\": \"android\"," \
  "  \"applicationId\": \"com.shareittoo.app\"," \
  "  \"versionName\": \"$build_name\"," \
  "  \"versionCode\": \"$build_number\"," \
  "  \"commit\": \"$commit\"," \
  "  \"channel\": \"$CHANNEL\"," \
  "  \"apiBaseUrl\": \"$API_BASE_URL\"," \
  "  \"clientBuild\": \"$build_name+$build_number\"," \
  "  \"blueOceanListingAssistantEnabled\": $blue_ocean_listing_assistant," \
  "  \"listingAiExecutionLocation\": \"$listing_ai_execution_location\"," \
  "  \"listingAiModel\": \"$listing_ai_model\"," \
  "  \"listingAiExternalImageProviderEnabled\": false," \
  "  \"stageANonBindingPilotEnabled\": $stage_a_non_binding_pilot," \
  "  \"closedPilotEnvelopeEnabled\": $closed_pilot_envelope," \
  "  \"stageAPilotId\": \"$stage_a_pilot_id\"," \
  "  \"g3TechnicalUiEnabled\": $booking_groups_technical_ui," \
  "  \"g4TechnicalUiEnabled\": $planner_technical_ui," \
  "  \"g5SupplyEnrichmentTechnicalUiEnabled\": $supply_enrichment_technical_ui," \
  "  \"g5ListingSetsTechnicalUiEnabled\": $listing_sets_technical_ui," \
  "  \"socialAuth\": {" \
  "    \"googleEnabled\": $social_google_enabled," \
  "    \"appleEnabled\": $social_apple_enabled," \
  "    \"facebookEnabled\": $social_facebook_enabled" \
  "  }," \
  "  \"firebaseConfigured\": $firebase_configured," \
  "  \"signingCertificateSha256\": \"$signing_certificate_sha256\"," \
  "  \"createdAt\": \"$created_at\"," \
  "  \"androidBinaryPrivacyScan\": \"passed\"," \
  "  \"androidBinaryPrivacyReport\": \"privacy-scan.json\"," \
  "  \"androidBinaryPrivacyReportSha256\": \"$privacy_report_sha\"," \
  "  \"aabSha256\": \"$aab_sha\"," \
  "  \"apkSha256\": \"$apk_sha\"" \
  "}" > "$evidence_dir/manifest.json"

cp "$aab" "$evidence_dir/shareittoo-$build_name-$build_number-$commit.aab"
cp "$apk" "$evidence_dir/shareittoo-$build_name-$build_number-$commit.apk"

node tool/archive_android_release_candidate.mjs

release_candidate_clean_generated
trap - EXIT
release_host_capacity_end

echo "Signed Android release candidate created for commit $commit."
echo "The exact AAB, APK, manifest and privacy report are retained only in the verified owner-only private archive."
