#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ "${SIT_CONFIRM_CONSOLIDATED_SOCIAL_CANDIDATE:-0}" != "1" ]]; then
  echo "ERROR: Set SIT_CONFIRM_CONSOLIDATED_SOCIAL_CANDIDATE=1 only after all intended changes are committed." >&2
  exit 1
fi

export SIT_SOCIAL_GOOGLE_ENABLED=1
export SIT_SOCIAL_APPLE_ENABLED=0
export SIT_SOCIAL_FACEBOOK_ENABLED=0
export SIT_RELEASE_CHANNEL=internal
export SIT_API_BASE_URL=https://staging.shareittoo.com/api/v1

node tool/validate_google_only_next_candidate.mjs --require-buildable
bash scripts/build_android_release_candidate.sh
