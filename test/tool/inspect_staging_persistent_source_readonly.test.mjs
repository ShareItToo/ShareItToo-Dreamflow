import assert from 'node:assert/strict';
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  inspectStagingPersistentSourceReadonly,
} from '../../tool/inspect_staging_persistent_source_readonly.mjs';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'sit-staging-persistent-source-'));
  const working = join(root, 'backend');
  const overrides = join(working, '.runtime-overrides');
  mkdirSync(join(working, 'ops'), { recursive: true, mode: 0o755 });
  mkdirSync(overrides, { recursive: true, mode: 0o700 });
  writeFileSync(join(working, '.env.staging'), 'nonsecret-shape-only\n', { mode: 0o600 });
  writeFileSync(join(working, 'ops', 'deploy_release.sh'), '#!/bin/sh\n', { mode: 0o700 });
  const configFiles = [
    join(working, 'compose.staging.yml'),
    join(working, 'compose.staging.pilot.yml'),
    join(working, 'compose.staging.fcm.yml'),
    join(working, 'compose.staging.smtp.yml'),
    join(overrides, 'staging-current-deployment.yml'),
  ];
  configFiles.forEach((path, index) => writeFileSync(path, `config-${index}\n`, {
    mode: path.startsWith(overrides) ? 0o600 : 0o644,
  }));
  const labels = {
    'com.docker.compose.project': 'sit-staging',
    'com.docker.compose.project.working_dir': working,
    'com.docker.compose.project.config_files': configFiles.join(','),
  };
  const run = (command, args) => {
    assert.equal(command, 'docker');
    const name = args.at(-1);
    if (args[0] !== 'inspect') throw new Error('unexpected docker invocation');
    if (args[2].includes('.Mounts')) return name.endsWith('api') ? 'sit-staging_uploads' : 'sit-staging_postgres';
    const label = /"([^"]+)"/.exec(args[2])?.[1];
    if (!label || !(label in labels)) throw new Error('unexpected compose label');
    return labels[label];
  };
  return { root, working, configFiles, labels, run, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('accepts only persistent regular Staging source metadata and emits no paths', () => {
  const fixture = setup();
  try {
    const result = inspectStagingPersistentSourceReadonly({ rootDirectory: fixture.root, run: fixture.run });
    assert.equal(result.status, 'passed-read-only');
    assert.equal(result.compose.activeConfigFileCount, 5);
    assert.equal(result.persistentSource.environmentFileRegularOwnerOnly, true);
    assert.equal(result.volumes.allNamedVolumesBoundToStagingProject, true);
    assert.equal(JSON.stringify(result).includes(fixture.root), false);
    assert.equal(JSON.stringify(result).includes('sit-staging_postgres'), false);
  } finally {
    fixture.cleanup();
  }
});

test('fails closed for missing persistent override, unsafe environment file, or project mismatch', () => {
  const missing = setup();
  try {
    missing.labels['com.docker.compose.project.config_files'] = missing.configFiles.slice(0, 4).join(',');
    assert.throws(
      () => inspectStagingPersistentSourceReadonly({ rootDirectory: missing.root, run: missing.run }),
      /inspection failed/u,
    );
  } finally {
    missing.cleanup();
  }

  const permissions = setup();
  try {
    chmodSync(join(permissions.working, '.env.staging'), 0o644);
    assert.throws(
      () => inspectStagingPersistentSourceReadonly({ rootDirectory: permissions.root, run: permissions.run }),
      /inspection failed/u,
    );
  } finally {
    permissions.cleanup();
  }

  const project = setup();
  try {
    project.labels['com.docker.compose.project'] = 'production';
    assert.throws(
      () => inspectStagingPersistentSourceReadonly({ rootDirectory: project.root, run: project.run }),
      /inspection failed/u,
    );
  } finally {
    project.cleanup();
  }

  const linked = setup();
  try {
    const original = join(linked.working, '.env.staging.source');
    writeFileSync(original, 'not-a-secret\n', { mode: 0o600 });
    rmSync(join(linked.working, '.env.staging'));
    symlinkSync(original, join(linked.working, '.env.staging'));
    assert.throws(
      () => inspectStagingPersistentSourceReadonly({ rootDirectory: linked.root, run: linked.run }),
      /inspection failed/u,
    );
  } finally {
    linked.cleanup();
  }
});
