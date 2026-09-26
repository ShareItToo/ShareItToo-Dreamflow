# SIT production recreate guard

Status: binding fail-closed production operations guard

This runbook records incident `SIT-OPS-2026-09-10-001` and prevents the same
failure mode from being repeated. It grants no production authorization.

## Incident

On 9 September 2026 a Hostinger recreate stopped the running production
PostgreSQL container before the later image pull failed. The recreate path then
requested the nonexistent default image `shareittoo-api:local`. PostgreSQL was
recreated with its existing volume but left in `Created`, so the running API
lost the Docker DNS endpoint `postgres`. The public API Health endpoint returned
HTTP 500 and the scheduled backup failed. `shareittoo-health.service` correctly
reported the real outage.

The existing PostgreSQL container was started with the unchanged persistent
volume and pinned PostgreSQL 16 image. The missed backup was run once and its
archives were checked. Website, API, database, mail, containers, disk and backup
freshness passed three manual Health runs and the next automatic timer run.
No code, unit, image, volume, environment value or secret was changed during
recovery.

## Mandatory preflight

Before a production recreate or comparable deploy:

1. Read the target host, running containers and current image references plus
   immutable digests.
2. Bind the Compose files, environment-file path without reading secret values,
   persistent volumes, networks, dependencies and rollback image.
3. Prove the proposed image locally by immutable image ID or in the responsible
   registry by immutable digest. Defaults ending in `:local` or `:latest` are
   forbidden.
4. Record fresh passing checks for website, API, database, mail, containers,
   disk and backup freshness.
5. Put these sanitized facts in a JSON plan matching the validator contract and
   run:

   `node tool/validate_production_recreate_plan.mjs <plan.json>`

A validator pass proves only that the plan is complete. It does not replace the
separate production authorization required by repository policy.

## Abort and post-readback

After any pull, recreate or deploy error, stop. Do not retry until every
previously running dependency has been read again. After success or abort,
verify website, API, database, mail, container health, disk, backup freshness,
`shareittoo-health.service`, its timer and at least one subsequent automatic
Health run. The operation remains incomplete until that automatic run succeeds.

Never write secrets, environment contents, credentials or tokens into the plan,
Git, Drive, incident notes or chat.

## Verified recovery evidence

- Target: `srv1580960.hstgr.cloud`
- Recovery date: 10 September 2026
- Website and API: HTTP 200; API reported database and mail OK
- Production API and PostgreSQL containers: running and healthy
- Backup: database dump and upload archive passed SHA-256; the dump catalog also
  passed `pg_restore -l`
- Manual Health runs: 10:04:04, 10:04:07 and 10:04:10 UTC, exit 0
- Automatic Health timer run: 10:09:42 UTC, exit 0
- Open capacity risk: disk usage was 83 percent against an 85 percent Health
  threshold; no unrelated cleanup was performed

The live target must still be checked freshly before every future operation.
