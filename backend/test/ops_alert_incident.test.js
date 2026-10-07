import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ops = fileURLToPath(new URL('../ops/', import.meta.url));
const service = 'shareittoo-health.service';
const stateName = (key = service) => `${createHash('sha256').update(key).digest('hex')}.json`;
function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sit-alert-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  const state = path.join(root, 'state');
  const envFile = path.join(root, 'service.env');
  await fs.mkdir(bin); await fs.mkdir(state, { mode: 0o700 });
  const secret = ['synthetic', 'smtp', 'sentinel'].join('-');
  await fs.writeFile(envFile, [
    'MAIL_TRANSPORT=smtp', 'SMTP_HOST=smtp.example.com', 'SMTP_PORT=587',
    'SMTP_REQUIRE_TLS=true', 'SMTP_USER=alerts@example.com',
    `SMTP_PASSWORD=${secret}`, 'MAIL_FROM=ShareItToo <alerts@example.com>',
    'ALERT_EMAIL_TO=contact@example.com', '',
  ].join('\n'));
  await fs.writeFile(path.join(bin, 'curl'), `#!/usr/bin/env python3
import json, os, pathlib, re, sys, time
cfg = pathlib.Path(sys.argv[2]).read_text()
message = pathlib.Path(re.search(r'^upload-file = "(.*)"$', cfg, re.M)[1]).read_text()
with open(os.environ['ALERT_CAPTURE'], 'a') as capture:
    capture.write(json.dumps({'args': sys.argv[1:], 'config': cfg, 'message': message}) + '\\n')
time.sleep(float(os.environ.get('FAKE_DELAY', '0')))
if os.environ.get('FAKE_FAIL_AFTER_SEND') == 'true':
    pathlib.Path(os.environ['ALERT_STATE_DIR'], os.environ['FAKE_STATE_NAME']).unlink()
    pathlib.Path(os.environ['ALERT_STATE_DIR'], os.environ['FAKE_STATE_NAME']).mkdir()
if os.environ.get('FAKE_CURL_CODE', '0') != '0':
    print(os.environ['FAKE_SECRET'], file=sys.stderr)
sys.exit(int(os.environ.get('FAKE_CURL_CODE', '0')))
`, { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'docker'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'date'), '#!/bin/sh\nif [ "$1" = +%s ]; then printf "%s\\n" "$FAKE_NOW"; else /bin/date "$@"; fi\n', { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'systemctl'), `#!/usr/bin/env python3
import os, sys
print('Id='+sys.argv[2])
print('InvocationID='+os.environ.get('FAKE_INVOCATION_ID','a'*32))
print('Result='+os.environ.get('FAKE_SERVICE_RESULT','exit-code'))
print('ExecMainCode=1')
print('ExecMainStatus='+os.environ.get('FAKE_MAIN_STATUS','1'))
`, { mode: 0o755 });
  await fs.writeFile(path.join(bin, 'journalctl'), `#!/usr/bin/env python3
import json, os, sys
if os.environ.get('FAKE_JOURNAL_MODE') == 'missing': sys.exit(0)
if os.environ.get('FAKE_JOURNAL_MODE') == 'corrupt':
    print('not-json'); sys.exit(0)
print(json.dumps({'_SYSTEMD_UNIT':'shareittoo-health.service',
  '_SYSTEMD_INVOCATION_ID':os.environ.get('FAKE_JOURNAL_INVOCATION_ID',os.environ.get('FAKE_INVOCATION_ID','a'*32)),
  'MESSAGE':'ShareItToo health check failed: '+os.environ.get('FAKE_FAILURE_TAGS','disk')}))
`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, ALERT_ENV_FILE: envFile,
    ALERT_STATE_DIR: state, ALERT_NOTIFICATION_POLICY: 'transitions-only', ALERT_CAPTURE: path.join(root, 'capture'),
    FAKE_SECRET: secret, FAKE_STATE_NAME: stateName(), FAKE_NOW: '2000000000' };
  return { root, state, envFile, env, secret,
    call: (mode = 'failure', key = service, extra = {}) => run('bash', [path.join(ops, 'alert.sh'), key, mode], { env: { ...env, ...extra } }),
    read: async (key = service) => JSON.parse(await fs.readFile(path.join(state, stateName(key)), 'utf8')),
    messages: async () => {
      try { return (await fs.readFile(env.ALERT_CAPTURE, 'utf8')).trim().split('\n').map(JSON.parse); }
      catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    },
  };
}

test('incident opens once, stays silent indefinitely, recovers once, then opens immediately', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('recovery')).code, 0);
  assert.equal((await f.messages()).length, 0);
  assert.equal((await f.call()).code, 0);
  assert.equal((await f.read()).phase, 'open');
  await f.call('failure', service, { FAKE_NOW: '2000086399' });
  assert.equal((await f.messages()).length, 1);
  await f.call('failure', service, { FAKE_NOW: '2000086400' });
  await f.call('failure', service, { FAKE_NOW: '2031536000', FAKE_INVOCATION_ID: 'b'.repeat(32) });
  assert.equal((await f.messages()).length, 1);
  await f.call('recovery', service, { FAKE_NOW: '2000086401' });
  await f.call('recovery', service, { FAKE_NOW: '2000086402' });
  assert.equal((await f.messages()).length, 2);
  assert.equal((await f.read()).phase, 'closed');
  await f.call('failure', service, { FAKE_NOW: '2000086403' });
  const messages = await f.messages();
  assert.equal(messages.length, 3);
  assert.match(messages[1].message, /service recovered/);
  assert.equal((await f.read()).phase, 'open');
});

test('one open service incident stays silent across changed classes, status and reordered reasons', async (t) => {
  const f = await fixture(t);
  await f.call('failure', service, { FAKE_FAILURE_TAGS: 'disk api' });
  const first = (await f.read()).failure_fingerprint;
  await f.call('failure', service, { FAKE_FAILURE_TAGS: 'api disk', FAKE_INVOCATION_ID: 'b'.repeat(32) });
  assert.equal((await f.messages()).length, 1);
  assert.equal((await f.read()).failure_fingerprint, first);
  await f.call('failure', service, { FAKE_FAILURE_TAGS: 'database', FAKE_INVOCATION_ID: 'c'.repeat(32) });
  await f.call('failure', service, { FAKE_MAIN_STATUS: '2', FAKE_INVOCATION_ID: 'd'.repeat(32) });
  assert.equal((await f.messages()).length, 1);
  assert.equal((await f.read()).failure_fingerprint, first);
  await f.call('failure', 'shareittoo-backup.service');
  await f.call('failure', 'shareittoo-backup.service');
  assert.equal((await f.messages()).length, 2);
  await f.call('failure', 'shareittoo-backup.service', { FAKE_MAIN_STATUS: '2' });
  assert.equal((await f.messages()).length, 2);
});

test('one hundred alternating fingerprints emit one failure mail until recovery', async (t) => {
  const f = await fixture(t);
  const code = `import importlib.util, os, sys
spec = importlib.util.spec_from_file_location('alert', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
for index in range(100):
    os.environ['FAKE_FAILURE_TAGS'] = 'disk api' if index % 2 == 0 else 'database'
    os.environ['FAKE_MAIN_STATUS'] = '1' if index % 3 else '2'
    os.environ['FAKE_INVOCATION_ID'] = format(index % 16, 'x') * 32
    sys.argv = ['alert', '${service}', 'failure']
    assert module.main() == 0
`;
  const result = await run('python3', ['-B', '-c', code, path.join(ops, 'alert_state.py')], { env: f.env });
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await f.messages()).length, 1);
  assert.equal((await f.read()).phase, 'open');
  await f.call('recovery', service, { FAKE_NOW: '2000000100' });
  await f.call('failure', service, { FAKE_NOW: '2000000101', FAKE_FAILURE_TAGS: 'api' });
  assert.equal((await f.messages()).length, 3);
});

test('stale, unrecognized and non-failed invocation identity cannot suppress or send', async (t) => {
  const f = await fixture(t);
  await f.call();
  const original = await fs.readFile(path.join(f.state, stateName()), 'utf8');
  for (const extra of [
    { FAKE_FAILURE_TAGS: 'unrecognized-private-reason' },
    { FAKE_FAILURE_TAGS: '' }, { FAKE_FAILURE_TAGS: 'disk disk' },
    { FAKE_SERVICE_RESULT: 'success' }, { FAKE_MAIN_STATUS: 'not-an-exit-code' },
    { FAKE_JOURNAL_INVOCATION_ID: 'b'.repeat(32) },
    { FAKE_JOURNAL_MODE: 'missing' }, { FAKE_JOURNAL_MODE: 'corrupt' },
    { MONITOR_INVOCATION_ID: 'b'.repeat(32) }, { MONITOR_UNIT: 'other.service' },
  ]) {
    const result = await f.call('failure', service, extra);
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /failure identity unavailable/);
    assert.doesNotMatch(result.stdout, /suppressed|delivered/);
    assert.equal(`${result.stdout}${result.stderr}`.includes('unrecognized-private-reason'), false);
    assert.equal(await fs.readFile(path.join(f.state, stateName()), 'utf8'), original);
  }
  assert.equal((await f.messages()).length, 1);
});

test('valid v1 state stays readable and closed historical recovery never generates another mail', async (t) => {
  const f = await fixture(t);
  const historical = { version: 1, service, phase: 'closed', kind: 'recovery',
    last_attempt: 1900000000, delivery: 'delivered' };
  const bytes = `${JSON.stringify(historical, null, 2)}\n`;
  await fs.writeFile(path.join(f.state, stateName()), bytes, { mode: 0o600 });
  assert.equal((await f.call('recovery')).code, 0);
  assert.equal((await f.messages()).length, 0);
  assert.equal(await fs.readFile(path.join(f.state, stateName()), 'utf8'), bytes);
  await f.call();
  assert.equal((await f.messages()).length, 1);
  assert.equal((await f.read()).version, 2);
});

test('state or held lock replacement during classification fails explicitly before suppression', async (t) => {
  for (const replaced of ['state', 'lock']) {
    const f = await fixture(t);
    await f.call();
    const code = `import importlib.util, os, sys
spec = importlib.util.spec_from_file_location('alert', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original = module.failure_fingerprint
def raced(service):
    value = original(service)
    filename = os.path.join(os.environ['ALERT_STATE_DIR'], '${stateName().replace('.json', replaced === 'state' ? '.json' : '.lock')}')
    os.unlink(filename)
    if '${replaced}' == 'state':
        with open(filename, 'w') as target: target.write('{}\\n')
        os.chmod(filename, 0o600)
    else:
        fd = os.open(filename, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
    return value
module.failure_fingerprint = raced
sys.argv = ['alert', '${service}', 'failure']
sys.exit(module.main())`;
    const result = await run('python3', ['-B', '-c', code, path.join(ops, 'alert_state.py')], { env: f.env });
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /state unavailable/);
    assert.doesNotMatch(result.stdout, /suppressed|delivered/);
    assert.equal((await f.messages()).length, 1);
  }
});

test('real concurrent processes serialize one service, preserve restart state and distinct raw keys', async (t) => {
  const f = await fixture(t);
  const results = await Promise.all(Array.from({ length: 4 }, () => f.call('failure', service, { FAKE_DELAY: '0.15' })));
  results.forEach((result) => assert.equal(result.code, 0, result.stderr));
  assert.equal((await f.messages()).length, 1);
  await f.call();
  assert.equal((await f.messages()).length, 1);
  await f.call('failure', 'other@service');
  await f.call('failure', 'other:service');
  assert.equal((await f.messages()).length, 3);
  assert.equal((await fs.stat(f.state)).mode & 0o777, 0o700);
  for (const entry of await fs.readdir(f.state)) {
    assert.equal((await fs.stat(path.join(f.state, entry))).mode & 0o777, 0o600);
  }
});

test('malformed, unterminated, unreadable and symlink state fails before mail', async (t) => {
  for (const kind of ['malformed', 'no-newline', 'unreadable', 'symlink']) {
    await t.test(kind, async (t) => {
      const f = await fixture(t);
      await f.call();
      const filename = path.join(f.state, stateName());
      if (kind === 'malformed') await fs.writeFile(filename, '{}\n');
      if (kind === 'no-newline') await fs.writeFile(filename, JSON.stringify(await f.read()));
      if (kind === 'unreadable') await fs.chmod(filename, 0o000);
      if (kind === 'symlink') { await fs.unlink(filename); await fs.symlink(f.envFile, filename); }
      const result = await f.call('failure', service, { FAKE_NOW: '2000100000' });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /state unavailable/);
      assert.equal((await f.messages()).length, 1);
    });
  }
});

test('state safety failure prevents sending and leaves no temporary files', async (t) => {
  const f = await fixture(t);
  await fs.chmod(f.state, 0o500);
  assert.notEqual((await f.call()).code, 0);
  assert.equal((await f.messages()).length, 0);
  await fs.chmod(f.state, 0o700);
  await fs.mkdir(path.join(f.state, stateName()));
  assert.notEqual((await f.call()).code, 0);
  assert.equal((await f.messages()).length, 0);
  assert.equal((await fs.readdir(f.state)).some((name) => name.endsWith('.tmp')), false);
});

test('failed or timed-out transport is unknown and bounded, including recovery', async (t) => {
  for (const code of ['1', '28']) {
    await t.test(code, async (t) => {
      const f = await fixture(t);
      const failed = await f.call('failure', service, { FAKE_CURL_CODE: code });
      assert.notEqual(failed.code, 0);
      assert.match(failed.stderr, /delivery unknown/);
      assert.equal(failed.stderr.includes(f.secret), false);
      assert.equal((await f.read()).delivery, 'unknown');
      await f.call();
      assert.equal((await f.messages()).length, 1);
      await f.call('failure', service, { FAKE_NOW: '2000086400' });
      assert.equal((await f.messages()).length, 1);
      await f.call('recovery', service, { FAKE_CURL_CODE: code, FAKE_NOW: '2000086401' });
      assert.equal((await f.read()).phase, 'closed');
      assert.equal((await f.read()).delivery, 'unknown');
      await f.call('recovery');
      assert.equal((await f.messages()).length, 2);
      await f.call('failure', service, { FAKE_NOW: '2000086402' });
      assert.equal((await f.messages()).length, 3);
    });
  }
});

test('post-send persistence failure is explicit and never claims confirmed delivery', async (t) => {
  const f = await fixture(t);
  const result = await f.call('failure', service, { FAKE_FAIL_AFTER_SEND: 'true' });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /state unavailable.*delivery unknown/);
  assert.doesNotMatch(result.stdout, /delivered/);
  assert.equal((await f.messages()).length, 1);
  assert.equal((await fs.readdir(f.state)).some((name) => name.endsWith('.tmp')), false);
});

test('legacy open marker suppresses repeats, recovers once, then permits a new incident', async (t) => {
  const f = await fixture(t);
  const legacy = path.join(f.state, `${service}.last`);
  await fs.writeFile(legacy, '2000000000\n', { mode: 0o600 });
  await f.call();
  assert.equal((await f.messages()).length, 0);
  assert.equal((await f.read()).version, 1);
  await f.call('recovery');
  assert.equal((await f.messages()).length, 1);
  assert.equal(await fs.readFile(legacy, 'utf8'), '2000000000\n');
  await f.call();
  assert.equal((await f.messages()).length, 2);
});

test('SMTP TLS, secret-free output/argv, relay mode and temporary cleanup', async (t) => {
  const f = await fixture(t);
  const result = await f.call();
  assert.equal(result.code, 0, result.stderr);
  assert.equal(`${result.stdout}${result.stderr}`.includes(f.secret), false);
  let [message] = await f.messages();
  assert.equal(message.args.join(' ').includes(f.secret), false);
  assert.match(message.config, /ssl-reqd/);
  await assert.rejects(fs.stat(message.args[1]), { code: 'ENOENT' });
  await fs.writeFile(f.envFile, 'MAIL_TRANSPORT=smtp\nSMTP_HOST=relay.example.com\n');
  await f.call('failure', 'relay.service');
  message = (await f.messages())[1];
  assert.doesNotMatch(message.config, /^user\s*=/m);
});

test('invalid modes and unsupported notification policies fail before send', async (t) => {
  const f = await fixture(t);
  for (const mode of ['bad', '--recovery']) assert.notEqual((await f.call(mode)).code, 0);
  for (const policy of ['', 'daily', 'bad']) {
    assert.notEqual((await f.call('failure', service, { ALERT_NOTIFICATION_POLICY: policy })).code, 0);
  }
  assert.equal((await f.messages()).length, 0);
});

test('units explicitly configure transition-only alerts and retain sandbox and success-only recovery hooks', async () => {
  const unit = await fs.readFile(path.join(ops, 'systemd/shareittoo-alert@.service'), 'utf8');
  assert.match(unit, /^Environment=ALERT_NOTIFICATION_POLICY=transitions-only$/m);
  assert.match(unit, /^ExecStart=.*alert.sh %i failure$/m);
  for (const setting of ['StateDirectory=shareittoo-alerts', 'StateDirectoryMode=0700', 'ProtectSystem=strict', 'PrivateTmp=true', 'NoNewPrivileges=true']) {
    assert.ok(unit.split('\n').includes(setting));
  }
  for (const name of ['health', 'backup', 'restore-check']) {
    const source = await fs.readFile(path.join(ops, `systemd/shareittoo-${name}.service`), 'utf8');
    assert.match(source, /^OnFailure=shareittoo-alert@%n.service$/m);
    if (name === 'health') {
      assert.match(source, /^ExecStartPost=-\/docker\/shareittoo\/backend\/ops\/alert.sh %n recovery$/m);
    } else {
      assert.doesNotMatch(source, /^ExecStartPost=/m);
    }
    assert.match(source, /^Environment=ALERT_NOTIFICATION_POLICY=transitions-only$/m);
    assert.doesNotMatch(source, /^ExecStopPost=/m);
  }
});

test('backup/restore recovery requires completed work, and notification failure remains best effort', async (t) => {
  const f = await fixture(t);
  const fakeJob = path.join(f.root, 'job.sh');
  await fs.writeFile(path.join(f.root, 'alert.sh'), '#!/bin/sh\nprintf recovery >>"$RECOVERY_CAPTURE"\nexit 1\n');
  await fs.writeFile(path.join(f.root, 'bin/flock'), '#!/bin/sh\nexit "$FAKE_LOCK_CODE"\n', { mode: 0o755 });
  for (const filename of ['backup.sh', 'verify_restore.sh']) {
    const source = await fs.readFile(path.join(ops, filename), 'utf8');
    const lines = source.trimEnd().split('\n');
    const recovery = lines.at(-1);
    assert.match(recovery, /^bash .*\/alert.sh" shareittoo-(backup|restore-check)\.service recovery \|\| true$/);
    assert.equal(source.indexOf(recovery) > source.lastIndexOf('trap - EXIT'), true);
    // Execute the exact lock/early-exit and terminal hook, with isolated paths.
    const lock = lines.slice(3, 5).join('\n').replace(/\/run\/lock\/[^\s]+/, path.join(f.root, 'job.lock'));
    await fs.writeFile(fakeJob, `#!/bin/bash\nset -euo pipefail\n${lock}\n${recovery}\n`);
    const capture = path.join(f.root, `recovery-${filename}`);
    for (const lockCode of ['1', '0']) {
      const result = await run('bash', [fakeJob], { env: { ...f.env, FAKE_LOCK_CODE: lockCode, RECOVERY_CAPTURE: capture } });
      assert.equal(result.code, 0, result.stderr);
      if (lockCode === '1') await assert.rejects(fs.stat(capture), { code: 'ENOENT' });
      else assert.equal(await fs.readFile(capture, 'utf8'), 'recovery');
    }
  }
});

test('atomic write/fsync failures happen before mail and remove transient files', async (t) => {
  for (const failure of ['fsync', 'replace']) {
    await t.test(failure, async (t) => {
      const f = await fixture(t);
      const code = `import importlib.util, os, sys
spec = importlib.util.spec_from_file_location('alert', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
def fail(*args, **kwargs): raise OSError('synthetic failure')
os.${failure} = fail
sys.argv = ['alert', '${service}', 'failure']
sys.exit(module.main())`;
      const result = await run('python3', ['-B', '-c', code, path.join(ops, 'alert_state.py')], { env: f.env });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /state unavailable/);
      assert.equal((await f.messages()).length, 0);
      assert.equal((await fs.readdir(f.state)).some((name) => name.endsWith('.tmp')), false);
    });
  }
});

test('process interruption after durable reservation remains unknown without rapid retry', async (t) => {
  const f = await fixture(t);
  const code = `import importlib.util, os, sys
spec = importlib.util.spec_from_file_location('alert', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.send_mail = lambda *args: os._exit(77)
sys.argv = ['alert', '${service}', 'failure']
sys.exit(module.main())`;
  assert.equal((await run('python3', ['-B', '-c', code, path.join(ops, 'alert_state.py')], { env: f.env })).code, 77);
  assert.equal((await f.read()).delivery, 'pending');
  const retry = await f.call();
  assert.equal(retry.code, 0);
  assert.match(retry.stdout, /previous delivery unknown/);
  assert.equal((await f.read()).delivery, 'unknown');
  assert.equal((await f.messages()).length, 0);
  await f.call('failure', service, { FAKE_NOW: '2000086400' });
  assert.equal((await f.messages()).length, 0);
});

test('simultaneous successful runs produce one recovery attempt', async (t) => {
  const f = await fixture(t);
  await f.call();
  const results = await Promise.all(Array.from({ length: 4 }, () => f.call('recovery', service, { FAKE_DELAY: '0.1' })));
  results.forEach((result) => assert.equal(result.code, 0, result.stderr));
  assert.equal((await f.messages()).length, 2);
});

test('default policy creates private state and rejects unsafe lock or directory', async (t) => {
  const f = await fixture(t);
  await fs.rmdir(f.state);
  const environment = { ...f.env };
  delete environment.ALERT_NOTIFICATION_POLICY;
  assert.equal((await run('bash', [path.join(ops, 'alert.sh'), service, 'failure'], { env: environment })).code, 0);
  assert.equal((await fs.stat(f.state)).mode & 0o777, 0o700);
  const lock = path.join(f.state, stateName().replace('.json', '.lock'));
  await fs.unlink(lock);
  await fs.symlink(f.envFile, lock);
  assert.notEqual((await f.call('failure', service, { FAKE_NOW: '2000086400' })).code, 0);
  assert.equal((await f.messages()).length, 1);
  const linked = path.join(f.root, 'linked-state');
  await fs.symlink(f.state, linked);
  assert.notEqual((await f.call('failure', service, { ALERT_STATE_DIR: linked })).code, 0);
  assert.equal((await f.messages()).length, 1);
});

test('known unsent configuration failure retries promptly after repair, then suppresses', async (t) => {
  const f = await fixture(t);
  const configured = await fs.readFile(f.envFile, 'utf8');
  await fs.writeFile(f.envFile, 'MAIL_TRANSPORT=memory\n');
  assert.notEqual((await f.call()).code, 0);
  assert.equal((await f.read()).phase, 'open');
  assert.equal((await f.read()).delivery, 'not_sent');
  assert.equal((await f.messages()).length, 0);
  await fs.writeFile(f.envFile, configured);
  assert.equal((await f.call('failure', service, { FAKE_NOW: '2000000001' })).code, 0);
  assert.equal((await f.messages()).length, 1);
  await f.call('failure', service, { FAKE_NOW: '2000000002' });
  assert.equal((await f.messages()).length, 1);
  await fs.writeFile(f.envFile, 'MAIL_TRANSPORT=memory\n');
  assert.notEqual((await f.call('recovery')).code, 0);
  assert.equal((await f.read()).phase, 'closed');
  assert.equal((await f.read()).delivery, 'not_sent');
  await fs.writeFile(f.envFile, configured);
  await f.call('recovery');
  await f.call('recovery');
  assert.equal((await f.messages()).length, 2);
});

test('lock creation is exclusive; existing-lock open never recreates or follows links', async (t) => {
  const f = await fixture(t);
  const code = `import importlib.util, os, sys
spec = importlib.util.spec_from_file_location('alert', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
original_open = os.open
observed = []
def checked_open(name, flags, *args, **kwargs):
    if name.endswith('.lock'):
        assert flags & os.O_NOFOLLOW
        if flags & os.O_CREAT: assert flags & os.O_EXCL
        observed.append(bool(flags & os.O_CREAT))
    return original_open(name, flags, *args, **kwargs)
os.open = checked_open
sys.argv = ['alert', '${service}', 'failure']
assert module.main() == 0
assert module.main() == 0
assert observed == [True, True, False]`;
  const result = await run('python3', ['-B', '-c', code, path.join(ops, 'alert_state.py')], { env: f.env });
  assert.equal(result.code, 0, result.stderr);
  assert.equal((await f.messages()).length, 1);
});
