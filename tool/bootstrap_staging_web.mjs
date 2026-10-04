#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { bootstrap, privateFile } from './staging_web_bootstrap.mjs';
import { sha256, TARGET } from './staging_web_contract.mjs';

// No SSH, shell interpolation, arbitrary executable, target or config-path input.
export function serverAdapter(manifest, run = execFileSync) {
  const command = (program, args, input) => {
    try { return run(program, args, { input, timeout: 15000, maxBuffer: 8 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { throw Error('bootstrap_server_command_failed'); }
  };
  const docker = (args, input) => command('docker', args, input);
  const exec = (args, input) => docker(['exec', ...(input ? ['-i'] : []), manifest.containerId, ...args], input);
  return {
    inspect() {
      // Never retrieve/log container environment or raw inspect backups.
      const format = '{"id":{{json .Id}},"name":{{json .Name}},"image":{{json .Config.Image}},"imageId":{{json .Image}},"running":{{json .State.Running}},"args":{{json .Args}},"mounts":{{json .Mounts}}}';
      const state = JSON.parse(docker(['inspect', '--format', format, manifest.containerId]).toString());
      state.name = state.name.replace(/^\//, '');
      state.version = exec(['caddy', 'version']).toString().trim().split(/\s/)[0];
      return state;
    },
    mountedConfig: () => exec(['cat', '/etc/caddy/Caddyfile']),
    activeConfig: () => JSON.parse(exec(['wget', '-q', '-O', '-', 'http://127.0.0.1:2019/config/']).toString()),
    adapt: (bytes) => JSON.parse(exec(['caddy', 'adapt', '--config', '/dev/stdin', '--adapter', 'caddyfile'], bytes).toString()),
    validate: (bytes) => exec(['caddy', 'validate', '--config', '/dev/stdin', '--adapter', 'caddyfile'], bytes),
    reload: () => exec(['caddy', 'reload', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile']),
    fetch(route) {
      if (!/^\/(?:$|(?:index\.html|staging_bootstrap\.js|flutter_service_worker\.js|staging-release\.json)\?artifact=[a-f0-9]{64}$)/.test(route)) throw Error('bootstrap_readback_route_forbidden');
      return command('curl', ['--fail', '--silent', '--show-error', '--proto', '=https', '--max-time', '10', '--header', 'Cache-Control: no-cache', `${TARGET}${route}`]);
    },
  };
}
export function main(args) {
  const [manifestPath, manifestHash, sourceRoot, artifact, mode, ...extra] = args;
  if (!artifact || extra.length || (mode && mode !== '--execute-bootstrap')) throw Error('bootstrap_usage');
  if (process.getuid() !== 0) throw Error('bootstrap_root_required');
  if (path.resolve(sourceRoot, 'tool/bootstrap_staging_web.mjs') !== fileURLToPath(import.meta.url)) throw Error('bootstrap_executor_source_mismatch');
  const bytes = privateFile(manifestPath);
  if (!/^[a-f0-9]{64}$/.test(manifestHash) || sha256(bytes) !== manifestHash) throw Error('bootstrap_manifest_hash_mismatch');
  const manifest = JSON.parse(bytes);
  return bootstrap({ hostRoot: '/docker/shareittoo', manifest, sourceRoot, artifact, adapter: serverAdapter(manifest), execute: mode === '--execute-bootstrap' });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main(process.argv.slice(2)))); }
  catch (error) {
    // A command failure must not print Caddy contents, credentials or raw Docker output.
    console.error(/^bootstrap_[a-z_]+$/.test(error.message) ? error.message : 'bootstrap_validation_or_io_failed');
    process.exitCode = 1;
  }
}
