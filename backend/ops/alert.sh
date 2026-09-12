#!/usr/bin/env bash
set -euo pipefail

task_service="${1:-unknown-service}"
task_env_file="${ALERT_ENV_FILE:-/docker/shareittoo/backend/.env}"
task_state_dir="${ALERT_STATE_DIR:-/var/lib/shareittoo-alerts}"
task_cooldown_seconds="${ALERT_COOLDOWN_SECONDS:-3600}"

if [[ ! "$task_service" =~ ^[A-Za-z0-9_.@:-]{1,160}$ ]]; then
  echo "Invalid alert service name" >&2
  exit 2
fi
if [[ ! "$task_cooldown_seconds" =~ ^[0-9]+$ ]]; then
  echo "ALERT_COOLDOWN_SECONDS must be a non-negative integer" >&2
  exit 2
fi

task_env_value() {
  local task_key="$1"
  local task_line=''
  local task_value=''
  task_line=$(awk -v key="$task_key" 'index($0, key "=") == 1 { print; exit }' "$task_env_file" 2>/dev/null || true)
  task_value="${task_line#*=}"
  if [[ "$task_value" == \"*\" && "$task_value" == *\" ]]; then
    task_value="${task_value:1:${#task_value}-2}"
  elif [[ "$task_value" == \'*\' && "$task_value" == *\' ]]; then
    task_value="${task_value:1:${#task_value}-2}"
  fi
  printf '%s' "$task_value"
}

task_container_env_value() {
  local task_key="$1"
  local task_container="${ALERT_CONTAINER_NAME:-shareittoo-api}"
  local task_line=''
  local task_value=''
  task_line=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$task_container" 2>/dev/null \
    | awk -v key="$task_key" 'index($0, key "=") == 1 { print; exit }' || true)
  task_value="${task_line#*=}"
  printf '%s' "$task_value"
}

task_alert_value() {
  local task_key="$1"
  local task_value=''
  task_value=$(task_env_value "$task_key")
  if [[ -z "$task_value" ]]; then
    task_value=$(task_container_env_value "$task_key")
  fi
  printf '%s' "$task_value"
}

task_config_escape() {
  local task_value="$1"
  task_value="${task_value//\\/\\\\}"
  task_value="${task_value//\"/\\\"}"
  printf '%s' "$task_value"
}

install -d -m 0700 "$task_state_dir"
task_state_file="$task_state_dir/${task_service//[^A-Za-z0-9_.-]/_}.last"
task_now=$(date +%s)
task_last=0
if [[ -f "$task_state_file" ]]; then
  read -r task_last <"$task_state_file" || task_last=0
fi
if [[ "$task_last" =~ ^[0-9]+$ ]] && (( task_now - task_last < task_cooldown_seconds )); then
  echo "ShareItToo alert suppressed by cooldown for $task_service"
  exit 0
fi

task_mail_transport=$(task_alert_value MAIL_TRANSPORT)
task_smtp_host=$(task_alert_value SMTP_HOST)
task_smtp_port=$(task_alert_value SMTP_PORT)
task_smtp_secure=$(task_alert_value SMTP_SECURE)
task_smtp_require_tls=$(task_alert_value SMTP_REQUIRE_TLS)
task_smtp_user=$(task_alert_value SMTP_USER)
task_smtp_password=$(task_alert_value SMTP_PASSWORD)
task_mail_from=$(task_alert_value MAIL_FROM)
task_alert_to=$(task_alert_value ALERT_EMAIL_TO)

task_smtp_port="${task_smtp_port:-587}"
task_mail_from="${task_mail_from:-ShareItToo <contact@shareittoo.com>}"
task_alert_to="${task_alert_to:-contact@shareittoo.com}"
task_envelope_from='contact@shareittoo.com'
if [[ "$task_mail_from" =~ \<([^\>]+)\> ]]; then
  task_envelope_from="${BASH_REMATCH[1]}"
elif [[ "$task_mail_from" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]]; then
  task_envelope_from="$task_mail_from"
fi

task_missing_settings=()
if [[ "$task_mail_transport" != smtp ]]; then
  task_missing_settings+=(MAIL_TRANSPORT)
fi
if [[ -z "$task_smtp_host" ]]; then
  task_missing_settings+=(SMTP_HOST)
fi
if [[ -n "$task_smtp_user" && -z "$task_smtp_password" ]]; then
  task_missing_settings+=(SMTP_PASSWORD)
elif [[ -z "$task_smtp_user" && -n "$task_smtp_password" ]]; then
  task_missing_settings+=(SMTP_USER)
fi
if [[ "${#task_missing_settings[@]}" -gt 0 ]]; then
  printf 'SMTP alert delivery is not configured: %s\n' "${task_missing_settings[*]}" >&2
  exit 1
fi

task_tmp_dir=$(mktemp -d)
trap 'rm -rf "$task_tmp_dir"' EXIT
chmod 0700 "$task_tmp_dir"
task_message_file="$task_tmp_dir/message.eml"
task_curl_config="$task_tmp_dir/curl.conf"
task_timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
task_hostname=$(hostname -f 2>/dev/null || hostname)

printf 'From: %s\r\nTo: %s\r\nSubject: ShareItToo critical service alert\r\nDate: %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nA critical ShareItToo service check failed.\r\n\r\nService: %s\r\nHost: %s\r\nTime (UTC): %s\r\n\r\nInspect with: systemctl status %s\r\n' \
  "$task_mail_from" "$task_alert_to" "$(date -R)" "$task_service" "$task_hostname" "$task_timestamp" "$task_service" \
  >"$task_message_file"
chmod 0600 "$task_message_file"

task_scheme=smtp
if [[ "$task_smtp_secure" == true ]]; then
  task_scheme=smtps
fi
{
  printf 'url = "%s://%s:%s"\n' "$task_scheme" \
    "$(task_config_escape "$task_smtp_host")" "$(task_config_escape "$task_smtp_port")"
  if [[ -n "$task_smtp_user" ]]; then
    printf 'user = "%s:%s"\n' \
      "$(task_config_escape "$task_smtp_user")" "$(task_config_escape "$task_smtp_password")"
  fi
  printf 'mail-from = "%s"\n' "$(task_config_escape "$task_envelope_from")"
  printf 'mail-rcpt = "%s"\n' "$(task_config_escape "$task_alert_to")"
  printf 'upload-file = "%s"\n' "$(task_config_escape "$task_message_file")"
  printf 'fail\nsilent\nshow-error\nmax-time = 30\n'
  if [[ "$task_smtp_secure" == true || "$task_smtp_require_tls" != false ]]; then
    printf 'ssl-reqd\n'
  fi
} >"$task_curl_config"
chmod 0600 "$task_curl_config"

curl --config "$task_curl_config"
printf '%s\n' "$task_now" >"$task_state_file"
chmod 0600 "$task_state_file"
echo "ShareItToo alert delivered for $task_service"
