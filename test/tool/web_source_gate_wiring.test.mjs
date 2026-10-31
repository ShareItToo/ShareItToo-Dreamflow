import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const regression = readFileSync(new URL('../../scripts/technical_regression_check.sh', import.meta.url), 'utf8');
const guidance = readFileSync(new URL('../../AGENTS.md', import.meta.url), 'utf8');
const guard = regression.slice(regression.indexOf('case "${SIT_WEB_SOURCE_GATE:-0}"'),
  regression.indexOf('source scripts/release_host_capacity_guard.sh'));
const branches = [...regression.matchAll(/^if \[\[.*\n[\s\S]*?^fi$/gmu)].map(([block]) => block);
const baseEnv = { ...process.env, CI: 'false', SIT_ALLOW_CANDIDATE_ROLLOVER: '0', SIT_WEB_SOURCE_GATE: '0' };
const runBranch = (block, env) => spawnSync('bash', ['-c',
  `node() { printf '%s\\n' "node $*"; }; dart() { printf '%s\\n' "dart $*"; };\n${guard}\n${block}`],
{ cwd: root, env: { ...baseEnv, ...env }, encoding: 'utf8' });
const cli = (args, env = {}) => spawnSync(process.execPath,
  ['tool/validate_google_play_internal_handoff.mjs', ...args],
  { cwd: root, env: { ...baseEnv, ...env }, encoding: 'utf8' });

test('source gate rejects invalid or conflicting modes before any probe/build', () => {
  for (const env of [
    { SIT_WEB_SOURCE_GATE: 'invalid' },
    { SIT_WEB_SOURCE_GATE: '1', CI: 'true' },
    { SIT_WEB_SOURCE_GATE: '1', CI: '1' },
    { SIT_WEB_SOURCE_GATE: '1', SIT_ALLOW_CANDIDATE_ROLLOVER: '1' },
  ]) {
    const result = spawnSync('bash', ['scripts/technical_regression_check.sh'],
      { cwd: root, env: { ...baseEnv, ...env }, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Web source mode cannot combine|SIT_WEB_SOURCE_GATE must be/u);
    assert.equal(result.stdout, '');
  }
  assert.ok(regression.indexOf('case "${SIT_WEB_SOURCE_GATE:-0}"')
    < regression.indexOf('release_host_capacity_begin'));
});

test('all eight metadata branches use the retained-metadata validation only in explicit source/rollover mode', () => {
  const metadata = branches.filter((block) => block.includes('"${SIT_ALLOW_CANDIDATE_ROLLOVER:-0}" == "1" ||'));
  assert.equal(metadata.length, 8);
  for (const block of metadata) {
    const normal = runBranch(block, {});
    const source = runBranch(block, { SIT_WEB_SOURCE_GATE: '1' });
    const rollover = runBranch(block, { SIT_ALLOW_CANDIDATE_ROLLOVER: '1' });
    assert.equal(normal.status, 0); assert.equal(source.status, 0); assert.equal(rollover.status, 0);
    assert.doesNotMatch(normal.stdout, /--allow-(?:android-)?candidate-rollover/u);
    assert.match(source.stdout, /--allow-(?:android-)?candidate-rollover/u);
    assert.equal(source.stdout.split('\n').slice(1).join('\n'), rollover.stdout);
  }
});

test('Play branch preserves strict default, CI and rollover commands; Web uses distinct historical mode', () => {
  const branch = branches.find((block) => block.includes(' --web-source-only'));
  assert.ok(branch);
  for (const [env, suffix] of [
    [{}, ''],
    [{ CI: 'true', SIT_ALLOW_CANDIDATE_ROLLOVER: '1' }, ' --ci-metadata-only'],
    [{ SIT_ALLOW_CANDIDATE_ROLLOVER: '1' }, ' --candidate-rollover'],
    [{ SIT_WEB_SOURCE_GATE: '1' }, ' --web-source-only'],
  ]) {
    const result = runBranch(branch, env);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim().split('\n').at(-1),
      `node tool/validate_google_play_internal_handoff.mjs${suffix}`);
  }
  assert.match(regression, /node --test test\/tool\/\*\.test\.mjs/u);
  assert.match(regression, /flutter test/u);
  assert.match(regression, /flutter build web/u);
  assert.match(regression, /:app:assembleDebug/u);
  assert.match(regression, /release_host_capacity_end\nif[\s\S]*Web source gate: PASS .*not release proof; currentCandidateReady=false/u);
  assert.match(guidance, /SIT_WEB_SOURCE_GATE=1[\s\S]*never Play or release evidence[\s\S]*currentCandidateReady=false[\s\S]*unchanged strict gate/u);
});

test('Web CLI requires explicit opt-in and rejects CI/rollover combinations', () => {
  for (const [args, env] of [
    [['--web-source-only'], {}],
    [['--web-source-only'], { SIT_WEB_SOURCE_GATE: '2' }],
    [['--web-source-only'], { SIT_WEB_SOURCE_GATE: '1', CI: 'true' }],
    [['--web-source-only'], { SIT_WEB_SOURCE_GATE: '1', SIT_ALLOW_CANDIDATE_ROLLOVER: '1' }],
    [['--web-source-only', '--candidate-rollover'], { SIT_WEB_SOURCE_GATE: '1' }],
    [['--web-source-only', '--ci-metadata-only'], { SIT_WEB_SOURCE_GATE: '1' }],
    [['--web-source-only', '--unknown'], { SIT_WEB_SOURCE_GATE: '1' }],
  ]) {
    const result = cli(args, env);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /requires SIT_WEB_SOURCE_GATE=1|cannot combine|Unknown/u);
  }
});

test('real Web CLI validates retained records but cannot claim current Play or archive readiness', () => {
  const result = cli(['--web-source-only'], { SIT_WEB_SOURCE_GATE: '1' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Google Play historical metadata: PASS/u);
  assert.match(result.stdout, /playArtifact=stale; not release proof/u);
  assert.match(result.stdout, /currentCandidateReady=false; privateArtifactVerified=false; livePlayReadback=false/u);
  assert.doesNotMatch(result.stdout, /currentCandidateVerified|current-rollover-verified|currentCandidateReady=true/u);
});
