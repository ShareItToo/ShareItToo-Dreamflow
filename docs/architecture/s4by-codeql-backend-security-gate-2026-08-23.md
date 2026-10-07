# S4BY CodeQL backend security gate

Status: technically verified, non-live at exact implementation head
`992af57cbf555534c6db03898b3a4aac61cbd996`.

## Closed technical gap

The public GitHub repository had dependency and secret checks but no CodeQL
analysis. A successful `pnpm audit --prod` and an empty secret-scanning alert
list do not replace semantic analysis of application data flows. S4BY adds an
advanced CodeQL workflow for the repository JavaScript/TypeScript sources,
including the production-bearing Backend and its supporting tooling.

The workflow uses the currently supported `github/codeql-action` v4 and the
`security-extended` query suite. It runs for pull requests, direct pushes to
`main`, a weekly Monday 04:17 UTC schedule and explicit manual dispatch. Feature
branches with an open PR are analyzed once through the pull-request event; the
first observed duplicate push/PR execution was removed before the final head.

## Least privilege and fail-closed behavior

Workflow-level permission is `contents: read`. The analysis job receives only
`actions: read`, `contents: read`, `packages: read` and
`security-events: write`, has a 20-minute timeout and contains no secret,
artifact publication, deployment or continuation-on-error path. A CodeQL
failure therefore fails its check instead of being ignored.

`test/tool/codeql_workflow_wiring.test.mjs` permanently requires the four
entry points, v4 actions, JavaScript/TypeScript plus extended queries, bounded
runtime, minimal permissions and absence of publish/deploy/secret behavior.
The complete local regression runs this contract on every package gate.

The scan does not claim native Dart, Kotlin, Swift or third-party service
approval coverage. Those retain their existing analyzer, compiler, dependency,
platform and external gates. Any future CodeQL alert is a security input to
triage, not permission to dismiss or activate a release.

## Verification

Three direct wiring tests and YAML syntax validation pass. The local production
Backend dependency audit reports zero low, moderate, high or critical
vulnerabilities. The complete local technical gate passes in the authorized
metadata-only Store handoff mode: analyzer zero, 385 Flutter tests plus one
documented Google-only skip, Google-only compilation, Web/WebAssembly,
loopback smoke, Android 448 tasks, binary minSdk 24 and zero generated growth.

The ordinary local Store handoff correctly stops because the protected exact
AAB is unavailable in the private release archive. S4BY does not create a
replacement and does not claim a Store upload, signing or device pass.

Exact CodeQL run `32626620094` passes in 1:50, evaluates 103 rules and leaves
zero open code-scanning alerts. Exact clean-host regression `32626620177`
passes PostgreSQL in 27 seconds, Backend in 1:27 and Flutter/Web/Android in
6:37. Signing, explicit parallel stress and API-image publication remain
skipped.

No repository visibility, production, provider, Cloud/VPS/DNS, Payment, Store,
pilot, real-money, activation or merge state changed. PR #7 remains draft and
P0B remains `HOLD` / `NO-GO`.
