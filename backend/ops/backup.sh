#!/usr/bin/env bash
set -euo pipefail

exec 9>/run/lock/shareittoo-backup.lock
flock -n 9 || exit 0

backup_dir=/docker/shareittoo/backups/daily
install -d -m 700 "$backup_dir"

task_timestamp=$(date -u +%Y%m%dT%H%M%SZ)
task_db_final="$backup_dir/shareittoo-db-$task_timestamp.dump"
task_uploads_final="$backup_dir/shareittoo-uploads-$task_timestamp.tar.gz"
task_manifest_final="$backup_dir/shareittoo-$task_timestamp.sha256"
task_db_tmp=$(mktemp "$backup_dir/.shareittoo-db.XXXXXX")
task_uploads_tmp=$(mktemp "$backup_dir/.shareittoo-uploads.XXXXXX")
task_manifest_tmp=$(mktemp "$backup_dir/.shareittoo-manifest.XXXXXX")

cleanup() {
  rm -f "$task_db_tmp" "$task_uploads_tmp" "$task_manifest_tmp"
}
trap cleanup EXIT

docker exec shareittoo-postgres \
  pg_dump -U shareittoo -d shareittoo --format=custom --no-owner --no-acl \
  > "$task_db_tmp"
docker exec -i shareittoo-postgres pg_restore -l < "$task_db_tmp" >/dev/null

docker exec shareittoo-api tar -czf - -C /data/uploads . > "$task_uploads_tmp"
tar -tzf "$task_uploads_tmp" >/dev/null

chmod 600 "$task_db_tmp" "$task_uploads_tmp"
mv "$task_db_tmp" "$task_db_final"
mv "$task_uploads_tmp" "$task_uploads_final"
(
  cd "$backup_dir"
  sha256sum "$(basename "$task_db_final")" "$(basename "$task_uploads_final")"
) > "$task_manifest_tmp"
chmod 600 "$task_manifest_tmp"
mv "$task_manifest_tmp" "$task_manifest_final"

find /docker/shareittoo/backups/daily -type f \
  \( -name 'shareittoo-db-*.dump' -o -name 'shareittoo-uploads-*.tar.gz' -o -name 'shareittoo-*.sha256' \) \
  -mtime +14 -delete

trap - EXIT
echo "ShareItToo backup completed: $task_timestamp"
