# S4BY CodeQL backend security operations

Status: technically verified; any future alert requires explicit triage.

## Local preflight

Run from the repository root:

```sh
node --test test/tool/codeql_workflow_wiring.test.mjs
ruby -e 'require "yaml"; YAML.parse_file(".github/workflows/codeql.yml")'
cd backend && pnpm audit --prod
```

The full local technical gate may use `CI=true` only for the repository's
documented metadata-only Store handoff when the protected exact AAB is not
available. That mode never proves signing, upload, Store installation or a
physical-device pass:

```sh
CI=true SIT_ALLOW_CANDIDATE_ROLLOVER=1 \
  bash scripts/technical_regression_check.sh
```

## GitHub evidence

CodeQL runs automatically on each pull request, on direct `main` pushes, each
Monday at 04:17 UTC and on manual dispatch. Check the exact run and open alerts:

```sh
gh run view 32626620094 --json headSha,status,conclusion,jobs,url
gh api \
  -H 'Accept: application/vnd.github+json' \
  'repos/walidwalidchraibi-dot/ShareItToo-Dreamflow/code-scanning/alerts?state=open&per_page=100'
```

Acceptance requires the CodeQL job to complete successfully and the alert list
to contain no untriaged high or critical item. Do not interpret a green job as
proof for unsupported languages, external providers or release readiness.

If an alert appears, preserve its rule, severity, path and data-flow evidence,
reproduce it against the exact source and fix it with a focused regression.
Do not dismiss, downgrade, suppress, add `continue-on-error` or reduce query
coverage merely to restore a green check. A proven false positive requires a
separate sanitized review record.

## Acceptance evidence

The exact implementation head is
`992af57cbf555534c6db03898b3a4aac61cbd996`. CodeQL run `32626620094` passes in
1:50 with 103 evaluated rules and zero open alerts. Clean-host regression
`32626620177` passes PostgreSQL in 27 seconds, Backend in 1:27 and
Flutter/Web/Android in 6:37.

Local metadata-only regression passes analyzer zero, 385 Flutter tests plus one
documented skip, Web/WebAssembly, loopback smoke, Android 448 tasks, binary
minSdk 24 and zero generated growth. The exact private AAB remains unavailable,
so no Store, signing or device completion is claimed. PR #7 remains draft and
P0B remains `HOLD` / `NO-GO`.
