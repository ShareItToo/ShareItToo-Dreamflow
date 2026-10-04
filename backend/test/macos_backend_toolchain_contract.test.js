import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const bootstrapPath = path.join(
  repositoryRoot,
  'scripts/bootstrap_macos_backend_toolchain.sh',
);

async function executable(target, source) {
  await writeFile(target, source);
  await chmod(target, 0o755);
}

async function fakeToolchain(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sit-toolchain-test-'));
  const controlBin = path.join(root, 'control-bin');
  const brewPrefix = path.join(root, 'brew-prefix');
  const nodePrefix = path.join(root, 'node-prefix');
  const nodeBin = path.join(nodePrefix, 'bin');
  const log = path.join(root, 'commands.log');
  await mkdir(controlBin);
  await mkdir(brewPrefix);
  await mkdir(nodeBin, { recursive: true });
  await writeFile(log, '');
  await executable(path.join(controlBin, 'uname'), '#!/bin/sh\necho Darwin\n');
  await executable(path.join(controlBin, 'brew'), `#!/bin/sh
set -eu
printf 'brew %s\\n' "$*" >> "$SIT_FAKE_TOOLCHAIN_LOG"
case "$*" in
  'list --versions node@22') exit 1 ;;
  'install node@22'|'link --overwrite --force node@22') exit 0 ;;
  '--prefix node@22') printf '%s\\n' "$SIT_FAKE_NODE_PREFIX" ;;
  '--prefix') printf '%s\\n' "$SIT_FAKE_BREW_PREFIX" ;;
  *) exit 64 ;;
esac
`);
  await executable(path.join(nodeBin, 'node'), '#!/bin/sh\necho v22.23.2\n');
  await executable(path.join(nodeBin, 'pnpm'), '#!/bin/sh\necho 11.16.0\n');
  await executable(path.join(nodeBin, 'corepack'), `#!/bin/sh
set -eu
printf 'corepack %s\\n' "$*" >> "$SIT_FAKE_TOOLCHAIN_LOG"
`);
  t.after(() => rm(root, { recursive: true, force: true }));
  return {
    environment: {
      ...process.env,
      PATH: `${controlBin}:${nodeBin}:/usr/bin:/bin`,
      SIT_FAKE_BREW_PREFIX: brewPrefix,
      SIT_FAKE_NODE_PREFIX: nodePrefix,
      SIT_FAKE_TOOLCHAIN_LOG: log,
    },
    log,
  };
}

test('repository, package and CI agree on Node 22 and pnpm 11.16.0', async () => {
  const [nodeVersion, packageJson, workflow, bootstrap] = await Promise.all([
    readFile(path.join(repositoryRoot, '.node-version'), 'utf8'),
    readFile(path.join(repositoryRoot, 'backend/package.json'), 'utf8'),
    readFile(path.join(repositoryRoot, '.github/workflows/regression.yml'), 'utf8'),
    readFile(bootstrapPath, 'utf8'),
  ]);
  assert.equal(nodeVersion.trim(), '22');
  assert.match(packageJson, /"packageManager": "pnpm@11\.16\.0"/u);
  assert.match(workflow, /node-version: '22'/u);
  assert.match(bootstrap, /node_formula='node@22'/u);
  assert.match(bootstrap, /pnpm_version='11\.16\.0'/u);
});

test('bootstrap installs the pinned major and activates exact pnpm through Corepack', async (t) => {
  const fixture = await fakeToolchain(t);
  const result = await execFileAsync('/bin/bash', [bootstrapPath], {
    cwd: repositoryRoot,
    env: fixture.environment,
  });
  assert.match(result.stdout, /PASS \(node=v22\.23\.2, pnpm=11\.16\.0, mode=install\)/u);
  const log = await readFile(fixture.log, 'utf8');
  assert.match(log, /brew install node@22/u);
  assert.match(log, /brew link --overwrite --force node@22/u);
  assert.match(log, /corepack install --global pnpm@11\.16\.0/u);
  assert.match(log, /corepack enable pnpm/u);
});

test('check mode verifies the normal shell without mutating Homebrew or Corepack', async (t) => {
  const fixture = await fakeToolchain(t);
  const result = await execFileAsync('/bin/bash', [bootstrapPath, '--check'], {
    cwd: repositoryRoot,
    env: fixture.environment,
  });
  assert.match(result.stdout, /mode=check/u);
  const log = await readFile(fixture.log, 'utf8');
  assert.doesNotMatch(log, /brew (?:install|link)/u);
  assert.doesNotMatch(log, /corepack/u);
});
