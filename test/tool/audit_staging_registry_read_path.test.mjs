import assert from 'node:assert/strict';
import test from 'node:test';

import {
  auditStagingRegistryReadPath,
  wp139ReadOnlyRemoteCommands,
} from '../../tool/audit_staging_registry_read_path.mjs';

const commit = 'f'.repeat(40);
const digest = `sha256:${'a'.repeat(64)}`;

function successfulRunner(overrides = {}) {
  return (_command, args) => {
    const remote = args.at(-1);
    if (remote.startsWith('stat ')) return '{"mode":"600","owner":"root","size":135}';
    if (remote.startsWith('runtime_image=')) {
      return [
        `ghcr.io/shareittoo/shareittoo-api:${'1'.repeat(40)}`,
        `sha256:${'2'.repeat(64)}`,
        '1'.repeat(40),
        `0.1.0-${'1'.repeat(12)}`,
        '0',
      ].join('|');
    }
    if (remote.startsWith('docker manifest inspect')) {
      return JSON.stringify({
        Descriptor: {
          digest: overrides.digest ?? digest,
          platform: { os: 'linux', architecture: 'amd64' },
        },
      });
    }
    if (remote.startsWith('docker buildx imagetools inspect')) {
      return JSON.stringify({
        architecture: 'amd64',
        os: 'linux',
        config: {
          Labels: {
            'org.opencontainers.image.revision': overrides.revision ?? commit,
            'org.opencontainers.image.version': `0.1.0-${commit.slice(0, 12)}`,
            'org.opencontainers.image.created': '2026-09-13T11:00:00Z',
          },
        },
      });
    }
    throw new Error(`Unexpected command: ${remote}`);
  };
}

test('proves only authenticated manifest/config reads and preserves honest limits', () => {
  const result = auditStagingRegistryReadPath({
    commit,
    expectedDigest: digest,
    run: successfulRunner(),
  });
  assert.equal(result.status, 'authenticated-manifest-and-config-read-passed');
  assert.equal(result.target.digest, digest);
  assert.equal(result.protectedDockerConfig.credentialContentRead, false);
  assert.deepEqual(result.limits, {
    credentialScopeInspected: false,
    leastPrivilegeProven: false,
    layerPullPerformed: false,
    runtimeChanged: false,
    dockerLoginChanged: false,
    packageVisibilityChanged: false,
  });
});

test('rejects a registry digest or immutable revision mismatch', () => {
  assert.throws(
    () => auditStagingRegistryReadPath({
      commit,
      expectedDigest: digest,
      run: successfulRunner({ digest: `sha256:${'b'.repeat(64)}` }),
    }),
    /digest does not match/u,
  );
  assert.throws(
    () => auditStagingRegistryReadPath({
      commit,
      expectedDigest: digest,
      run: successfulRunner({ revision: 'e'.repeat(40) }),
    }),
    /labels do not match/u,
  );
});

test('remote command inventory is read-only and never emits credential content', () => {
  const commands = wp139ReadOnlyRemoteCommands(commit);
  const serialized = Object.values(commands).join('\n');
  assert.doesNotMatch(serialized, /\bdocker\s+(?:login|logout|pull|push|run|rm|rmi|tag)\b/u);
  assert.doesNotMatch(serialized, /\b(?:cat|base64|jq)\b|auths|identitytoken|password|token/iu);
  assert.match(commands.manifest, /^docker manifest inspect --verbose /u);
  assert.match(commands.imageConfig, /^docker buildx imagetools inspect /u);
});
