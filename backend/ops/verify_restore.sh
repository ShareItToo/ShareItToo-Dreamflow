#!/usr/bin/env bash
set -euo pipefail

exec 9>/run/lock/shareittoo-restore-check.lock
flock -n 9 || exit 0

task_backup_dir="${BACKUP_DIR:-/docker/shareittoo/backups/daily}"
task_report_dir="${RESTORE_REPORT_DIR:-/docker/shareittoo/backups/restore-checks}"
task_postgres_image="${POSTGRES_IMAGE:-postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777}"
task_manifest="$(find "$task_backup_dir" -maxdepth 1 -type f -name 'shareittoo-*.sha256' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)"
if [[ -z "$task_manifest" ]]; then
  echo "No ShareItToo backup manifest found in $task_backup_dir." >&2
  exit 1
fi

task_timestamp="$(basename "$task_manifest" | sed -n 's/^shareittoo-\([0-9TZ]*\)\.sha256$/\1/p')"
if [[ -z "$task_timestamp" ]]; then
  echo "Backup manifest name is invalid." >&2
  exit 1
fi
task_db="$task_backup_dir/shareittoo-db-$task_timestamp.dump"
task_uploads="$task_backup_dir/shareittoo-uploads-$task_timestamp.tar.gz"
if [[ ! -f "$task_db" || ! -f "$task_uploads" ]]; then
  echo "Backup set $task_timestamp is incomplete." >&2
  exit 1
fi

(
  cd "$task_backup_dir"
  sha256sum --check "$(basename "$task_manifest")"
)
docker run --rm -i "$task_postgres_image" pg_restore -l < "$task_db" >/dev/null
tar -tzf "$task_uploads" >/dev/null

task_run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
task_container="shareittoo-restore-check-$task_run_id"
task_volume="shareittoo_restore_check_$task_run_id"
task_extract_dir="$(mktemp -d /tmp/shareittoo-uploads-restore.XXXXXX)"
task_password="$(tr -d '-' < /proc/sys/kernel/random/uuid)$(tr -d '-' < /proc/sys/kernel/random/uuid)"

cleanup() {
  docker rm -f "$task_container" >/dev/null 2>&1 || true
  docker volume rm "$task_volume" >/dev/null 2>&1 || true
  rm -rf -- "$task_extract_dir"
}
trap cleanup EXIT

docker volume create "$task_volume" >/dev/null
docker run -d --name "$task_container" \
  --mount "type=volume,src=$task_volume,dst=/var/lib/postgresql/data" \
  -e POSTGRES_DB=shareittoo_restore \
  -e POSTGRES_USER=shareittoo_restore \
  -e "POSTGRES_PASSWORD=$task_password" \
  "$task_postgres_image" >/dev/null

for _ in $(seq 1 60); do
  # The official Postgres image briefly starts an initialization server on its
  # Unix socket and then shuts it down before starting the final server.  A
  # socket-only readiness probe can therefore succeed too early.  TCP is only
  # available from the final server and is the stable restore target.
  if docker exec "$task_container" pg_isready -h 127.0.0.1 \
      -U shareittoo_restore -d shareittoo_restore >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "$task_container" pg_isready -h 127.0.0.1 \
    -U shareittoo_restore -d shareittoo_restore >/dev/null 2>&1; then
  echo "Isolated restore database did not become ready." >&2
  exit 1
fi

docker exec -i "$task_container" pg_restore \
  -U shareittoo_restore -d shareittoo_restore --no-owner --no-acl \
  < "$task_db"
task_table_count="$(docker exec "$task_container" psql -U shareittoo_restore -d shareittoo_restore -Atc \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
if [[ ! "$task_table_count" =~ ^[0-9]+$ ]] || (( task_table_count < 1 )); then
  echo "Isolated restore produced no public tables." >&2
  exit 1
fi

tar -xzf "$task_uploads" --no-same-owner --no-same-permissions -C "$task_extract_dir"
task_upload_count="$(find "$task_extract_dir" -type f | wc -l | tr -d ' ')"

install -d -m 700 "$task_report_dir"
task_report="$task_report_dir/restore-check-$task_run_id.json"
printf '{"backupTimestamp":"%s","databaseTables":%s,"uploadFiles":%s,"verifiedAt":"%s"}\n' \
  "$task_timestamp" "$task_table_count" "$task_upload_count" "$task_run_id" > "$task_report"
chmod 600 "$task_report"

trap - EXIT
cleanup
printf 'ShareItToo isolated restore verified: %s\nEvidence: %s\n' \
  "$task_timestamp" "$task_report"
