#!/usr/bin/env bash
set -euo pipefail

task_backend_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_environment="${1:-}"
task_commit="${2:-}"
task_enable_staging_fcm="${ENABLE_STAGING_FCM:-0}"
task_enable_staging_smtp="${ENABLE_STAGING_SMTP:-0}"
task_enable_staging_listing_ai="${ENABLE_STAGING_LISTING_AI:-0}"
task_enable_staging_stripe="${ENABLE_STAGING_STRIPE:-0}"
task_node_binary="${NODE_BINARY:-node}"
task_deployment_started=false
task_previous_image_id=''
task_previous_commit=''
task_previous_version='unknown'
task_previous_build_time='unknown'
task_rollback_override=''
task_deployment_override=''
task_rollback_override_retained=false
task_deployment_override_retained=false
task_runtime_override_dir=''
task_ready_payload_file=''
task_release_dir="${RELEASE_LOG_DIR:-/docker/shareittoo/releases}"
task_staging_pilot_id="${SIT_STAGING_PILOT_ID:-}"
task_pull_release_image="${PULL_RELEASE_IMAGE:-0}"
task_staging_smtp_enabled=false
task_staging_listing_ai_enabled=false
task_staging_external_listing_ai_enabled=false
task_staging_stripe_enabled=false
task_rollback_compose_args=()

cleanup() {
  if [[ -n "$task_rollback_override" && "$task_rollback_override_retained" != true ]]; then
    rm -f -- "$task_rollback_override"
  fi
  if [[ -n "$task_deployment_override" && "$task_deployment_override_retained" != true ]]; then
    rm -f -- "$task_deployment_override"
  fi
  if [[ -n "$task_ready_payload_file" ]]; then
    rm -f -- "$task_ready_payload_file"
  fi
}

prepare_runtime_override_dir() {
  task_runtime_override_dir="$task_backend_root/.runtime-overrides"
  if [[ -e "$task_runtime_override_dir" &&
        ( ! -d "$task_runtime_override_dir" || -L "$task_runtime_override_dir" ) ]]; then
    echo "Runtime override directory must be a regular directory." >&2
    exit 1
  fi
  install -d -m 700 "$task_runtime_override_dir"
  if [[ ! -d "$task_runtime_override_dir" || -L "$task_runtime_override_dir" ]]; then
    echo "Runtime override directory is unsafe." >&2
    exit 1
  fi
  chmod 700 "$task_runtime_override_dir"
}

create_runtime_override() {
  local task_override_kind="$1"
  mktemp "$task_runtime_override_dir/${task_environment}-${task_commit:0:12}-${task_override_kind}-XXXXXX.yml"
}

rollback_failed_deployment() {
  task_failed_status=$?
  trap - ERR
  set +e

  if [[ "$task_deployment_started" == true && -n "$task_previous_image_id" ]]; then
    task_rollback_override="$(create_runtime_override rollback)"
    chmod 600 "$task_rollback_override"
    printf 'services:\n  api:\n    image: "%s"\n' \
      "$task_previous_image_id" > "$task_rollback_override"
    if [[ "$task_staging_listing_ai_enabled" == true ||
          "$task_staging_stripe_enabled" == true ]]; then
      printf '    environment:\n' >> "$task_rollback_override"
    fi
    if [[ "$task_staging_listing_ai_enabled" == true ]]; then
      printf '      SIT_LISTING_AI_PROVIDER: mock\n      SIT_LISTING_AI_MODEL: listing-ai-mock-v1\n      SIT_LISTING_AI_BUDGET_CENTS: "0"\n      SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED: "0"\n      OPENAI_API_KEY: ""\n      OPENAI_API_KEY_FILE: ""\n' \
        >> "$task_rollback_override"
    fi
    if [[ "$task_staging_stripe_enabled" == true ]]; then
      printf '      PAYMENT_TRANSPORT: memory\n      STRIPE_LIVEMODE: "false"\n      STRIPE_SECRET_KEY: ""\n      STRIPE_WEBHOOK_SECRET: ""\n      STRIPE_CONNECT_WEBHOOK_SECRET: ""\n      STRIPE_SECRET_KEY_FILE: ""\n      STRIPE_WEBHOOK_SECRET_FILE: ""\n      STRIPE_CONNECT_WEBHOOK_SECRET_FILE: ""\n' \
        >> "$task_rollback_override"
    fi

    task_rollback_commit="${task_previous_commit:-unknown}"
    APP_VERSION="$task_previous_version" \
    APP_COMMIT="$task_rollback_commit" \
    APP_BUILD_TIME="$task_previous_build_time" \
    docker compose --project-name "$task_project_name" \
      --env-file "$task_env_file" "${task_rollback_compose_args[@]}" \
      -f "$task_rollback_override" \
      up -d --no-build --wait --wait-timeout 180
    task_rollback_compose_status=$?

    task_restored_image_id="$(docker inspect --format '{{.Image}}' \
      "$task_api_container" 2>/dev/null)"
    task_restored_health="$(docker inspect \
      --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
      "$task_api_container" 2>/dev/null)"
    curl --fail --silent --show-error --max-time 20 \
      "$task_health_url/health" >/dev/null
    task_rollback_health_status=$?

    if [[ "$task_rollback_compose_status" == 0 &&
          "$task_rollback_health_status" == 0 &&
          "$task_restored_health" == healthy &&
          "$task_restored_image_id" == "$task_previous_image_id" ]]; then
      task_rollback_override_retained=true
      install -d -m 700 "$task_release_dir"
      task_rollback_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
      task_rollback_report="$task_release_dir/${task_environment}-rollback-${task_rollback_timestamp}-${task_commit:0:12}.json"
      printf '{"environment":"%s","failedCommit":"%s","restoredCommit":"%s","restoredImageId":"%s","rolledBackAt":"%s","status":"passed"}\n' \
        "$task_environment" "$task_commit" "$task_rollback_commit" \
        "$task_previous_image_id" "$task_rollback_timestamp" > "$task_rollback_report"
      chmod 600 "$task_rollback_report"
      printf 'Deployment failed; previous image restored and verified.\nEvidence: %s\n' \
        "$task_rollback_report" >&2
    else
      printf 'CRITICAL: deployment failed and automatic rollback could not be verified.\n' >&2
    fi
  elif [[ "$task_deployment_started" == true ]]; then
    printf 'CRITICAL: deployment failed and no previous API image was available for rollback.\n' >&2
  fi

  cleanup
  exit "$task_failed_status"
}

trap cleanup EXIT
trap rollback_failed_deployment ERR

if [[ "$task_environment" != staging && "$task_environment" != production ]]; then
  echo "Usage: $0 <staging|production> <40-character-commit>" >&2
  exit 1
fi
if [[ ! "$task_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full lowercase 40-character Git commit is required." >&2
  exit 1
fi
if [[ "$task_enable_staging_fcm" != 0 && "$task_enable_staging_fcm" != 1 ]]; then
  echo "ENABLE_STAGING_FCM must be 0 or 1." >&2
  exit 1
fi
if [[ "$task_enable_staging_smtp" != 0 && "$task_enable_staging_smtp" != 1 ]]; then
  echo "ENABLE_STAGING_SMTP must be 0 or 1." >&2
  exit 1
fi
if [[ "$task_enable_staging_listing_ai" != 0 && "$task_enable_staging_listing_ai" != 1 ]]; then
  echo "ENABLE_STAGING_LISTING_AI must be 0 or 1." >&2
  exit 1
fi
if [[ "$task_enable_staging_stripe" != 0 && "$task_enable_staging_stripe" != 1 ]]; then
  echo "ENABLE_STAGING_STRIPE must be 0 or 1." >&2
  exit 1
fi
if [[ "$task_environment" == production && "$task_enable_staging_fcm" == 1 ]]; then
  echo "The staging FCM override is forbidden for production deployments." >&2
  exit 1
fi
if [[ "$task_environment" == production && "$task_enable_staging_smtp" == 1 ]]; then
  echo "The staging SMTP override is forbidden for production deployments." >&2
  exit 1
fi
if [[ "$task_environment" == production && "$task_enable_staging_listing_ai" == 1 ]]; then
  echo "The staging listing-AI override is forbidden for production deployments." >&2
  exit 1
fi
if [[ "$task_environment" == production && "$task_enable_staging_stripe" == 1 ]]; then
  echo "The staging Stripe override is forbidden for production deployments." >&2
  exit 1
fi
if [[ "$task_pull_release_image" != 0 && "$task_pull_release_image" != 1 ]]; then
  echo "PULL_RELEASE_IMAGE must be 0 or 1." >&2
  exit 1
fi
if [[ "$task_environment" == production && -n "$task_staging_pilot_id" ]]; then
  echo "SIT_STAGING_PILOT_ID is forbidden for production deployments." >&2
  exit 1
fi
if [[ -n "$task_staging_pilot_id" && "$task_staging_pilot_id" != heilbronn_wave0 ]]; then
  echo "SIT_STAGING_PILOT_ID must be empty or heilbronn_wave0." >&2
  exit 1
fi
if [[ "$task_enable_staging_listing_ai" == 1 && "$task_staging_pilot_id" != heilbronn_wave0 ]]; then
  echo "The staging listing-AI override requires SIT_STAGING_PILOT_ID=heilbronn_wave0." >&2
  exit 1
fi
if [[ "$task_enable_staging_stripe" == 1 && "$task_staging_pilot_id" != heilbronn_wave0 ]]; then
  echo "The staging Stripe override requires SIT_STAGING_PILOT_ID=heilbronn_wave0." >&2
  exit 1
fi
if [[ "$task_enable_staging_listing_ai" == 1 && "${CONFIRM_STAGING_LISTING_AI:-}" != "$task_commit" ]]; then
  echo "CONFIRM_STAGING_LISTING_AI must equal the exact deployment commit." >&2
  exit 1
fi
if [[ "$task_enable_staging_stripe" == 1 && "${CONFIRM_STAGING_STRIPE:-}" != "$task_commit" ]]; then
  echo "CONFIRM_STAGING_STRIPE must equal the exact deployment commit." >&2
  exit 1
fi

task_image="${IMAGE_REPOSITORY:-shareittoo-api}:$task_commit"
if [[ "$task_pull_release_image" == 1 ]]; then
  if [[ ! "${IMAGE_REPOSITORY:-}" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+$ ]]; then
    echo "PULL_RELEASE_IMAGE requires an explicit GHCR IMAGE_REPOSITORY." >&2
    exit 1
  fi
  docker pull "$task_image"
fi
task_image_commit="$(docker image inspect "$task_image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')"
task_version="$(docker image inspect "$task_image" --format '{{ index .Config.Labels "org.opencontainers.image.version" }}')"
task_build_time="$(docker image inspect "$task_image" --format '{{ index .Config.Labels "org.opencontainers.image.created" }}')"
if [[ "$task_image_commit" != "$task_commit" ]]; then
  echo "Image revision label does not match $task_commit." >&2
  exit 1
fi

prepare_runtime_override_dir
task_deployment_override="$(create_runtime_override deployment)"
chmod 600 "$task_deployment_override"
printf 'services:\n  api:\n    image: "%s"\n' \
  "$task_image" > "$task_deployment_override"

if [[ "$task_environment" == production ]]; then
  task_compose="$task_backend_root/compose.prod.yml"
  task_compose_args=(-f "$task_compose")
  task_env_file="$task_backend_root/.env"
  task_health_url="${HEALTH_URL:-https://shareittoo.com/api}"
  task_project_name=backend
  task_api_container=shareittoo-api
  task_fcm_enabled=false
  task_database_container=shareittoo-postgres
  task_database_user=shareittoo
  task_database_name=shareittoo
  if [[ "${CONFIRM_PRODUCTION_DEPLOY:-}" != "$task_commit" ]]; then
    echo "Set CONFIRM_PRODUCTION_DEPLOY to the exact commit before a production rollout." >&2
    exit 1
  fi
  "$task_backend_root/ops/backup.sh"
else
  task_compose="$task_backend_root/compose.staging.yml"
  task_compose_args=(-f "$task_compose")
  task_env_file="$task_backend_root/.env.staging"
  task_health_url="${HEALTH_URL:-http://127.0.0.1:${STAGING_API_PORT:-18080}}"
  task_project_name=sit-staging
  task_api_container=shareittoo-staging-api
  task_fcm_enabled=false
  task_database_container=shareittoo-staging-postgres
  task_database_user=shareittoo_staging
  task_database_name=shareittoo_staging
  if [[ "$task_staging_pilot_id" == heilbronn_wave0 ]]; then
    task_compose_args+=(-f "$task_backend_root/compose.staging.pilot.yml")
    task_staging_listing_ai_enabled=true
  fi
  if [[ "$task_enable_staging_fcm" == 1 ]]; then
    FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-}" \
    FIREBASE_SERVICE_ACCOUNT_HOST_FILE="${FIREBASE_SERVICE_ACCOUNT_HOST_FILE:-}" \
      "$task_node_binary" "$task_backend_root/ops/validate_fcm_staging_secret.mjs"
    task_compose_args+=(-f "$task_backend_root/compose.staging.fcm.yml")
    task_fcm_enabled=true
  fi
  if [[ "$task_enable_staging_listing_ai" == 1 ]]; then
    if [[ "${SIT_LISTING_AI_MODEL:-}" != gpt-4o-mini-2024-07-18 ]]; then
      echo "SIT_LISTING_AI_MODEL must equal the reviewed Staging listing-AI model." >&2
      exit 1
    fi
    if [[ ! "${SIT_LISTING_AI_BUDGET_CENTS:-}" =~ ^[0-9]+$ ]]; then
      echo "SIT_LISTING_AI_BUDGET_CENTS must be an integer from 2 to 500." >&2
      exit 1
    fi
    task_listing_ai_budget_cents=$((10#${SIT_LISTING_AI_BUDGET_CENTS}))
    if (( task_listing_ai_budget_cents < 2 || task_listing_ai_budget_cents > 500 )); then
      echo "SIT_LISTING_AI_BUDGET_CENTS must be an integer from 2 to 500." >&2
      exit 1
    fi
    if [[ "${SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED:-}" != 1 ]]; then
      echo "SIT_LISTING_AI_EXTERNAL_EXECUTION_APPROVED must equal 1." >&2
      exit 1
    fi
    OPENAI_API_KEY_HOST_FILE="${OPENAI_API_KEY_HOST_FILE:-}" \
      "$task_node_binary" "$task_backend_root/ops/validate_openai_staging_secret.mjs"
    task_compose_args+=(-f "$task_backend_root/compose.staging.listing-ai.yml")
    task_staging_listing_ai_enabled=true
    task_staging_external_listing_ai_enabled=true
  fi
  if [[ "$task_enable_staging_stripe" == 1 ]]; then
    STRIPE_SECRET_KEY_HOST_FILE="${STRIPE_SECRET_KEY_HOST_FILE:-}" \
    STRIPE_WEBHOOK_SECRET_HOST_FILE="${STRIPE_WEBHOOK_SECRET_HOST_FILE:-}" \
    STRIPE_CONNECT_WEBHOOK_SECRET_HOST_FILE="${STRIPE_CONNECT_WEBHOOK_SECRET_HOST_FILE:-}" \
      "$task_node_binary" "$task_backend_root/ops/validate_stripe_staging_secrets.mjs"
    task_compose_args+=(-f "$task_backend_root/compose.staging.stripe.yml")
    task_staging_stripe_enabled=true
  fi
fi

if [[ ! -f "$task_env_file" ]]; then
  echo "Missing environment file: $task_env_file" >&2
  exit 1
fi

if [[ "$task_environment" == staging && "$task_enable_staging_smtp" == 1 ]]; then
  task_required_staging_smtp_lines=(
    'SMTP_HOST=smtp-relay.gmail.com'
    'SMTP_PORT=587'
    'SMTP_SECURE=false'
    'SMTP_REQUIRE_TLS=true'
    'SMTP_USER='
    'SMTP_PASSWORD='
    'MAIL_FROM=ShareItToo Staging <contact@shareittoo.com>'
    'MAIL_REPLY_TO=contact@shareittoo.com'
  )
  for task_required_staging_smtp_line in "${task_required_staging_smtp_lines[@]}"; do
    if ! grep -Fqx -- "$task_required_staging_smtp_line" "$task_env_file"; then
      echo "The staging SMTP environment is missing a required safe relay setting." >&2
      exit 1
    fi
  done
  task_compose_args+=(-f "$task_backend_root/compose.staging.smtp.yml")
  task_staging_smtp_enabled=true
fi

# Rollback must never inherit optional external-provider overlays because they
# contain credential mounts. Preserve all other active Staging overlays while
# removing each external-provider pair before deployment can begin.
for ((task_compose_index = 0; task_compose_index < ${#task_compose_args[@]}; task_compose_index++)); do
  if [[ "${task_compose_args[$task_compose_index]}" == -f &&
        ( "${task_compose_args[$((task_compose_index + 1))]:-}" == "$task_backend_root/compose.staging.listing-ai.yml" ||
          "${task_compose_args[$((task_compose_index + 1))]:-}" == "$task_backend_root/compose.staging.stripe.yml" ) ]]; then
      task_compose_index=$((task_compose_index + 1))
      continue
  fi
  task_rollback_compose_args+=("${task_compose_args[$task_compose_index]}")
done

DATABASE_CONTAINER="$task_database_container" \
DATABASE_USER="$task_database_user" \
DATABASE_NAME="$task_database_name" \
  "$task_backend_root/ops/check_foreign_key_integrity.sh"

task_previous_commit="$(curl --fail --silent --show-error --max-time 15 "$task_health_url/version" 2>/dev/null | sed -n 's/.*"commit":"\([0-9a-f]*\)".*/\1/p' || true)"
task_previous_image_id="$(docker inspect --format '{{.Image}}' "$task_api_container" 2>/dev/null || true)"
if [[ -n "$task_previous_image_id" ]]; then
  task_previous_version="$(docker image inspect "$task_previous_image_id" \
    --format '{{ index .Config.Labels "org.opencontainers.image.version" }}' 2>/dev/null || true)"
  task_previous_build_time="$(docker image inspect "$task_previous_image_id" \
    --format '{{ index .Config.Labels "org.opencontainers.image.created" }}' 2>/dev/null || true)"
  task_previous_version="${task_previous_version:-unknown}"
  task_previous_build_time="${task_previous_build_time:-unknown}"
fi

task_deployment_started=true
APP_VERSION="$task_version" \
APP_COMMIT="$task_commit" \
APP_BUILD_TIME="$task_build_time" \
docker compose --project-name "$task_project_name" \
  --env-file "$task_env_file" "${task_compose_args[@]}" \
  -f "$task_deployment_override" \
  up -d --no-build --wait --wait-timeout 180

task_version_payload="$(curl --fail --silent --show-error --max-time 20 "$task_health_url/version")"
if ! grep -q "\"commit\":\"$task_commit\"" <<<"$task_version_payload"; then
  echo "Deployment health endpoint does not expose the requested commit." >&2
  exit 1
fi
if [[ "$task_environment" == staging ]]; then
  task_ready_payload_file="$(mktemp)"
  task_ready_http_status="$(curl --silent --show-error --max-time 20 \
    --output "$task_ready_payload_file" --write-out '%{http_code}' \
    "$task_health_url/health/ready")"
  task_ready_payload="$(<"$task_ready_payload_file")"
  task_staging_readiness="$(printf '%s' "$task_ready_payload" | \
    "$task_node_binary" "$task_backend_root/ops/validate_staging_deployment_readiness.mjs" \
      "--http-status=$task_ready_http_status")"
else
  task_ready_payload="$(curl --fail --silent --show-error --max-time 20 \
    "$task_health_url/health/ready")"
  task_staging_readiness='null'
fi
if [[ "$task_staging_external_listing_ai_enabled" == true ]] &&
   ! printf '%s' "$task_ready_payload" | "$task_node_binary" -e '
     const { readFileSync } = require("node:fs");
     const payload = JSON.parse(readFileSync(0, "utf8"));
     const boundary = payload?.listingAi;
     const valid = boundary?.status === "enabled"
       && boundary.provider === "openai"
       && boundary.model === "gpt-4o-mini-2024-07-18"
       && boundary.promptVersion === "listing-ai-prompt-v1"
       && boundary.schemaVersion === "listing-ai-draft-v1"
       && boundary.budgetCents === Number(process.env.SIT_LISTING_AI_BUDGET_CENTS)
       && boundary.externalProviderExecutionAllowed === true
       && boundary.automaticPublicationAllowed === false;
     process.exitCode = valid ? 0 : 1;
   '; then
  echo "Staging listing-AI health does not confirm the exact enabled provider boundary." >&2
  exit 1
fi
if [[ "$task_staging_listing_ai_enabled" == true
      && "$task_staging_external_listing_ai_enabled" != true ]] &&
   ! printf '%s' "$task_ready_payload" | "$task_node_binary" -e '
     const { readFileSync } = require("node:fs");
     const payload = JSON.parse(readFileSync(0, "utf8"));
     const boundary = payload?.listingAi;
     const valid = boundary?.status === "enabled"
       && boundary.provider === "on_device"
       && boundary.model === "mlkit-image-labeling-17.0.9+text-recognition-16.0.1+sit-rules-v1"
       && boundary.promptVersion === "listing-ai-prompt-v1"
       && boundary.schemaVersion === "listing-ai-draft-v1"
       && boundary.budgetCents === 0
       && boundary.externalProviderExecutionAllowed === false
       && boundary.automaticPublicationAllowed === false;
     process.exitCode = valid ? 0 : 1;
   '; then
  echo "Staging listing-AI health does not confirm the exact on-device provider boundary." >&2
  exit 1
fi
if [[ "$task_staging_stripe_enabled" == true ]] &&
   ! printf '%s' "$task_ready_payload" | "$task_node_binary" -e '
     const { readFileSync } = require("node:fs");
     const payload = JSON.parse(readFileSync(0, "utf8"));
     const boundary = payload?.checks?.paymentProvider;
     const valid = boundary?.status === "enabled"
       && boundary.provider === "stripe"
       && boundary.mode === "test"
       && boundary.apiVersion === "2026-08-26.dahlia"
       && boundary.currency === "EUR"
       && boundary.country === "DE"
       && boundary.credentialSource === "file";
     process.exitCode = valid ? 0 : 1;
   '; then
  echo "Staging Stripe health does not confirm the exact test-only provider boundary." >&2
  exit 1
fi

install -d -m 700 "$task_release_dir"
task_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
task_report="$task_release_dir/${task_environment}-${task_timestamp}-${task_commit:0:12}.json"
printf '{"environment":"%s","commit":"%s","previousCommit":"%s","version":"%s","buildTime":"%s","deployedAt":"%s","stagingFcm":%s,"stagingSmtp":%s,"stagingListingAi":%s,"stagingStripe":%s,"stagingPilotId":"%s","stagingReadiness":%s}\n' \
  "$task_environment" "$task_commit" "$task_previous_commit" "$task_version" \
  "$task_build_time" "$task_timestamp" "$task_fcm_enabled" "$task_staging_smtp_enabled" \
  "$task_staging_listing_ai_enabled" "$task_staging_stripe_enabled" \
  "$task_staging_pilot_id" "$task_staging_readiness" > "$task_report"
chmod 600 "$task_report"
task_deployment_override_retained=true
task_deployment_started=false

printf 'Deployment verified: %s %s\nEvidence: %s\n' \
  "$task_environment" "$task_commit" "$task_report"
