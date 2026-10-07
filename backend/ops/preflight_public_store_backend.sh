#!/usr/bin/env bash
set -euo pipefail

task_commit="${1:-}"
task_image_repository="${IMAGE_REPOSITORY:-}"
task_postgres_image='postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777'

if [[ ! "$task_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Usage: IMAGE_REPOSITORY=ghcr.io/<approved-namespace>/<image> $0 <40-character-commit>" >&2
  exit 1
fi
if [[ ! "$task_image_repository" =~ ^ghcr\.io/[a-z0-9._-]+/[a-z0-9._-]+$ ]]; then
  echo "IMAGE_REPOSITORY must be an explicit role-approved GHCR repository." >&2
  exit 1
fi
for task_command in docker openssl sed grep mktemp; do
  if ! command -v "$task_command" >/dev/null 2>&1; then
    echo "Missing required command: $task_command" >&2
    exit 1
  fi
done

task_suffix="${task_commit:0:12}-$$"
task_network="sit-public-preflight-$task_suffix"
task_database="sit-public-preflight-db-$task_suffix"
task_api="sit-public-preflight-api-$task_suffix"
task_image="$task_image_repository:$task_commit"
task_tmp_dir="$(mktemp -d)"

task_cleanup() {
  docker rm -f "$task_api" "$task_database" >/dev/null 2>&1 || true
  docker network rm "$task_network" >/dev/null 2>&1 || true
  rm -rf "$task_tmp_dir"
}
trap task_cleanup EXIT

docker pull "$task_image" >/dev/null
task_image_commit="$(docker image inspect "$task_image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')"
task_image_version="$(docker image inspect "$task_image" --format '{{ index .Config.Labels "org.opencontainers.image.version" }}')"
task_image_build_time="$(docker image inspect "$task_image" --format '{{ index .Config.Labels "org.opencontainers.image.created" }}')"
task_image_id="$(docker image inspect "$task_image" --format '{{.Id}}')"
if [[ "$task_image_commit" != "$task_commit" ]]; then
  echo "Image revision label does not match $task_commit." >&2
  exit 1
fi

task_database_password="$(openssl rand -hex 24)"
task_jwt_secret="$(openssl rand -hex 32)"
docker network create "$task_network" >/dev/null
docker run -d \
  --name "$task_database" \
  --network "$task_network" \
  -e POSTGRES_DB=sit_preflight \
  -e POSTGRES_USER=sit_preflight \
  -e POSTGRES_PASSWORD="$task_database_password" \
  --health-cmd='pg_isready -U sit_preflight -d sit_preflight' \
  --health-interval=2s \
  --health-timeout=3s \
  --health-retries=30 \
  "$task_postgres_image" >/dev/null

for _ in $(seq 1 40); do
  if [[ "$(docker inspect "$task_database" --format '{{.State.Health.Status}}')" == healthy ]]; then
    break
  fi
  sleep 1
done
if [[ "$(docker inspect "$task_database" --format '{{.State.Health.Status}}')" != healthy ]]; then
  echo "Ephemeral PostgreSQL did not become healthy." >&2
  exit 1
fi

docker run -d \
  --name "$task_api" \
  --network "$task_network" \
  -e NODE_ENV=production \
  -e DEPLOYMENT_ENVIRONMENT=production \
  -e APP_VERSION="$task_image_version" \
  -e APP_COMMIT="$task_commit" \
  -e APP_BUILD_TIME="$task_image_build_time" \
  -e "DATABASE_URL=postgres://sit_preflight:$task_database_password@$task_database:5432/sit_preflight" \
  -e JWT_SECRET="$task_jwt_secret" \
  -e CORS_ORIGINS=https://shareittoo.com \
  -e PUBLIC_BASE_URL=https://shareittoo.com/api/v1 \
  -e APP_PUBLIC_URL=https://shareittoo.com \
  -e PUBLIC_COMPLIANCE_APPROVED=false \
  -e BOOKING_PILOT_MODE=off \
  -e MAIL_TRANSPORT=memory \
  -e PUSH_TRANSPORT=disabled \
  -e PAYMENT_TRANSPORT=disabled \
  -e STRIPE_LIVEMODE=false \
  -e FIREBASE_AUTH_ENABLED=false \
  "$task_image" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$task_api" wget -q -O - \
      http://127.0.0.1:8080/health/ready >"$task_tmp_dir/ready.json" 2>/dev/null; then
    break
  fi
  sleep 1
done
if [[ ! -s "$task_tmp_dir/ready.json" ]] ||
    ! grep -q '"status":"ok"' "$task_tmp_dir/ready.json"; then
  echo "Ephemeral production-mode API did not become ready." >&2
  exit 1
fi

task_fetch() {
  local task_path="$1"
  docker exec "$task_api" node -e '
    const response = await fetch(`http://127.0.0.1:8080${process.argv[1]}`);
    console.log(response.status);
    console.log(await response.text());
  ' "$task_path"
}

task_assert_route() {
  local task_path="$1"
  local task_status="$2"
  local task_page="$3"
  local task_compliance="$4"
  local task_result
  task_result="$(task_fetch "$task_path")"
  if [[ "$(sed -n '1p' <<<"$task_result")" != "$task_status" ]]; then
    echo "Unexpected HTTP status for $task_path." >&2
    exit 1
  fi
  if ! grep -q "data-sit-public-page=\"$task_page\"" <<<"$task_result" ||
      ! grep -q "data-sit-compliance-status=\"$task_compliance\"" <<<"$task_result"; then
    echo "Missing public-page marker for $task_path." >&2
    exit 1
  fi
}

task_version_result="$(task_fetch /version)"
if [[ "$(sed -n '1p' <<<"$task_version_result")" != 200 ]] ||
    ! grep -q "\"commit\":\"$task_commit\"" <<<"$task_version_result" ||
    ! grep -q '"environment":"production"' <<<"$task_version_result"; then
  echo "Production-mode version identity does not match the requested commit." >&2
  exit 1
fi
task_assert_route /v1/public/support 503 support draft
task_assert_route /v1/public/privacy 503 privacy draft
task_assert_route /v1/account-deletion 200 account-deletion operational

task_migration_count="$(docker exec "$task_database" psql -U sit_preflight -d sit_preflight -Atc \
  'select count(*) from schema_migrations;')"
if [[ ! "$task_migration_count" =~ ^[1-9][0-9]*$ ]]; then
  echo "No schema migrations were applied to the ephemeral database." >&2
  exit 1
fi

printf '{"status":"passed-production-mode-isolated","commit":"%s","imageId":"%s","version":"%s","schemaMigrations":%s,"routes":{"support":"503-draft","privacy":"503-draft","accountDeletion":"200-operational"},"productionChanged":false,"stagingChanged":false}\n' \
  "$task_commit" "$task_image_id" "$task_image_version" "$task_migration_count"
