import { OwnedDocker, dockerObject, validId } from './green_staging_98_106_resources.mjs';
import { assertContainerSpec } from './green_staging_98_106_execution.mjs';
import { equal, networkMembers } from './green_staging_98_106_contract.mjs';
import { containerFingerprint } from './green_staging_98_106_promotion.mjs';
import { requireBinding as require } from './green_staging_106_106_binding.mjs';

// Unlike always, unless-stopped preserves an explicit stop across daemon reboot.
// Disposable rehearsal resources retain no; only the accepted canonical pair
// receives persistence, after readiness and visibility have been verified.
export function supportedCanonicalRestartPolicy(policy) {
  return ['no', 'unless-stopped'].includes(policy?.Name)
    && equal(Object.keys(policy).sort(), ['MaximumRetryCount', 'Name']) && policy.MaximumRetryCount === 0;
}
export function assertSuccessorContainerSpec(record, spec) {
  require(equal(record.HostConfig?.RestartPolicy, { Name: spec.restartPolicy ?? 'no', MaximumRetryCount: 0 }), 'canonical_restart_policy');
  // Keep the historical/disposable validator's no-only contract unchanged.
  assertContainerSpec({ ...record, HostConfig: { ...record.HostConfig,
    RestartPolicy: { Name: 'no', MaximumRetryCount: 0 } } }, spec);
}
export function canonicalPersistence(records, command) {
  require(Array.isArray(records) && records.length === 2 && new Set(records.map(r => r.Id)).size === 2, 'persistence_pair');
  const entries = records.map(record => {
    require(validId(record.Id) && /^\/[a-zA-Z0-9][a-zA-Z0-9_.-]+$/u.test(record.Name)
      && supportedCanonicalRestartPolicy(record.HostConfig?.RestartPolicy)
      && record.State?.Running === true && record.State.Paused === false, 'persistence_source');
    return { before: structuredClone(record), attempted: false };
  });
  const inspect = async entry => {
    const record = dockerObject(await command({ phase: 'persistence_inspect', args: ['inspect', entry.before.Id] }));
    const normalized = { ...record, HostConfig: { ...record.HostConfig, RestartPolicy: entry.before.HostConfig.RestartPolicy } };
    require(record.Id === entry.before.Id && record.Name === entry.before.Name && record.Image === entry.before.Image
      && record.State?.Running === true && record.State.Paused === false
      && supportedCanonicalRestartPolicy(record.HostConfig?.RestartPolicy)
      && containerFingerprint(normalized) === containerFingerprint(entry.before)
      && equal(record.NetworkSettings, entry.before.NetworkSettings), 'persistence_cas');
    return record.HostConfig.RestartPolicy.Name;
  };
  let applied = false;
  return {
    async apply() {
      require(!applied, 'persistence_replay'); applied = true;
      // Validate the complete pair before the first mutation.
      for (const entry of entries) require(await inspect(entry) === entry.before.HostConfig.RestartPolicy.Name, 'persistence_drift');
      for (const entry of entries) {
        require(await inspect(entry) === entry.before.HostConfig.RestartPolicy.Name, 'persistence_drift');
        if (entry.before.HostConfig.RestartPolicy.Name === 'unless-stopped') continue;
        entry.attempted = true;
        await command({ phase: 'persistence_update', args: ['update', '--restart', 'unless-stopped', entry.before.Id] });
        require(await inspect(entry) === 'unless-stopped', 'persistence_readback');
      }
      for (const entry of entries) require(await inspect(entry) === 'unless-stopped', 'persistence_readback');
    },
    async rollback() {
      let verified = true;
      for (const entry of [...entries].reverse()) if (entry.attempted) try {
        const policy = await inspect(entry);
        if (policy !== entry.before.HostConfig.RestartPolicy.Name) {
          try { await command({ phase: 'persistence_rollback', args: ['update', '--restart', entry.before.HostConfig.RestartPolicy.Name, entry.before.Id] }); }
          catch { /* No mutation replay; exact readback alone verifies rollback. */ }
        }
        require(await inspect(entry) === entry.before.HostConfig.RestartPolicy.Name, 'persistence_rollback');
      } catch { verified = false; }
      for (const entry of entries) try {
        require(await inspect(entry) === entry.before.HostConfig.RestartPolicy.Name, 'persistence_rollback');
      } catch { verified = false; }
      return verified;
    },
  };
}

// Reuse the reviewed exact-ID transitions and cleanup mechanics unchanged.
// Only successor naming/labels/create and exact active membership are adapted.
export class SuccessorDocker extends OwnedDocker {
  constructor({ plan, command }) { super({ nonce: '0'.repeat(32), command }); this.plan = plan; }
  async find(kind, name) {
    require([this.plan.network.name, ...this.plan.roles.map(r => r.name)].includes(name), 'resource_name');
    const args = kind === 'network'
      ? ['network', 'ls', '--no-trunc', '--filter', `name=^${name}$`, '--format', '{{.ID}}']
      : ['ps', '--all', '--no-trunc', '--filter', `name=^/${name}$`, '--format', '{{.ID}}'];
    const raw = String(await this.call(`find_${kind}`, args)).trim();
    require(raw === '' || validId(raw), 'resource_ambiguous'); return raw || null;
  }
  assertOwned(record, resource) {
    require(record.Id === resource.id && validId(record.Id)
      && (resource.kind === 'network' ? record.Name : record.Name?.slice(1)) === resource.name, 'resource_identity');
    const labels = resource.kind === 'network' ? record.Labels : record.Config?.Labels;
    require(Object.entries(this.plan.labels).every(([k, v]) => labels?.[k] === v), 'resource_labels');
    resource.validate(record);
  }
  async create({ kind, role, args = [], validate, env = {} }) {
    const name = kind === 'network' ? this.plan.network.name : this.plan.roles.find(r => r.role === role)?.name;
    require(name && typeof validate === 'function' && ['network', 'container'].includes(kind), 'resource_spec');
    require(await this.find(kind, name) === null, 'resource_collision');
    const resource = { kind, role, name, validate, id: null, removed: false, volumeNames: [] };
    this.owned.push(resource);
    const labels = Object.entries(this.plan.labels).flatMap(([k, v]) => ['--label', `${k}=${v}`]);
    let returned, failed = false;
    try { returned = String(await this.call(`create_${role}`, kind === 'network'
      ? ['network', 'create', '--internal', ...labels, name] : ['create', '--name', name, ...labels, ...args], { env })).trim(); }
    catch { failed = true; }
    resource.id = await this.find(kind, name);
    require(resource.id && (failed || returned === resource.id), 'resource_create');
    const record = await this.inspect(kind, resource.id); this.assertOwned(record, resource);
    if (kind === 'container') {
      require(record.State?.Running === false && record.State.Paused === false, 'resource_created_state');
      resource.volumeNames = (record.Mounts ?? []).filter(m => m.Type === 'volume').map(m => m.Name);
      require(resource.volumeNames.every(validId), 'resource_anonymous_volume');
    }
    return resource;
  }
  async checkNetworks() {
    const running = [];
    for (const r of this.owned.filter(r => r.kind === 'container' && !r.removed && r.id)) {
      const record = await this.inspect('container', r.id); this.assertOwned(record, r);
      if (record.State.Running && record.HostConfig.NetworkMode !== 'none') running.push({ id: r.id, name: r.name });
    }
    for (const r of this.owned.filter(r => r.kind === 'network' && !r.removed)) {
      const record = await this.inspect('network', r.id); this.assertOwned(record, r);
      require(equal(networkMembers(record.Containers), running.sort((a, b) => a.id.localeCompare(b.id))), 'resource_network_members');
    }
  }
}
export function strictSupplementalGroups(groups) {
  require(Array.isArray(groups), 'isolated_groups');
  const result = groups.map(group => {
    require(typeof group === 'string' && /^[1-9][0-9]*$/u.test(group), 'isolated_group');
    const numeric = Number(group);
    require(Number.isSafeInteger(numeric) && numeric > 0 && String(numeric) === group, 'isolated_group');
    return group;
  });
  require(new Set(result).size === result.length, 'isolated_group_duplicate');
  return result.sort((a, b) => Number(a) - Number(b));
}
export function isolatedSpec(image, network, overrides, { groups = [], mounts = [], script, user } = {}) {
  const inherited = Object.fromEntries((image.Config.Env ?? []).map(e => [e.slice(0, e.indexOf('=')), e.slice(e.indexOf('=') + 1)]));
  require(!Object.keys(overrides).some(k => ['APP_COMMIT', 'APP_VERSION', 'APP_BUILD_TIME'].includes(k)), 'isolated_image_override');
  const supplementalGroups = strictSupplementalGroups(groups);
  for (const m of mounts) require(['bind', 'volume'].includes(m.type) && !m.name
    && typeof m.destination === 'string' && !/[\n\r,]/u.test(m.destination)
    && (m.type !== 'bind' || (typeof m.source === 'string' && !/[\n\r,]/u.test(m.source) && m.readOnly === true)), 'isolated_mount');
  const spec = { image: image.Id, imageId: image.Id, user: user ?? image.Config.User ?? '', env: { ...inherited, ...overrides },
    entrypoint: script ? ['node'] : image.Config.Entrypoint ?? [], cmd: script ? ['--input-type=module', '-e', script] : image.Config.Cmd ?? [],
    networkId: network?.id ?? 'none', networks: network ? { [network.name]: network.id } : {}, mounts, groups: supplementalGroups, ports: {} };
  const args = ['--network', spec.networkId, '--restart', 'no',
    ...(user ? ['--user', user] : []), ...supplementalGroups.flatMap(group => ['--group-add', group]),
    ...Object.keys(overrides).sort().flatMap(key => ['--env', key]),
    ...mounts.flatMap(m => ['--mount', `type=${m.type},${m.source ? `src=${m.source},` : ''}dst=${m.destination}${m.readOnly ? ',readonly' : ''}`]),
    ...(script ? ['--entrypoint', 'node'] : []), image.Id, ...(script ? spec.cmd : [])];
  return { args, env: overrides, validate: record => assertContainerSpec(record, spec), spec };
}
export { dockerObject };
