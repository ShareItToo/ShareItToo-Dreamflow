#!/usr/bin/env bash
set -euo pipefail

task_backend_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_repository_root="$(cd "$task_backend_root/.." && pwd)"
cd "$task_repository_root"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing release build from a dirty worktree." >&2
  exit 1
fi

task_commit="$(git rev-parse --verify HEAD)"
if [[ ! "$task_commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Could not resolve a full Git commit." >&2
  exit 1
fi

task_version="${APP_VERSION:-0.1.0-${task_commit:0:12}}"
task_build_time="${APP_BUILD_TIME:-$(git show -s --format=%cI "$task_commit")}"
task_image_repository="${IMAGE_REPOSITORY:-shareittoo-api}"
task_image="$task_image_repository:$task_commit"

if [[ ! "$task_version" =~ ^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$ ]]; then
  echo "APP_VERSION contains unsupported characters." >&2
  exit 1
fi
if [[ ! "$task_build_time" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$ ]]; then
  echo "APP_BUILD_TIME must be a valid timestamp." >&2
  exit 1
fi

docker build \
  --build-arg "APP_VERSION=$task_version" \
  --build-arg "APP_COMMIT=$task_commit" \
  --build-arg "APP_BUILD_TIME=$task_build_time" \
  --tag "$task_image" \
  "$task_backend_root"

task_label_commit="$(docker image inspect "$task_image" --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}')"
task_label_version="$(docker image inspect "$task_image" --format '{{ index .Config.Labels "org.opencontainers.image.version" }}')"
if [[ "$task_label_commit" != "$task_commit" || "$task_label_version" != "$task_version" ]]; then
  echo "Release image labels do not match the requested build identity." >&2
  exit 1
fi

printf 'Built %s\nVersion: %s\nCommit: %s\nBuild time: %s\n' \
  "$task_image" "$task_version" "$task_commit" "$task_build_time"
