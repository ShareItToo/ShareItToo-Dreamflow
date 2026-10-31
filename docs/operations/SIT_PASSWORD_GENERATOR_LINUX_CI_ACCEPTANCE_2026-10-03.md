# Password generator — exact Ubuntu CI acceptance/readback

Source audit HEAD: `ea5156aaa45f68b1ba5039cfe61714bc5c85385b`.
Result: **PASS for existing CI discovery binding; Linux execution pending.**
No workflow/test implementation change is necessary. No push, dispatch, rerun,
container pull or external mutation was performed for this audit.

## Why the existing successful job necessarily exercises Python

`.github/workflows/regression.yml` defines `flutter-regression` on
`ubuntu-latest`; its unconditional **Run regression script** step invokes
`bash scripts/technical_regression_check.sh`. That script uses `set -euo pipefail`
and its complete tool gate runs `node --test test/tool/*.test.mjs`.
The committed `staging_password_invitation_generator.test.mjs` matches that glob.

The adapter spawns `python3 -B` with the exact Python test file, requires no spawn
error, exit 0, stderr containing `Ran 16 tests`, and empty stdout. All 16 test
methods are present and none is skipped/expected-failure. Therefore a successful,
non-skipped adapter proves Python was available and the suite executed; missing
Python fails, it does not silently skip. This is a success-condition guarantee,
not a prediction that an upstream setup failure cannot stop the job first.

The workflow does **not** explicitly set up or print a Python version in this
job; it relies on the runner's Python. Do not claim a particular interpreter
version from source or substitute runner inventory for executable readback.
The adapter captures successful Python stderr rather than printing all 16 names;
its exact code/hash and successful log entry provide the aggregate binding.

Executed locally: 11 source/discovery assertions passed. They verified Ubuntu
job binding, exact invocation, fail-fast script, adapter discovery, required
Python subprocess/exit/count and 16 non-skipped methods. This was not a Linux run.

## Trigger and exact-source caveats

- Automatic `push` is limited to `main`; docs-only changes are ignored.
- `pull_request` runs also ignore docs-only changes. A feature-branch push
  without an applicable PR does not itself guarantee a run.
- `workflow_dispatch` exists, but dispatch/rerun is a separate authorized action.
  Keep build/publication/stress inputs false unless independently requested.
- Concurrency cancels obsolete runs. Do not accept a cancelled or superseded run.
- This job uses the default checkout: for a PR it can test the synthetic merge
  commit, not the PR head. Record the actual checkout SHA and compare exact
  source blobs to the intended head. A run `headSha` alone is insufficient.

## Read-only commands after the next authorized push

Use the actual full pushed SHA and numeric run/job IDs returned by GitHub; never
substitute a prior green run or select merely the newest run on the branch.

```sh
SIT_EXPECTED_HEAD='<full pushed commit SHA>'
gh run list --repo ShareItToo/ShareItToo-Dreamflow --workflow regression.yml \
  --commit "$SIT_EXPECTED_HEAD" --limit 20 \
  --json databaseId,event,headSha,status,conclusion,url

SIT_RUN_ID='<matching numeric run ID>'
gh run view "$SIT_RUN_ID" --repo ShareItToo/ShareItToo-Dreamflow \
  --json databaseId,event,headSha,headBranch,status,conclusion,url,jobs
gh api "repos/ShareItToo/ShareItToo-Dreamflow/actions/runs/$SIT_RUN_ID" \
  --jq '{id,run_attempt,event,head_sha,path,status,conclusion,html_url}'

SIT_JOB_ID='<flutter-regression job ID from that run attempt>'
gh run view "$SIT_RUN_ID" --repo ShareItToo/ShareItToo-Dreamflow \
  --job "$SIT_JOB_ID" --log
```

Keep full logs private/local; report only sanitized relevant evidence. Locate the
checkout SHA in the checkout step and the exact adapter title:
`secure offline invitation generator: filesystem negatives and real resolver compatibility`.
Require a real passing test record, not an echoed command, discovery listing,
skip, source assertion or unrelated test summary.

Bind the checkout to the intended source using Git blob identities (read-only):

```sh
SIT_CHECKOUT_SHA='<actual checkout SHA from that job>'
for SIT_PATH in \
  .github/workflows/regression.yml \
  scripts/technical_regression_check.sh \
  test/tool/staging_password_invitation_generator.test.mjs \
  test/tool/staging_password_invitation_generator_test.py \
  tool/generate_staging_password_invitation.py \
  backend/src/staging_password_enrollment.js \
  backend/package.json; do
  SIT_LOCAL_BLOB="$(git rev-parse "$SIT_EXPECTED_HEAD:$SIT_PATH")"
  SIT_TESTED_BLOB="$(gh api "repos/ShareItToo/ShareItToo-Dreamflow/contents/$SIT_PATH?ref=$SIT_CHECKOUT_SHA" --jq .sha)"
  test "$SIT_LOCAL_BLOB" = "$SIT_TESTED_BLOB" || exit 1
done
```

Missing local commit, API error, missing checkout SHA or mismatch means **NOT
VERIFIED**, not permission to silently select different bytes. For a PR also
record its number/head SHA and the merge commit relationship.

## Acceptance capsule

Record repository; workflow path; event; run ID/attempt/URL; expected head SHA;
actual checkout SHA and exact seven-blob match; job ID/name; observed Ubuntu
image/version and architecture from setup logs; adapter PASS evidence; inferred
16/16 suite completion through the bound adapter; step/job/workflow conclusions;
and cleanup scope. Record Python/Node executable versions only if actually
present in that run's logs, otherwise `not separately logged`.

A successful adapter on verified Linux closes **functional Linux portability**:
real `renameat2(RENAME_NOREPLACE)`, 0600/0700, non-overwrite/race/cleanup negatives
and actual backend resolver compatibility exercised by those 16 tests. Require
the regression step/job successful for accepted CI closure; if the adapter
passes but later unrelated checks fail, report that narrower result separately.

This is **not** pinned-container proof: `ubuntu-latest` is a mutable hosted
runner label, the job is not network-disabled/read-only/tmpfs-isolated, and no
container image digest or isolated-container cleanup is established. Temporary
fixture cleanup is exercised, but whole-runner residue/disk erasure is not
independently attested. The earlier pinned-environment gap remains separately
documented in `SIT_PASSWORD_GENERATOR_LINUX_VERIFICATION_GAP_2026-10-03.md`.

No live invitation, runtime registry, account, mail, provider or activation
claim follows from this CI proof. Next gate is read-only exact-run verification
after an independently authorized triggering push/PR/dispatch.
