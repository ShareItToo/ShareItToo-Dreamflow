import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const script = join(root, '.codex', 'hooks', 'sit_guardrail.py');
const config = JSON.parse(await readFile(join(root, '.codex', 'hooks.json'), 'utf8'));

function run(mode, payload) {
  return spawnSync('/usr/bin/python3', [script, mode], {
    input: `${JSON.stringify(payload)}\n`,
    encoding: 'utf8',
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
}

async function repository(t, content = 'safe staged text\n') {
  const directory = await mkdtemp(join(tmpdir(), 'sit-hook-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const initialized = spawnSync('git', ['init', '-q', directory], { encoding: 'utf8' });
  assert.equal(initialized.status, 0, initialized.stderr);
  const switched = spawnSync('git', ['-C', directory, 'switch', '-q', '-c', 'codex/test-hook'], {
    encoding: 'utf8',
  });
  assert.equal(switched.status, 0, switched.stderr);
  await writeFile(join(directory, 'fixture.txt'), content);
  const added = spawnSync('git', ['-C', directory, 'add', 'fixture.txt'], { encoding: 'utf8' });
  assert.equal(added.status, 0, added.stderr);
  return directory;
}

test('N11 config uses the three officially supported repo-local hook events', () => {
  assert.deepEqual(Object.keys(config.hooks), ['SessionStart', 'PreToolUse', 'Stop']);
  assert.equal(config.hooks.PreToolUse[0].matcher, '^Bash$');
  assert.match(config.hooks.PreToolUse[0].hooks[0].command, /git rev-parse --show-toplevel/u);
});

test('N11 allows an ordinary local read-only Bash command', () => {
  const result = run('pre-tool', {
    cwd: root,
    tool_name: 'Bash',
    tool_input: { command: 'git status --short' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('N11 blocks destructive Git without and allows only the explicit token marker', () => {
  const blocked = run('pre-tool', {
    cwd: root,
    tool_name: 'Bash',
    tool_input: { command: 'git reset --hard HEAD~1' },
  });
  assert.equal(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision, 'deny');
  assert.match(blocked.stdout, /Destructive Git command blocked/u);

  const marked = run('pre-tool', {
    cwd: root,
    tool_name: 'Bash',
    tool_input: {
      command: 'SIT_DESTRUCTIVE_GIT_APPROVED=R0_DESTRUCTIVE_GIT_GO git reset --hard HEAD~1',
    },
  });
  assert.equal(marked.status, 0, marked.stderr);
  assert.equal(marked.stdout, '');
});

test('N11 blocks Firebase deployment without and allows only the external marker', () => {
  const blocked = run('pre-tool', {
    cwd: root,
    tool_name: 'Bash',
    tool_input: { command: 'firebase deploy --only hosting' },
  });
  assert.match(blocked.stdout, /Firebase deployment blocked/u);

  const marked = run('pre-tool', {
    cwd: root,
    tool_name: 'Bash',
    tool_input: {
      command: 'SIT_EXTERNAL_MUTATION_APPROVED=R0_EXTERNAL_MUTATION_GO firebase deploy --only hosting',
    },
  });
  assert.equal(marked.status, 0, marked.stderr);
  assert.equal(marked.stdout, '');
});

test('N11 blocks Draft PR merge and remote-host command paths', () => {
  for (const command of ['gh pr merge 7 --merge', 'ssh staging-host uptime']) {
    const result = run('pre-tool', {
      cwd: root,
      tool_name: 'Bash',
      tool_input: { command },
    });
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  }
});

test('N11 pre-commit scan blocks a high-confidence staged secret without echoing it', async (t) => {
  const secret = `sk-${'Q'.repeat(40)}`;
  const directory = await repository(t, `value=${secret}\n`);
  const result = run('pre-tool', {
    cwd: directory,
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m fixture' },
  });
  assert.match(result.stdout, /High-confidence secret pattern detected/u);
  assert.match(result.stdout, /fixture\.txt/u);
  assert.doesNotMatch(result.stdout, new RegExp(secret, 'u'));
});

test('N11 pre-commit check accepts a safe staged file in a minimal repository', async (t) => {
  const directory = await repository(t);
  const result = run('pre-tool', {
    cwd: directory,
    tool_name: 'Bash',
    tool_input: { command: 'git commit -m fixture' },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('N11 SessionStart returns bounded developer context', () => {
  const result = run('session-start', { cwd: root, hook_event_name: 'SessionStart' });
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(output.hookSpecificOutput.additionalContext, /never replace owner gates/u);
  assert.match(output.hookSpecificOutput.additionalContext, /SIT_PENDING_GATE/u);
});

test('N11 Stop writes only a minimized pending-gate artifact into Git metadata', async (t) => {
  const directory = await repository(t);
  const result = run('stop', {
    cwd: directory,
    hook_event_name: 'Stop',
    last_assistant_message: 'Work is safely paused.\nSIT_PENDING_GATE: GOOGLE_PLAY_INTERNAL_UPLOAD_GO',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {});
  const artifact = JSON.parse(await readFile(
    join(directory, '.git', 'codex', 'sit-pending-gate.json'),
    'utf8',
  ));
  assert.deepEqual(artifact, {
    schemaVersion: 1,
    state: 'pending',
    gate: 'GOOGLE_PLAY_INTERNAL_UPLOAD_GO',
    source: 'codex-stop-hook',
    containsPersonalData: false,
  });
});

test('N11 Stop ignores prose without a strict pending-gate marker', async (t) => {
  const directory = await repository(t);
  await mkdir(join(directory, '.git', 'codex'), { recursive: true });
  await chmod(join(directory, '.git', 'codex'), 0o700);
  const result = run('stop', {
    cwd: directory,
    hook_event_name: 'Stop',
    last_assistant_message: 'No owner gate is currently blocking work.',
  });
  assert.equal(result.status, 0, result.stderr);
  await assert.rejects(
    readFile(join(directory, '.git', 'codex', 'sit-pending-gate.json')),
    /ENOENT/u,
  );
});
