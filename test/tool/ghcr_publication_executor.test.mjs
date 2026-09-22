import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, rm, stat, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';

const repositoryRoot = join(new URL('../..', import.meta.url).pathname);
const backendRoot = join(repositoryRoot, 'backend');
const workflow = await readFile(join(repositoryRoot, '.github/workflows/regression.yml'), 'utf8');
const publishJob = workflow.slice(workflow.indexOf('  publish-api-image:\n'));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
const wrongCommit = 'fedcba9876543210fedcba9876543210fedcba98';
const digest = `sha256:${'b'.repeat(64)}`;
const image = 'ghcr.io/shareittoo/shareittoo-api';

function extractRunBlocks(job) {
  const lines = job.split('\n');
  const blocks = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== '        run: |') continue;
    const body = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const line = lines[cursor];
      if (line.startsWith('          ')) {
        body.push(line.slice(10));
        cursor += 1;
        continue;
      }
      if (line === '') {
        body.push('');
        cursor += 1;
        continue;
      }
      break;
    }
    blocks.push(body.join('\n'));
    index = cursor - 1;
  }
  return blocks;
}

const [verifyBlock, publishBlock] = extractRunBlocks(publishJob);
assert.ok(verifyBlock?.includes('expected_publish_commit'), 'exact-commit run block was not extracted');
assert.ok(publishBlock?.includes('docker buildx build'), 'publication run block was not extracted');
const artifactRelativePath = publishJob.match(/\n\s+path: \$\{\{ runner\.temp \}\}\/([^\n]+)/u)?.[1];
assert.equal(artifactRelativePath, 'shareittoo-api-publication-manifest.json');

const fakeDockerSource = String.raw`#!/usr/bin/env bash
set -euo pipefail

log_file="$FAKE_DOCKER_LOG"
printf '%q ' "$@" >> "$log_file"
printf '\n' >> "$log_file"
fail() {
  echo "fake docker rejected: $*" >&2
  exit 97
}

[[ $# -gt 0 ]] || fail 'missing command'

if [[ "$1" == login ]]; then
  [[ $# == 5 && "$2" == ghcr.io && "$3" == --username && "$4" == "$GITHUB_ACTOR" && "$5" == --password-stdin ]] || fail 'login arguments'
  cat >/dev/null
  [[ "$FAKE_DOCKER_MODE" != login-fail ]] || exit 23
  exit 0
fi

if [[ "$1" == buildx && "$2" == build ]]; then
  shift 2
  metadata_file=''
  image_ref=''
  saw_push=0
  saw_context=0
  saw_commit=0
  while (( $# > 0 )); do
    case "$1" in
      --push)
        saw_push=1
        shift
        ;;
      --metadata-file)
        [[ $# -ge 2 ]] || fail 'metadata-file arity'
        metadata_file="$2"
        shift 2
        ;;
      --build-arg)
        [[ $# -ge 2 ]] || fail 'build-arg arity'
        case "$2" in
          APP_VERSION=*|APP_BUILD_TIME=*|APP_SOURCE_URL=*) ;;
          APP_COMMIT=*)
            [[ "$2" == "APP_COMMIT=$GITHUB_SHA" ]] || fail 'commit build arg'
            saw_commit=1
            ;;
          *) fail 'unknown build arg' ;;
        esac
        shift 2
        ;;
      --tag)
        [[ $# -ge 2 ]] || fail 'tag arity'
        image_ref="$2"
        shift 2
        ;;
      .)
        saw_context=1
        shift
        ;;
      *) fail "unknown build argument: $1" ;;
    esac
  done
  [[ $saw_push == 1 && $saw_context == 1 && $saw_commit == 1 ]] || fail 'build contract'
  [[ "$image_ref" == "$FAKE_EXPECTED_IMAGE_REF" ]] || fail 'tag contract'
  [[ -n "$metadata_file" ]] || fail 'metadata path missing'
  [[ "$FAKE_DOCKER_MODE" != build-fail ]] || exit 23
  case "$FAKE_DOCKER_MODE" in
    metadata-missing) exit 0 ;;
    metadata-malformed) printf '%s\n' '{"containerimage.digest":"sha256:bad"}' >"$metadata_file" ;;
    *) printf '%s\n' "{\"containerimage.digest\":\"$FAKE_DIGEST\"}" >"$metadata_file" ;;
  esac
  exit 0
fi

if [[ "$1" == buildx && "$2" == imagetools ]]; then
  [[ $# == 5 && "$3" == inspect && "$4" == --raw && "$5" == "$FAKE_EXPECTED_IMAGE_DIGEST_REF" ]] || fail 'manifest readback arguments'
  [[ "$FAKE_DOCKER_MODE" != manifest-fail ]] || exit 23
  [[ "$FAKE_DOCKER_MODE" != manifest-missing ]] || exit 0
  printf '%s\n' '{"mediaType":"application/vnd.oci.image.manifest.v1+json","config":{"digest":"sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"}}'
  exit 0
fi

if [[ "$1" == pull ]]; then
  [[ $# == 2 && "$2" == "$FAKE_EXPECTED_IMAGE_DIGEST_REF" ]] || fail 'pull arguments'
  [[ "$FAKE_DOCKER_MODE" != pull-fail ]] || exit 23
  exit 0
fi

if [[ "$1" == image && "$2" == inspect ]]; then
  [[ $# == 5 && "$3" == "$FAKE_EXPECTED_IMAGE_DIGEST_REF" && "$4" == --format && "$5" == "{{ index .Config.Labels \"org.opencontainers.image.revision\" }}" ]] || fail 'image inspect arguments'
  case "$FAKE_DOCKER_MODE" in
    oci-missing) printf '\n' ;;
    oci-wrong) printf '%s\n' "$FAKE_WRONG_COMMIT" ;;
    *) printf '%s\n' "$GITHUB_SHA" ;;
  esac
  exit 0
fi

fail "unknown command: $*"
`;

function runBlock(script, cwd, env) {
  return spawnSync('bash', ['-c', script], {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
}

async function createFixture(mode = 'success') {
  const root = await mkdtemp(join(tmpdir(), 'sit-ghcr-publication-'));
  const bin = join(root, 'bin');
  await mkdir(bin);
  const dockerPath = join(bin, 'docker');
  await writeFile(dockerPath, fakeDockerSource, 'utf8');
  await chmod(dockerPath, 0o700);
  const logPath = join(root, 'docker.log');
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    FAKE_DOCKER_LOG: logPath,
    FAKE_DOCKER_MODE: mode,
    FAKE_DIGEST: digest,
    FAKE_WRONG_COMMIT: wrongCommit,
    FAKE_EXPECTED_IMAGE_REF: `${image}:${commit}`,
    FAKE_EXPECTED_IMAGE_DIGEST_REF: `${image}@${digest}`,
    GHCR_TOKEN: 'fixture-token-never-published',
    GITHUB_ACTOR: 'fixture-actor',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_SHA: commit,
    EXPECTED_PUBLISH_COMMIT: commit,
    GITHUB_REPOSITORY_OWNER: 'ShareItToo',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_WORKFLOW: 'regression',
    GITHUB_RUN_ID: '123456',
    GITHUB_RUN_ATTEMPT: '2',
    RUNNER_TEMP: root,
  };
  return { root, logPath, env };
}

async function readDockerLog(fixture) {
  try {
    return await readFile(fixture.logPath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

async function artifactUploadAttempt(fixture) {
  const artifactPath = join(fixture.root, artifactRelativePath);
  try {
    const details = await stat(artifactPath);
    assert.equal(details.isFile(), true);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  await writeFile(join(fixture.root, 'artifact-upload.log'), `${artifactPath}\n`, 'utf8');
  return true;
}

async function executeFixture(fixture, expectedCommit = commit) {
  fixture.env.EXPECTED_PUBLISH_COMMIT = expectedCommit;
  const verification = runBlock(verifyBlock, repositoryRoot, fixture.env);
  if (verification.status !== 0) return { verification, publication: null };
  const publication = runBlock(publishBlock, backendRoot, fixture.env);
  return { verification, publication };
}

test('executor runs the production blocks and the fake docker rejects unknown commands or args', async () => {
  const fixture = await createFixture();
  try {
    const unknownCommand = spawnSync(join(fixture.root, 'bin/docker'), ['version'], {
      env: fixture.env,
      encoding: 'utf8',
    });
    assert.notEqual(unknownCommand.status, 0);
    const unknownArgument = spawnSync(join(fixture.root, 'bin/docker'), ['buildx', 'build', '--unknown'], {
      env: fixture.env,
      encoding: 'utf8',
    });
    assert.notEqual(unknownArgument.status, 0);

    const result = await executeFixture(fixture);
    assert.equal(result.verification.status, 0, result.verification.stderr);
    assert.equal(result.publication.status, 0, result.publication.stderr);
    const manifest = JSON.parse(await readFile(join(fixture.root, artifactRelativePath), 'utf8'));
    assert.deepEqual(manifest, {
      schemaVersion: 1,
      commit,
      tag: `${image}:${commit}`,
      digest,
      workflow: 'regression',
      runId: '123456',
      runAttempt: '2',
      repository: 'owner/repo',
      eventName: 'workflow_dispatch',
    });
    assert.equal(JSON.stringify(manifest).includes('fixture-token'), false);
    assert.equal(JSON.stringify(manifest).includes('secret'), false);
    const dockerLog = await readDockerLog(fixture);
    assert.equal(dockerLog.includes(`--tag ${image}:${commit} `), true);
    assert.match(dockerLog, /ghcr\.io\/shareittoo\/shareittoo-api@sha256:b{64}/u);
    assert.equal(await artifactUploadAttempt(fixture), true);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('invalid, missing, and wrong expected commits stop before docker login/build', async () => {
  for (const expectedCommit of ['', '0123456789abcdef0123456789abcdef0123456', wrongCommit]) {
    const fixture = await createFixture();
    try {
      const result = await executeFixture(fixture, expectedCommit);
      assert.notEqual(result.verification.status, 0);
      assert.equal(result.publication, null);
      assert.equal(await readDockerLog(fixture), '');
      assert.equal(await artifactUploadAttempt(fixture), false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }
});

for (const mode of ['build-fail', 'metadata-missing', 'metadata-malformed', 'manifest-fail', 'manifest-missing', 'pull-fail', 'oci-wrong', 'oci-missing']) {
  test(`${mode} prevents a success manifest and artifact upload`, async () => {
    const fixture = await createFixture(mode);
    try {
      const result = await executeFixture(fixture);
      assert.equal(result.verification.status, 0, result.verification.stderr);
      assert.notEqual(result.publication.status, 0);
      await assert.rejects(stat(join(fixture.root, artifactRelativePath)), { code: 'ENOENT' });
      assert.equal(await artifactUploadAttempt(fixture), false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
}

test('a missing artifact upload input is rejected even after a successful publication block', async () => {
  const fixture = await createFixture();
  try {
    const result = await executeFixture(fixture);
    assert.equal(result.verification.status, 0, result.verification.stderr);
    assert.equal(result.publication.status, 0, result.publication.stderr);
    await unlink(join(fixture.root, artifactRelativePath));
    assert.equal(await artifactUploadAttempt(fixture), false);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('static workflow contract keeps publication manual-only and excludes mutable latest', () => {
  assert.match(publishJob, /github\.event_name == 'workflow_dispatch' && inputs\.publish_api_image/u);
  assert.doesNotMatch(publishJob, /github\.event_name == 'push'|github\.event_name == 'pull_request'/u);
  assert.doesNotMatch(publishJob, /:latest/u);
});

test('artifact upload wiring is exact, fail-closed, immutable, and commit-named', () => {
  assert.match(publishJob, /uses: actions\/upload-artifact@v4/u);
  assert.match(publishJob, /name: shareittoo-api-publication-\$\{\{ github\.sha \}\}/u);
  assert.match(publishJob, /path: \$\{\{ runner\.temp \}\}\/shareittoo-api-publication-manifest\.json/u);
  assert.match(publishJob, /if-no-files-found: error/u);
  assert.match(publishJob, /overwrite: false/u);
});
