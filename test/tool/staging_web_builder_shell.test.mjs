import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { profile, validateArtifact } from '../../tool/staging_web_contract.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// Import/reference the real CLI in the current-consumer matrix. Never substitute
// bash: the production command, capacity guard and smoke shell execute unchanged.
const builder = new URL('../../tool/build_staging_web.mjs', import.meta.url);
const stages = ['release_host_capacity_begin', 'flutter pub get --enforce-lockfile',
  'flutter build web "$@"', 'bash scripts/p0a_web_smoke.sh', 'release_host_capacity_end'];
const marker = 'SIT_SHELL_INJECTION_MARKER';
const version = '1.0.0+2026092905';

function fixture(t, suffix = 'ordinary', failure = '') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sit-builder-shell-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const checkout = path.join(root, `source-${suffix}-fixture`);
  const temporary = path.join(root, `temporary-${suffix}-fixture`);
  const output = path.join(root, `artifact-${suffix}-fixture`);
  const bin = path.join(root, 'bin');
  for (const directory of [checkout, temporary, bin, path.join(checkout, 'scripts'), path.join(checkout, 'tool')]) fs.mkdirSync(directory);
  fs.writeFileSync(path.join(checkout, 'pubspec.yaml'), `version: ${version}\n`);
  fs.writeFileSync(path.join(checkout, '.gitignore'), 'build/\n');
  for (const name of ['release_host_capacity_guard.sh', 'p0a_web_smoke.sh']) {
    fs.copyFileSync(path.join(repo, 'scripts', name), path.join(checkout, 'scripts', name));
  }
  // Real Bash DEBUG observations only: do not replace/redefine any gate function.
  // functrace exposes inner guard calls; assertions use the outer stage commands.
  const startup = path.join(root, 'observe.bash');
  fs.writeFileSync(startup, `set -o functrace
trap 'printf "%s\\t%s\\t%s\\t%s\\t%s\\n" "\${BASHPID:-$$}" "$-" "$SHELLOPTS" "$BASH_COMMAND" "$BASH_SUBSHELL" >> "$SIT_TEST_TRACE"' DEBUG
`);
  const program = `#!${process.execPath}
import fs from 'node:fs'; import path from 'node:path';
const name = path.basename(process.argv[1]); const args = process.argv.slice(2);
const log = (stage, more = {}) => fs.appendFileSync(process.env.SIT_TEST_EVENTS, JSON.stringify({stage,args,...more})+'\\n');
const mode = process.env.SIT_TEST_FAILURE;
const stop = (stage) => { if(mode===stage) process.exit(17); };
if(name==='flutter') {
  if(args[0]==='--version') { console.log(JSON.stringify({frameworkVersion:'synthetic',frameworkRevision:'synthetic',dartSdkVersion:'synthetic'})); process.exit(0); }
  const stage=args[0]; log(stage); stop(stage);
  if(stage==='build') {
    const flag=args.find(x=>x.startsWith('--dart-define-from-file='));
    const file=flag.slice('--dart-define-from-file='.length);
    log('definitions', {file,mode:fs.statSync(file).mode&511,value:JSON.parse(fs.readFileSync(file))});
    fs.mkdirSync('build/web',{recursive:true});
    for(const [file,text] of Object.entries({'index.html':'<script src="flutter_bootstrap.js" async></script>', 'main.dart.js':'synthetic compiled', 'manifest.json':'{}', 'flutter_bootstrap.js':'bootstrap();'})) fs.writeFileSync(path.join('build/web',file),text);
  }
} else if(name==='node') { log('consumer'); stop('consumer'); }
else if(name==='python3') { const stage=fs.existsSync(process.env.SIT_TEST_OUTPUT)?'sealed-smoke':'smoke'; log(stage); stop(stage); }
else if(name==='df') {
  const end=fs.existsSync('build/web'); log(end?'end-free':'begin-free');
  if(mode==='begin-pipeline'&&!end) process.exit(19);
  const free=(mode==='begin-capacity'&&!end)||(mode==='end-free'&&end)?1:8*1024*1024;
  console.log('Filesystem 1024-blocks Used Available Capacity Mounted'); console.log('synthetic 99999999 0 '+free+' 0% synthetic');
} else if(name==='du') { log('end-generated'); console.log((mode==='end-generated'?6*1024*1024:64)+' synthetic'); }
else process.exit(99);
`;
  fs.writeFileSync(path.join(bin, 'package.json'), '{"type":"module"}');
  for (const name of ['flutter', 'node', 'python3', 'df', 'du']) fs.writeFileSync(path.join(bin, name), program, { mode: 0o755 });
  const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('add', '.'); git('-c', 'user.name=Synthetic', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
  const source = git('rev-parse', 'HEAD');
  const events = path.join(root, 'events.jsonl'); const trace = path.join(root, 'trace.tsv');
  const result = spawnSync(process.execPath, [fileURLToPath(builder), checkout, source, output], {
    encoding: 'utf8', timeout: 15000,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: temporary,
      P0A_WEB_SMOKE_PORT: '0',
      BASH_ENV: startup, SIT_TEST_TRACE: trace, SIT_TEST_EVENTS: events,
      SIT_TEST_FAILURE: failure, SIT_TEST_OUTPUT: output },
  });
  assert.equal(result.error, undefined);
  assert.ok(fs.existsSync(events), result.stderr);
  const observed = fs.readFileSync(events, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const commands = fs.readFileSync(trace, 'utf8').trim().split('\n').map((line) => {
    const [pid, flags, options, command, subshell] = line.split('\t'); return { pid, flags, options, command, subshell };
  }).filter(({ command }) => stages.includes(command));
  const calls = commands.filter((entry, index) => index === 0 || entry.command !== commands[index - 1].command);
  // The same live Bash PID retains begin's readonly measurements for end.
  assert.equal(new Set(calls.map(({ pid }) => pid)).size, 1);
  for (const entry of calls) {
    assert.equal(entry.subshell, '0');
    assert.match(entry.flags, /e/u); assert.match(entry.flags, /u/u);
    assert.ok(entry.options.split(':').includes('pipefail'));
  }
  function noInjectedFiles(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      assert.notEqual(entry.name, marker, 'shell metacharacters must remain data');
      if (entry.isDirectory()) noInjectedFiles(path.join(directory, entry.name));
    }
  }
  noInjectedFiles(root);
  assert.deepEqual(fs.readdirSync(temporary), [], 'private defines directory cleaned on success and failure');
  return { checkout, output, temporary, result, observed, calls: calls.map(({ command }) => command), source };
}

for (const [label, suffix] of [
  ['spaces', 'two words'], ['quotes', `single'and"double`],
  ['semicolon', `;touch ${marker};`], ['command substitution', `$(touch ${marker})`],
  ['backticks', '`touch '+marker+'`'], ['newline', 'before\nafter'], ['equals', 'left=right'],
]) {
  test(`real Bash keeps ${label} in source/temp paths as exact Flutter argument data`, (t) => {
    const f = fixture(t, suffix);
    assert.equal(f.result.status, 0, f.result.stderr);
    assert.deepEqual(f.calls, stages);
    assert.deepEqual(f.observed.map(({ stage }) => stage), ['consumer', 'begin-free', 'pub', 'build', 'definitions', 'smoke', 'end-free', 'end-generated', 'sealed-smoke']);
    assert.deepEqual(f.observed.find(({ stage }) => stage === 'consumer').args, ['tool/check_current_consumer_closure.mjs']);
    assert.deepEqual(f.observed.find(({ stage }) => stage === 'pub').args, ['pub', 'get', '--enforce-lockfile']);
    const definitions = f.observed.find(({ stage }) => stage === 'definitions');
    assert.equal(path.dirname(path.dirname(definitions.file)), f.temporary);
    assert.equal(path.basename(definitions.file), 'defines.json'); assert.equal(definitions.mode, 0o600);
    assert.deepEqual(definitions.value, profile(f.source, version));
    assert.deepEqual(f.observed.find(({ stage }) => stage === 'build').args, ['build', 'web', '--release', '--pwa-strategy=none', '--no-web-resources-cdn', '--base-href=/', `--dart-define-from-file=${definitions.file}`]);
    assert.deepEqual(f.observed.find(({ stage }) => stage === 'smoke').args, [path.join(f.checkout, 'tool/run_p0a_web_smoke.py'), '--web-root', path.join(f.checkout, 'build/web'), '--port', '0']);
    const summary = JSON.parse(f.result.stdout.trim().split('\n').at(-1));
    validateArtifact(f.output, summary.manifestHash, f.source);
  });
}

for (const [failure, count, expectedEvents] of [
  ['consumer', 1, ['consumer']],
  ['begin-capacity', 1, ['consumer', 'begin-free']],
  ['begin-pipeline', 1, ['consumer', 'begin-free']],
  ['pub', 2, ['consumer', 'begin-free', 'pub']],
  ['build', 3, ['consumer', 'begin-free', 'pub', 'build']],
  ['smoke', 4, ['consumer', 'begin-free', 'pub', 'build', 'definitions', 'smoke']],
  ['end-free', 5, ['consumer', 'begin-free', 'pub', 'build', 'definitions', 'smoke', 'end-free', 'end-generated']],
  ['end-generated', 5, ['consumer', 'begin-free', 'pub', 'build', 'definitions', 'smoke', 'end-free', 'end-generated']],
]) {
  test(`real Bash ${failure} failure stops the exact gate prefix and never seals an artifact`, (t) => {
    const f = fixture(t, 'ordinary', failure);
    assert.equal(f.result.status, 1);
    assert.match(f.result.stderr, /Staging Web build refused: build_operation_failed/u);
    assert.deepEqual(f.calls, stages.slice(0, count));
    assert.deepEqual(f.observed.map(({ stage }) => stage), expectedEvents);
    assert.equal(fs.existsSync(f.output), false);
    assert.doesNotMatch(f.result.stdout, /staging-web-build-passed/u);
  });
}
