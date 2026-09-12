#!/usr/bin/env bash
set -euo pipefail

task_ops_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
task_database_container="${DATABASE_CONTAINER:-shareittoo-postgres}"
task_database_user="${DATABASE_USER:-shareittoo}"
task_database_name="${DATABASE_NAME:-shareittoo}"

if [[ ! "$task_database_container" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  echo "DATABASE_CONTAINER is invalid." >&2
  exit 1
fi
if [[ ! "$task_database_user" =~ ^[a-zA-Z_][a-zA-Z0-9_.-]*$ ]]; then
  echo "DATABASE_USER is invalid." >&2
  exit 1
fi
if [[ ! "$task_database_name" =~ ^[a-zA-Z_][a-zA-Z0-9_.-]*$ ]]; then
  echo "DATABASE_NAME is invalid." >&2
  exit 1
fi

docker exec -i "$task_database_container" \
  psql -X --set ON_ERROR_STOP=1 \
    -U "$task_database_user" -d "$task_database_name" \
  < "$task_ops_root/check_foreign_key_integrity.sql"

printf 'ShareItToo foreign-key integrity verified: %s/%s\n' \
  "$task_database_container" "$task_database_name"
