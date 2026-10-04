import { execFileSync } from 'node:child_process';
import { assert, equal } from './green_staging_98_106_contract.mjs';

export function dockerCommand({ args, input, outputFd, env = {} }) {
  try {
    return execFileSync('docker', args, { encoding: input instanceof Buffer ? 'buffer' : 'utf8',
      env: { ...process.env, ...env }, timeout: 120000, maxBuffer: 16 * 1024 * 1024,
      input, stdio: [input === undefined ? 'ignore' : 'pipe', outputFd ?? 'pipe', 'pipe'] });
  } catch { throw new Error('green_98_106_docker_failed'); }
}
export const ownershipLabel = 'com.shareittoo.green.98_106.execution';
export function dockerObject(raw) {
  const value = JSON.parse(String(raw));
  assert(Array.isArray(value) && value.length === 1, 'green_98_106_docker_object'); return value[0];
}
export function validId(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }

// IDs are discovered and verified after every create, including lost responses.
// No create/start/connect/remove path is allowed to treat a name as identity.
export class OwnedDocker {
  constructor({ nonce, command = dockerCommand }) {
    assert(/^[a-f0-9]{32}$/u.test(nonce), 'green_98_106_ownership_nonce');
    this.nonce = nonce; this.command = command; this.owned = []; this.cleanupComplete = false;
  }
  async call(phase, args, options = {}) {
    return this.command({ phase, args: [...args], ...options });
  }
  async inspect(kind, identity) {
    assert(validId(identity), 'green_98_106_inspect_id');
    return dockerObject(await this.call(`inspect_${kind}`, kind === 'network'
      ? ['network', 'inspect', identity] : ['inspect', identity]));
  }
  async find(kind, name) {
    assert(/^sit-g98106-[a-z]+-[a-f0-9]{32}$/u.test(name), 'green_98_106_owned_name');
    const args = kind === 'network'
      ? ['network', 'ls', '--no-trunc', '--filter', `name=^${name}$`, '--format', '{{.ID}}']
      : ['ps', '--all', '--no-trunc', '--filter', `name=^/${name}$`, '--format', '{{.ID}}'];
    const raw = String(await this.call(`find_${kind}`, args)).trim();
    if (!raw) return null;
    assert(validId(raw), 'green_98_106_owned_name_ambiguous'); return raw;
  }
  async absence(kind, id) {
    assert(validId(id), 'green_98_106_absence_id');
    const args = kind === 'network'
      ? ['network', 'ls', '--no-trunc', '--filter', `id=${id}`, '--format', '{{.ID}}']
      : ['ps', '--all', '--no-trunc', '--filter', `id=${id}`, '--format', '{{.ID}}'];
    return String(await this.call(`absence_${kind}`, args)).trim() === '';
  }
  assertOwned(record, resource) {
    assert(record.Id === resource.id && validId(record.Id)
      && (resource.kind === 'network' ? record.Name : record.Name?.slice(1)) === resource.name,
    'green_98_106_owned_identity');
    const labels = resource.kind === 'network' ? record.Labels : record.Config?.Labels;
    assert(labels?.[ownershipLabel] === this.nonce
      && labels['com.shareittoo.green.rehearsal'] === 'true', 'green_98_106_owned_label');
    resource.validate(record);
  }
  async create({ kind, role, args, validate, env = {} }) {
    assert(['container', 'network'].includes(kind) && /^[a-z]+$/u.test(role)
      && typeof validate === 'function', 'green_98_106_owned_spec');
    const name = `sit-g98106-${role}-${this.nonce}`;
    assert(await this.find(kind, name) === null, 'green_98_106_owned_collision');
    const resource = { kind, name, id: null, validate, role, removed: false, volumeNames: [] };
    this.owned.push(resource); // Before dispatch: response-loss cleanup must find it.
    const labels = ['--label', `${ownershipLabel}=${this.nonce}`, '--label', 'com.shareittoo.green.rehearsal=true'];
    const argv = kind === 'network'
      ? ['network', 'create', '--internal', ...labels, name]
      : ['create', '--name', name, ...labels, ...args];
    let returned; let failed = false;
    try { returned = String(await this.call(`create_${role}`, argv, { env })).trim(); } catch { failed = true; }
    const discovered = await this.find(kind, name);
    assert(discovered !== null && (failed || returned === discovered), 'green_98_106_create_unconfirmed');
    resource.id = discovered;
    const record = await this.inspect(kind, resource.id); this.assertOwned(record, resource);
    if (kind === 'container') {
      assert(record.State?.Running === false && record.State.Paused === false, 'green_98_106_created_state');
      resource.volumeNames = (record.Mounts ?? []).filter(m => m.Type === 'volume').map(m => m.Name);
      assert(resource.volumeNames.every(name => /^[a-f0-9]{64}$/u.test(name)), 'green_98_106_anonymous_volume');
    }
    return resource;
  }
  async transition(resource, phase, args, before, after) {
    assert(resource.id && !resource.removed, 'green_98_106_transition_identity');
    const prior = await this.inspect(resource.kind, resource.id); this.assertOwned(prior, resource); before(prior);
    let failed = false;
    try { await this.call(phase, args); } catch { failed = true; }
    const next = await this.inspect(resource.kind, resource.id); this.assertOwned(next, resource); after(next);
    // An error is reconciled only by the exact requested postcondition above.
    return { record: next, responseLossReconciled: failed };
  }
  async start(resource) {
    await this.checkNetworks();
    return this.transition(resource, `start_${resource.role}`, ['start', resource.id],
      r => assert(r.State?.Running === false && r.State.Paused === false, 'green_98_106_start_cas'),
      r => assert(r.State?.Running === true && r.State.Paused === false, 'green_98_106_start_unconfirmed'));
  }
  async task(resource) {
    await this.checkNetworks();
    await this.transition(resource, `start_${resource.role}`, ['start', resource.id],
      r => assert(r.State?.Running === false && r.State.Paused === false && r.State.Status === 'created', 'green_98_106_task_cas'),
      r => assert(r.State?.Paused === false && (r.State.Running === true
        || (r.State.Status === 'exited' && r.State.ExitCode === 0)), 'green_98_106_task_start'));
    try { await this.call(`wait_${resource.role}`, ['wait', resource.id]); } catch { /* Verify final state. */ }
    const final = await this.inspect('container', resource.id); this.assertOwned(final, resource);
    assert(final.State?.Running === false && final.State.Status === 'exited' && final.State.ExitCode === 0,
      'green_98_106_task_failed');
    return String(await this.call(`logs_${resource.role}`, ['logs', resource.id]));
  }
  async checkNetworks() {
    const allowed = new Set(this.owned.filter(r => r.kind === 'container' && !r.removed).map(r => r.id));
    for (const resource of this.owned.filter(r => r.kind === 'network' && !r.removed)) {
      const network = await this.inspect('network', resource.id); this.assertOwned(network, resource);
      assert(Object.keys(network.Containers ?? {}).every(id => allowed.has(id)), 'green_98_106_owned_foreign_member');
    }
  }
  async stop(resource) {
    const prior = await this.inspect('container', resource.id); this.assertOwned(prior, resource);
    if (prior.State?.Running === false) return;
    return this.transition(resource, `stop_${resource.role}`, ['stop', resource.id],
      r => assert(r.State?.Running === true && r.State.Paused === false, 'green_98_106_stop_cas'),
      r => assert(r.State?.Running === false && r.State.Paused === false, 'green_98_106_stop_unconfirmed'));
  }
  async remove(resource) {
    if (!resource.id) {
      resource.id = await this.find(resource.kind, resource.name);
      if (!resource.id) { resource.removed = true; return; }
    }
    if (resource.removed) { assert(await this.absence(resource.kind, resource.id), 'green_98_106_removed_reappeared'); return; }
    const record = await this.inspect(resource.kind, resource.id); this.assertOwned(record, resource);
    if (resource.kind === 'network') assert(Object.keys(record.Containers ?? {}).length === 0, 'green_98_106_network_not_empty');
    else {
      const volumes = (record.Mounts ?? []).filter(m => m.Type === 'volume').map(m => m.Name);
      if (resource.volumeNames.length === 0) resource.volumeNames = volumes;
      assert(equal(volumes, resource.volumeNames) && volumes.every(n => /^[a-f0-9]{64}$/u.test(n)), 'green_98_106_cleanup_volume_drift');
    }
    try {
      await this.call(`remove_${resource.role}`, resource.kind === 'network'
        ? ['network', 'rm', resource.id] : ['rm', '--force', '--volumes', resource.id]);
    } catch { /* Readback, never an exception string, decides deletion. */ }
    assert(await this.absence(resource.kind, resource.id), 'green_98_106_cleanup_incomplete');
    if (resource.volumeNames.length) {
      const current = String(await this.call('verify_anonymous_volumes_removed', ['volume', 'ls', '--format', '{{.Name}}'])).trim().split('\n');
      assert(resource.volumeNames.every(name => !current.includes(name)), 'green_98_106_cleanup_volume_retained');
    }
    resource.removed = true;
  }
  async cleanup() {
    let failure = false;
    for (const resource of [...this.owned].reverse()) {
      try { await this.remove(resource); } catch { failure = true; }
    }
    assert(!failure && this.owned.every(resource => resource.removed), 'green_98_106_cleanup_failed');
    this.cleanupComplete = true;
  }
}
