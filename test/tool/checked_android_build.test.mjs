import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createAndroidBuildDiagnosticScan, runCheckedAndroidBuild } from '../../tool/run_checked_android_build.mjs';

const kotlin = 'e: synthetic.jar!/META-INF/test.kotlin_module Module was compiled with an incompatible version of Kotlin. The binary version of its metadata is 2.3.0, expected version is 2.1.0.';
const xml = 'Warning: SDK processing. This version only understands SDK XML versions up to 3 but an SDK XML file of version 4 was encountered.';
const discard = { write() {} };

function childProcess({ output = '', errorOutput = '', code = 0, spawnError = false } = {}) {
  return (file, args, options) => {
    assert.equal(file, 'flutter'); assert.equal(options.shell, false);
    assert.deepEqual(args, ['build', 'apk', '--release']);
    const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    queueMicrotask(() => {
      if (spawnError) { child.emit('error', new Error('synthetic failure')); return; }
      child.stdout.emit('data', output); child.stderr.emit('data', errorOutput);
      child.emit('close', code);
    });
    return child;
  };
}
const run = (options) => runCheckedAndroidBuild({ args: ['apk', '--release'], spawnProcess: childProcess(options), stdout: discard, stderr: discard });

test('recognizes the observed Kotlin and SDK errors at every stream split', () => {
  for (const [line, code] of [[kotlin, 'incompatible-kotlin-metadata'], [xml, 'incompatible-sdk-xml-reader']]) {
    for (let i = 0; i <= line.length; i++) {
      const scan = createAndroidBuildDiagnosticScan();
      scan.accept(line.slice(0, i)); scan.accept(line.slice(i));
      scan.accept('x'.repeat(10000));
      assert.deepEqual(scan.result(), [code]);
    }
  }
});

test('ordinary dependency notices and deprecations do not masquerade as failures', async () => {
  assert.deepEqual(await run({output: 'Note: Some input files use a deprecated API.\nBUILD SUCCESSFUL\n'}), {exitCode: 0, findings: []});
});

test('exit-zero builds still fail on incompatible metadata or an obsolete SDK reader', async () => {
  assert.deepEqual(await run({errorOutput: kotlin}), {exitCode: 1, findings: ['incompatible-kotlin-metadata']});
  assert.deepEqual(await run({output: xml}), {exitCode: 1, findings: ['incompatible-sdk-xml-reader']});
});

test('does not merge separate stdout and stderr fragments into a false diagnostic', async () => {
  assert.deepEqual(await run({output: 'compiled with an incompatible', errorOutput: ' version of Kotlin'}), {exitCode: 0, findings: []});
});

test('preserves unsuccessful exit codes and fails closed on signal or launch error', async () => {
  assert.equal((await run({code: 17})).exitCode, 17);
  assert.equal((await run({code: 17, errorOutput: kotlin})).exitCode, 17);
  assert.equal((await run({code: null})).exitCode, 1);
  assert.deepEqual(await run({spawnError: true}), {exitCode: 1, findings: ['build-process-unavailable']});
});

test('requires explicit release mode and guards both artifacts before archive creation', async () => {
  await assert.rejects(runCheckedAndroidBuild({args: ['apk', '--debug']}), /explicit release/u);
  const script = readFileSync(new URL('../../scripts/build_android_release_candidate.sh', import.meta.url), 'utf8');
  for (const format of ['appbundle', 'apk']) {
    const command = `node tool/run_checked_android_build.mjs ${format}`;
    assert.ok(script.includes(command));
    assert.ok(script.indexOf(command) < script.indexOf('node tool/archive_android_release_candidate.mjs'));
  }
  assert.doesNotMatch(script, /flutter build (?:apk|appbundle)/u);
});
