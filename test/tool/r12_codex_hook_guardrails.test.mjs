import assert from 'node:assert/strict';
import { cp, lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const script = join(root, '.codex', 'hooks', 'sit_guardrail.py');
const configPath = join(root, '.codex', 'hooks.json');

function run(mode, payload) {
  return spawnSync('/usr/bin/python3', [script, mode], {
    input: `${JSON.stringify(payload)}\n`,
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
}

async function repository(t, { branch = 'codex/r12-test', staged = true, content = 'safe\n' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'sit-r12-hook-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const initialized = spawnSync('git', ['init', '-q', '-b', branch, directory], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  if (staged) {
    await writeFile(join(directory, 'fixture.txt'), content);
    const added = spawnSync('git', ['-C', directory, 'add', 'fixture.txt'], { encoding: 'utf8' });
    assert.equal(added.status, 0, added.stderr);
  }
  return directory;
}

function preTool(cwd, command) {
  return run('pre-tool', { cwd, tool_name: 'Bash', tool_input: { command } });
}

function denial(result) {
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  return parsed.hookSpecificOutput.permissionDecisionReason;
}

test('R12 blocks probable command secrets without echoing them and allows placeholders', () => {
  const secret = 'R'.repeat(32);
  const blocked = preTool(root, `PASSWORD=${secret} node tool/check.mjs`);
  assert.match(denial(blocked), /Probable password/u);
  assert.doesNotMatch(blocked.stdout, new RegExp(secret, 'u'));

  const jsonSecret = 'S'.repeat(32);
  const jsonBlocked = preTool(root, `node tool/check.mjs '{"client_secret":"${jsonSecret}"}'`);
  assert.match(denial(jsonBlocked), /Probable password/u);
  assert.doesNotMatch(jsonBlocked.stdout, new RegExp(jsonSecret, 'u'));

  const placeholder = preTool(root, 'password=${EXAMPLE_PASSWORD} node --version');
  assert.equal(placeholder.status, 0, placeholder.stderr);
  assert.equal(placeholder.stdout, '');
});

test('R12 blocks destructive history and protected-branch mutations', () => {
  for (const command of [
    'git rebase origin/main',
    'git merge --squash feature/r12',
    'git branch -d feature/r12',
    'git push origin main',
  ]) {
    assert.match(denial(preTool(root, command)), /Destructive Git command blocked/u);
  }
});

test('R12 blocks a local commit while currently on protected main', async (t) => {
  const directory = await repository(t, { branch: 'main' });
  assert.match(denial(preTool(directory, 'git commit -m fixture')), /protected-branch/u);
});

test('R12 blocks known live, payment, KYC, Store, release and remote mutation paths', () => {
  const commands = [
    'stripe payment_intents create --amount 100',
    'onfido applicants create',
    'bundle exec fastlane release',
    'gh release create v1.0.0',
    'firebase deploy --only functions',
    'ssh production-host deploy',
  ];
  for (const command of commands) denial(preTool(root, command));
});

test('R12 allows representative read-only and non-live commands', () => {
  for (const command of [
    'git status --short',
    'stripe --version',
    'rg Firebase docs',
    "rg 'git rebase' docs",
    "grep 'firebase deploy' docs/operations/example.md",
    'node --test test/tool/r12_codex_hook_guardrails.test.mjs',
  ]) {
    const result = preTool(root, command);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  }
});

test('R12 blocks staged password material and signing containers without disclosure', async (t) => {
  const secret = 'W'.repeat(28);
  const passwordRepo = await repository(t, { content: `client_secret=${secret}\n` });
  const passwordResult = preTool(passwordRepo, 'git commit -m fixture');
  assert.match(denial(passwordResult), /High-confidence secret pattern/u);
  assert.doesNotMatch(passwordResult.stdout, new RegExp(secret, 'u'));

  const signingRepo = await repository(t, { staged: false });
  await writeFile(join(signingRepo, 'release.keystore'), Buffer.from([1, 2, 3, 4]));
  const added = spawnSync('git', ['-C', signingRepo, 'add', 'release.keystore'], { encoding: 'utf8' });
  assert.equal(added.status, 0, added.stderr);
  assert.match(denial(preTool(signingRepo, 'git commit -m signing')), /release\.keystore/u);
});

test('R12 fails closed when pre-commit context cannot be verified', () => {
  const missing = join(tmpdir(), `sit-r12-missing-${process.pid}`);
  assert.match(denial(preTool(missing, 'git commit -m fixture')), /could not resolve/u);
});

test('R12 blocks package GREEN on dirty or unknown package state', async (t) => {
  const dirty = await repository(t);
  const dirtyResult = run('stop', {
    cwd: dirty,
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: 'SIT_PACKAGE_GREEN: R12_HOOKS_CODEX_AUTONOMY_GUARDRAILS',
  });
  assert.equal(JSON.parse(dirtyResult.stdout).decision, 'block');
  assert.match(dirtyResult.stdout, /working tree is not clean/u);

  const clean = await repository(t, { staged: false });
  const unknownResult = run('stop', {
    cwd: clean,
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: 'SIT_PACKAGE_GREEN: UNKNOWN_PACKAGE',
  });
  assert.equal(JSON.parse(unknownResult.stdout).decision, 'block');
  assert.match(unknownResult.stdout, /no exact focused-test policy/u);
});

test('R12 records the exact sanitized pending-gate document idempotently', async (t) => {
  const directory = await repository(t);
  const payload = {
    cwd: directory,
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: 'SIT_PENDING_GATE: PAYMENT_PROVIDER_OWNER_DECISION',
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = run('stop', payload);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), {});
  }
  const content = await readFile(
    join(directory, 'docs', 'SIT_PENDING_GATE_PAYMENT_PROVIDER_OWNER_DECISION.md'),
    'utf8',
  );
  assert.match(content, /State: `PENDING`/u);
  assert.match(content, /Contains personal data: `false`/u);
  assert.doesNotMatch(content, /last_assistant_message|@|Bearer|password/iu);
});

test('R12 fails closed rather than following a conflicting pending-gate symlink', async (t) => {
  const directory = await repository(t);
  const docs = join(directory, 'docs');
  await mkdir(docs);
  const outside = join(directory, 'outside.txt');
  await writeFile(outside, 'unchanged\n');
  await symlink(outside, join(docs, 'SIT_PENDING_GATE_PAYMENT_PROVIDER_OWNER_DECISION.md'));
  const result = run('stop', {
    cwd: directory,
    hook_event_name: 'Stop',
    stop_hook_active: false,
    last_assistant_message: 'SIT_PENDING_GATE: PAYMENT_PROVIDER_OWNER_DECISION',
  });
  assert.equal(JSON.parse(result.stdout).decision, 'block');
  assert.match(result.stdout, /could not be recorded safely/u);
  assert.equal(await readFile(outside, 'utf8'), 'unchanged\n');
});

test('R12 hook package is fully removable without a runtime dependency', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'sit-r12-rollback-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const localCodex = join(directory, '.codex');
  await mkdir(join(localCodex, 'hooks'), { recursive: true });
  await cp(configPath, join(localCodex, 'hooks.json'));
  await cp(script, join(localCodex, 'hooks', 'sit_guardrail.py'));
  await rm(localCodex, { recursive: true });
  await assert.rejects(lstat(localCodex), /ENOENT/u);
});

test('R12 rejects malformed hook input without leaking it', () => {
  const result = spawnSync('/usr/bin/python3', [script, 'pre-tool'], {
    input: '{invalid-json\n',
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
