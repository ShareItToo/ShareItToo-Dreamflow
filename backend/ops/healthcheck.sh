#!/usr/bin/env bash
set -euo pipefail

task_failures=()

if ! curl --fail --silent --show-error --max-time 15 https://shareittoo.com/ >/dev/null; then
  task_failures+=("website")
fi

task_health_payload=''
if ! task_health_payload=$(curl --fail --silent --show-error --max-time 15 https://shareittoo.com/api/health); then
  task_failures+=("api")
elif ! grep -q '"database":"ok"' <<<"$task_health_payload"; then
  task_failures+=("database")
fi

if grep -q '^MAIL_TRANSPORT=smtp$' /docker/shareittoo/backend/.env; then
  if ! grep -q '"mail":"ok"' <<<"$task_health_payload"; then
    task_failures+=("mail")
  fi
fi

if grep -q '^REQUIRE_RELEASE_IDENTITY=true$' /docker/shareittoo/backend/.env; then
  task_version_payload=''
  if ! task_version_payload=$(curl --fail --silent --show-error --max-time 15 https://shareittoo.com/api/version); then
    task_failures+=("release")
  elif ! grep -Eq '"commit":"[0-9a-f]{40}"' <<<"$task_version_payload" || \
       ! grep -q '"environment":"production"' <<<"$task_version_payload"; then
    task_failures+=("release-identity")
  fi
fi

for task_container in shareittoo-web shareittoo-api shareittoo-postgres; do
  if [ "$(docker inspect --format '{{.State.Running}}' "$task_container" 2>/dev/null || true)" != true ]; then
    task_failures+=("container:$task_container")
  fi
done

if [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' shareittoo-api 2>/dev/null || true)" != healthy ]; then
  task_failures+=("health:shareittoo-api")
fi
if [ "$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' shareittoo-postgres 2>/dev/null || true)" != healthy ]; then
  task_failures+=("health:shareittoo-postgres")
fi

task_disk_percent=$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')
if [ -z "$task_disk_percent" ] || [ "$task_disk_percent" -ge 85 ]; then
  task_failures+=("disk")
fi

task_latest_backup=$(find /docker/shareittoo/backups/daily -type f -name 'shareittoo-db-*.dump' -mmin -1800 -print -quit 2>/dev/null || true)
if [ -z "$task_latest_backup" ]; then
  task_failures+=("backup")
fi

if grep -q '^REQUIRE_RECENT_RESTORE_CHECK=true$' /docker/shareittoo/backend/.env; then
  task_latest_restore=$(find /docker/shareittoo/backups/restore-checks -type f \
    -name 'restore-check-*.json' -mmin -12000 -print -quit 2>/dev/null || true)
  if [ -z "$task_latest_restore" ]; then
    task_failures+=("restore-check")
  fi
fi

if [ "${#task_failures[@]}" -gt 0 ]; then
  printf 'ShareItToo health check failed: %s\n' "${task_failures[*]}" >&2
  exit 1
fi

echo "ShareItToo health check passed"
