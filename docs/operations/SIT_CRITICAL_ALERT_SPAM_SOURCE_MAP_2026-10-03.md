# Critical service alert repetition — source map

Date: 2026-10-03. ShareItToo, repository root `.`, branch
`codex/master-workflow-20260808`, inspected HEAD
`177a0628fd349bf2f4f6a1d26501c3c6236c3c50`.
**Source-map PASS; live disk incident verified by Sol.** The original source
inspection was read-only; the execution/readback supplement below records Sol's
separate authorized work. This documentation update made no SSH request,
environment/secret read, mail send, restart or live mutation.

## Current live diagnosis — Sol readback

The recurring failure was a real disk incident, not a proved five-minute mail
cooldown defect. Installed `alert.sh` bytes matched the repository fingerprint
below; installed healthcheck bytes were older/different, so current repository
healthcheck clauses must not be attributed wholesale to that installation.
The cooldown and timestamp marker were valid. Observed delivery was roughly
hourly; frequent health failures/checks were not equivalent to frequent emails.

Sol removed exactly the ten documented prep/input directories plus only the
verified `5d3b4261` Staging build after fresh guards. The filesystem readback
was **89% → 84%**: total **100,476,656 KiB**, used
**88,435,628 → 84,257,056 KiB**, available **12,024,644 → 16,203,216 KiB**.
Protected releases, current/previous inputs, evidence, backups and Green
seals/images remained. See the exact allowlist and recovery record in
[the disk source map](SIT_DISK_RETENTION_SOURCE_MAP_2026-10-03.md).

**Incident closure PASS:** the subsequent natural timer invocation finished at
`2026-10-03 01:30:15 UTC` (`InactiveEnterTimestamp`), `Result=success`,
`ExecMainStatus=0`, safe journal `ShareItToo health check passed`; the service
deactivated/finished successfully. Immediate following `df`: total
100,476,656 KiB, used 84,257,308 KiB, available 16,202,964 KiB, **84%**.
No forced healthcheck, alert send, cooldown change, threshold change or
source/install repair was used. This closes the observed disk incident, not a
guarantee against future failures. The hypotheses below remain source-level
alternatives for a future different incident, not this verified event.

## Exact trigger chain

| Stage | Confirmed repository fact | What this does not prove |
| --- | --- | --- |
| Timer | `backend/ops/systemd/shareittoo-health.timer:5–9`: boot delay 2m, active interval 5m, randomized delay 30s, Persistent=true, target health service. | Installed timer/drop-ins, actual firing times and reboot history are unknown. Five-minute checks are not a five-minute mail policy. |
| Health failure | `backend/ops/healthcheck.sh:6–66`: production website/API, conditional mail/version checks, three fixed container names, API/PG health, disk at 85%, daily backup within 1,800m and optional restore proof within 12,000m; any failure exits 1 with safe reason tags. | Sol verified a disk incident and natural recovery; installed health bytes differ, so the entire current source check set is not an installed-byte claim. |
| Failure handler | Health unit `:6`, backup unit `:5`, restore-check unit `:5` use `OnFailure=shareittoo-alert@%n.service`. Alert template `:8` passes `%i` to script. | No evidence that currently installed units match these bytes. |
| Instance/key | For health, the intended alert instance is `shareittoo-alert@shareittoo-health.service.service`; script argument is `shareittoo-health.service`. `backend/ops/alert.sh:4,60–69` maps it to `shareittoo-health.service.last` in the configured state directory. | An identically titled email is not proof of this same service, host, process or state path. |
| Cooldown | Alert script `:6–15,60–69`: process setting `ALERT_COOLDOWN_SECONDS`, default 3600; numeric zero is accepted. Timestamp file is read; missing/unreadable/invalid data does not provide a usable cooldown. Current epoch minus saved epoch below threshold suppresses with exit 0. | No global mail cap, cross-host coordination or incident-level deduplication exists. |
| Mail then state | Alert script `:109–146`: temporary protected mail/config, curl SMTP call, **then** timestamp write/chmod. Subject is always `ShareItToo critical service alert`; body names service, host and time, not individual health reasons. | Delivery, durable state and SMTP acknowledgement are not atomic. A curl failure does not prove the recipient received nothing. |

The normal same-host/same-service/same-state path with a readable valid marker,
3600-second setting and ordinary clock progression cannot deliver every five
minutes: the second run exits at the cooldown check before SMTP configuration
or curl. A changed failure tag within health does not change its service key.
The timestamp is sampled before SMTP, so the interval is measured from attempt
start, not final delivery (curl max-time is 30s); this is not a minutes-scale
explanation by itself.

## State, sandbox and restart boundaries

FACT: `backend/ops/systemd/shareittoo-alert@.service:9–16` specifies root/root,
NoNewPrivileges, PrivateTmp, ProtectHome, ProtectSystem=strict and managed
`StateDirectory=shareittoo-alerts`, mode 0700. The script's default directory
corresponds to that name; it does not consume the systemd `STATE_DIRECTORY`
variable. A process-level `ALERT_STATE_DIR` override can diverge from that managed
location. The unit has no EnvironmentFile or explicit ALERT_* overrides.
The script reads its environment file/container **only for SMTP settings**
(`alert.sh:18–50,72–80`), not for its cooldown/state-dir configuration. Editing
a same-named cooldown entry in that file is not proof of an effective override.

INFERENCE: the configured managed state is intended to survive individual
oneshot exits/restarts. PrivateTmp concerns the temporary mail/config directory,
not the default marker. An API/container redeploy alone does not delete this
host-owned marker: neither Compose file owns that directory, nor do the reviewed
Green/deploy sources reference this alert state. A changed host, replaced local
state, temporary override, installer cleanup or different installed script can
change that outcome; each is LIVE UNKNOWN, not a proven redeploy behavior.

Important distinction: failure of `install -d` at `alert.sh:60` occurs **before**
SMTP and cannot explain delivered emails from that invocation. A state-file
write failure at `:144`, or process interruption after `:143` but before `:144`,
can leave an already sent mail without a marker. A chmod-only failure after a
successful numeric write need not reset cooldown. Do not blame systemd sandboxing
merely because ProtectSystem=strict appears; verify effective managed-directory,
permissions and actual failure phase. Do not weaken the sandbox as a shortcut.

## Ranked explanations to distinguish, not asserted live diagnoses

| Candidate | Source-supported mechanism | Smallest decisive live evidence |
| --- | --- | --- |
| Different service/host | Health, backup and restore have independent keys; each host normally has its own filesystem. Backup timer is daily 02:15 UTC + ≤20m random delay; restore is Sunday 03:30 UTC + ≤20m. All use the same subject. | Existing email service/host/time tuple, privately inspected; matching unit invocations per host. Do not copy full mail/recipient data into source. |
| Missing/invalid/nonpersistent marker | Missing/failed read yields zero; nonnumeric marker does not suppress. A marker without a terminating newline also makes the current `read ... || task_last=0` lose that timestamp. A custom temporary path or deletion can repeat this. | Marker regular-file/type/mode/owner/size, numeric+newline validity, age/mtime and stable path across consecutive natural timer runs. |
| Send succeeded, persistence failed | No preflight for successful file replacement; curl precedes marker write, no atomic write or lock. | Safe journal phase classification plus marker absence/staleness immediately after a natural delivered invocation. |
| SMTP uncertain outcome | Remote acceptance followed by local timeout/error can leave curl nonzero and no timestamp under `set -e`. | Sanitized exit code/time correlation; this is not proof of failed delivery. No test email to diagnose it. |
| Parallel/direct invocation | No lock protects read-check-send-write. Two processes can observe the same old marker and both send. Same systemd instance may serialize normally; script itself does not protect manual/other-launcher overlap. | Existing invocation timeline/instance identity and count; no deliberately concurrent live sends. |
| Effective cooldown or clock drift | A process override of 0/short duration is allowed; sufficiently large forward epoch changes can expire the marker early. Backward movement normally over-suppresses instead. | Effective nonsecret configuration provenance remains OPEN under this no-env-read package; timestamps and clock-sync status can be read separately. Never dump process/unit/container environments. |
| Old/different installation | Repo source is not installed source; duplicate hosts/checkers or stale unit/drop-ins can bypass this contract. | Script/unit file hashes and safe unit metadata against exact source; compare target identity privately. |

Key normalization replaces `@`/`:` with underscore (`alert.sh:61`); distinct raw
keys may collide. That tends to suppress unrelated alerts, not explain repeated
same-key mail. Do not introduce a global cooldown or change key semantics without
a migration/operational decision: that can hide separate real failures.

## Health false positives and real degradation

- `healthcheck.sh:6–29,33–43` is explicitly production-shaped: production URLs,
  production version expectation and `shareittoo-web/api/postgres`. Using it on
  a staging-only/Green host can fail for missing production names or wrong
  release environment while staging is healthy. It must not be made green by
  silently pointing a production monitor at Staging.
- Exact compact-JSON grep for database/mail and version fields is format-sensitive
  (`:13,18,27–28`). Semantically identical spaced JSON may falsely fail; malformed
  bodies with matching text can falsely pass. Exact unquoted environment-file
  grep can differ from effective container configuration; it can also omit
  mandatory checks. No secret file is read in this map to decide which applies.
- API health and process liveness are different. `backend/src/app.js:2621–2650`
  can return HTTP 200 with degraded dependencies; `:2653–2686` separates live
  from ready/503. Production Compose `backend/compose.prod.yml:128–132` uses
  ready for container health. Staging Compose `:147–154` deliberately uses live
  and separate deployment-readiness validation. Support, mail or payment
  degradation is not automatically a false positive or a process crash.
- `backend/ops/green_staging_promotion.mjs:895–910,1649–1651` has distinct exact
  staging runtime/readiness contracts. Do not weaken them to quiet production
  alerts. Disk/backup/restore failures may be genuine; do not delete files,
  increase thresholds, manufacture fresh proofs or restart a healthy API.
- The September production recreate incident was real database downtime, per
  `docs/operations/SIT_PRODUCTION_RECREATE_GUARD_2026-09-10.md:10–23,46–55`.
  Its recovery and disk figures are historical, not current cause evidence.

## Original read-only diagnostic command set — retained reference

The live supplement above supersedes this section's original unknown cause.
It does not assert that every optional command below was executed; do not rerun
the set merely because it remains documented.

Precondition: independently bind the intended **ShareItToo production** host and
existing alert email's service/host/time tuple. Repeat only on other already
identified SIT senders if needed. No host is selected from an old runbook.
Resolve local `sit_backend_dir` and `sit_alert_state_dir` privately from the
verified installed layout/managed state; do not obtain them by sourcing an env
file. Their absolute local values must not enter tracked docs. Abort if the
state directory is a symlink or the installed script/unit differs unexpectedly.
Keep outputs private; report only safe classifications/hashes/timestamps.

```sh
date -u +%Y-%m-%dT%H:%M:%SZ
systemctl list-timers --all --no-pager 'shareittoo-*'
systemctl show shareittoo-health.service shareittoo-backup.service shareittoo-restore-check.service 'shareittoo-alert@shareittoo-health.service.service' --property=Id,ActiveState,SubState,Result,ExecMainCode,ExecMainStatus,User,Group,PrivateTmp,ProtectHome,ProtectSystem,StateDirectory,StateDirectoryMode,ReadWritePaths,FragmentPath,DropInPaths --no-pager
systemctl show shareittoo-health.timer --property=Id,ActiveState,TimersMonotonic,RandomizedDelayUSec,Persistent,LastTriggerUSec,NextElapseUSecMonotonic --no-pager
(cd "$sit_backend_dir" && sha256sum ops/healthcheck.sh ops/alert.sh)
docker container ls --all --format '{{.Names}}' | LC_ALL=C grep -E '^shareittoo(-staging)?-(web|api|postgres)$'
docker inspect --format '{{.Name}} {{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' shareittoo-web shareittoo-api shareittoo-postgres
```

No `systemctl cat`, `show Environment`, unfiltered inspect/logs, `.env`, process
environment, credentials, SMTP config, private payloads or `docker compose config`.
Safe unit-file hashes may be taken separately only from the exact FragmentPath/
DropInPaths returned above; do not print their contents. Effective environment
overrides cannot be proven with this restricted set and remain OPEN.

Read only the known health marker without echoing arbitrary file content:

```sh
python3 - "$sit_alert_state_dir" <<'PY'
import os, stat, sys, time
d = sys.argv[1]
s = os.lstat(d)
if not stat.S_ISDIR(s.st_mode): raise SystemExit('state_directory_not_regular')
print('directory', oct(stat.S_IMODE(s.st_mode)), s.st_uid, s.st_gid)
p = os.path.join(d, 'shareittoo-health.service.last')
try:
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
except FileNotFoundError:
    raise SystemExit('marker_missing')
with os.fdopen(fd, 'rb') as f:
    s = os.fstat(f.fileno())
    if not stat.S_ISREG(s.st_mode): raise SystemExit('marker_not_regular')
    b = f.read(64)
valid = 2 <= len(b) <= 32 and b.endswith(b'\n') and b[:-1].isdigit()
print('marker', 'valid' if valid else 'invalid', oct(stat.S_IMODE(s.st_mode)), s.st_uid, s.st_gid, 'mtime', int(s.st_mtime))
if valid: print('age_seconds', int(time.time()) - int(b[:-1]))
PY
```

Journal output must be restricted to fixed classifications (not SMTP diagnostics):

```sh
journalctl --since '-2 hours' --no-pager -o json -u shareittoo-health.service -u 'shareittoo-alert@shareittoo-health.service.service' | python3 -c '
import sys,json,re
allowed={"website","api","database","mail","release","release-identity","disk","backup","restore-check","container:shareittoo-web","container:shareittoo-api","container:shareittoo-postgres","health:shareittoo-api","health:shareittoo-postgres"}
for line in sys.stdin:
    r=json.loads(line); m=r.get("MESSAGE", "")
    if not isinstance(m,str): continue
    label=None
    if m.startswith("ShareItToo health check failed: "):
        tags=m.removeprefix("ShareItToo health check failed: ").split()
        if tags and all(t in allowed for t in tags): label="health_failed:"+",".join(tags)
    elif m=="ShareItToo health check passed": label="health_passed"
    elif m.startswith("ShareItToo alert delivered for "): label="alert_delivered"
    elif m.startswith("ShareItToo alert suppressed by cooldown for "): label="alert_suppressed"
    elif "Permission denied" in m or "Read-only file system" in m: label="state_or_access_error_unlocalized"
    elif m.startswith("curl: ("): label="transport_error_unlocalized"
    if label: print(r.get("__REALTIME_TIMESTAMP","unknown"),label)
'
```

Then, only if needed, one no-credential HTTP status probe per production URL:

```sh
for sit_url in https://shareittoo.com/ https://shareittoo.com/api/health https://shareittoo.com/api/health/live https://shareittoo.com/api/health/ready; do
  curl --silent --show-error --max-time 15 --output /dev/null --write-out '%{http_code}\n' "$sit_url"
done
df -P /
```

No full body, token, redirect-following, SMTP send, alert/health script invocation,
unit start/reset/reload or state write. Existing natural timer events may be
observed twice; do not force failures. Backup/restore freshness inspection, if
their tags appear, is a separate scoped metadata-only read against privately
resolved exact directories, not backup/restore execution. If a needed tool or
permission is absent, record the gap rather than installing or elevating here.

## Smallest safe fix and required regression

The current event closed with natural-health readback after verified disk
remediation, without an alert-source change. For a new incident, first use readback
to choose **one** cause. If different services/hosts explain
the messages, the per-service contract may be working: no suppression change is
justified. If a real health failure is recurring, repair that exact incident
under its own authorization; never mute it as a cooldown fix. If installed
bytes/managed state differ, the smallest package may be restoration of the
reviewed installation, with separate live authorization and readback.

If source-level same-key state/race failure is reproduced, propose only a
bounded `alert.sh` + `ops_alert.test.js` successor: preflight owned writable
state before SMTP, hold an exclusive per-key lock through check/send/state
commit, atomically replace a validated timestamp on confirmed transport success,
and emit sanitized explicit state/unknown-delivery failures. Preserve SMTP TLS,
secret-free argv, current sandbox and default 3600 seconds. Lock/atomic write
does **not** solve remote-acceptance/local-ack loss or the send→persist crash
window; a durable attempt/unknown-delivery suppression policy needs a separate
explicit operational decision. Do not mark mail delivered before sending or
quietly trade critical-alert loss for duplicate prevention.

Existing inventory: `backend/test/ops_alert.test.js:21–110` has one isolated fake
curl/docker test covering successful sequential cooldown and authenticated/relay
SMTP secret handling. It does not exercise concurrency, invalid/unreadable state,
post-send failure, uncertain transport, restart persistence or a real systemd
sandbox. `backend/package.json:12` includes it through Node test discovery.
No dedicated healthcheck-script/systemd test was found in the directed search.
Related tests: `staging_deployment_readiness.test.js:108–117`,
`release_endpoints.test.js:44–51`, and `green_staging_promotion.test.js:1361–1362`.

Before any proposed fix, require red-first isolated tests for: same key twice
and two concurrent processes; distinct service keys; default/explicit cooldown
at before/exact boundary; valid/absent/malformed/no-newline/unreadable marker;
state-dir creation/write failure before sending; failure after fake transport;
transport error/timeout with unknown delivery; atomic replacement/interruption;
new process/restart preserving state; no secret in argv/logs; owned temp cleanup.
If health parsing changes, add fake curl, docker, df and find fixtures for every tag,
spaced/malformed JSON, production-vs-staging names and readiness-vs-liveness.
If a unit changes, include unit shape and isolated production-shaped systemd
permission/StateDirectory proof; never weaken the sandbox to pass.

Focused command from `backend` for an alert-only successor:
`node --import ./test_setup.js --test test/ops_alert.test.js`, plus
`bash -n ops/alert.sh ops/healthcheck.sh`, relevant unit verification and
diff/path/secret scan. Add only the relevant readiness/Green tests if those
contracts change. Do not repeat unrelated green full gates or modify runners.
Later live closure requires matching deployed script/unit bytes, durable marker
readback and a subsequent natural timer cycle showing suppression or healthy
service; local mocks alone cannot close the incident.

Source fingerprint anchor: alert script SHA-256
`ee82f02d2909c78728305a95179061e84fed4ce366e7a844272ea8d6fc055ccc`;
health script `0c8ecd8429ccfdae7236b83143c99b31b558e56a005998ca748e328dcba81e2b`;
alert unit `9da2b0793424d73c551bbc5c82e61aeae7b6fce7e0face424ecb6217ffe9c28c`.
Historical runbook mail acceptance is not current live proof. Current cause,
cooldown behavior and disk remediation are established only by Sol's live
supplement above, including its natural-health pass. Exact mail counts and
future health are not inferred from these source fingerprints.
