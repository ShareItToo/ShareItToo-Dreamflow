#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const imageRepository = 'ghcr.io/shareittoo/shareittoo-api';
const defaultSshHost = 'sit-staging-vps';

function fail(message) {
  throw new Error(message);
}

function defaultRun(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    }).trim();
  } catch {
    fail('WP139 read-only registry command failed.');
  }
}

function sshArguments(host, remoteCommand) {
  return ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', host, remoteCommand];
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    fail(`WP139 ${label} is not valid JSON.`);
  }
}

function parseRuntime(value) {
  const parts = value.split('|');
  if (parts.length !== 5) fail('WP139 runtime observation is invalid.');
  const [image, imageId, revision, version, restartCount] = parts;
  if (!new RegExp(`^${imageRepository}:[a-f0-9]{40}$`, 'u').test(image)
      || !/^sha256:[a-f0-9]{64}$/u.test(imageId)
      || !/^[a-f0-9]{40}$/u.test(revision)
      || version !== `0.1.0-${revision.slice(0, 12)}`
      || !/^\d+$/u.test(restartCount)) {
    fail('WP139 runtime observation is invalid.');
  }
  return {
    image,
    imageId,
    revision,
    version,
    restartCount: Number(restartCount),
  };
}

function manifestDescriptor(value) {
  const entries = Array.isArray(value) ? value : [value];
  if (entries.length !== 1) fail('WP139 registry manifest count is invalid.');
  const descriptor = entries[0]?.Descriptor;
  if (!descriptor
      || !/^sha256:[a-f0-9]{64}$/u.test(descriptor.digest ?? '')
      || descriptor.platform?.os !== 'linux'
      || descriptor.platform?.architecture !== 'amd64') {
    fail('WP139 registry manifest descriptor is invalid.');
  }
  return descriptor;
}

function imageLabels(value) {
  const config = value?.config ?? value?.Config;
  const labels = config?.Labels ?? config?.labels;
  const architecture = value?.architecture ?? value?.Architecture;
  const os = value?.os ?? value?.Os;
  if (!labels || architecture !== 'amd64' || os !== 'linux') {
    fail('WP139 registry image configuration is invalid.');
  }
  return labels;
}

export function wp139ReadOnlyRemoteCommands(commit) {
  if (!/^[a-f0-9]{40}$/u.test(commit)) fail('WP139 commit is invalid.');
  const image = `${imageRepository}:${commit}`;
  return Object.freeze({
    dockerConfigMetadata:
      'stat -c \'{"mode":"%a","owner":"%U","size":%s}\' "$HOME/.docker/config.json"',
    runtime:
      'runtime_image=$(docker inspect --format \'{{.Config.Image}}\' shareittoo-staging-api) && '
      + 'runtime_id=$(docker inspect --format \'{{.Image}}\' shareittoo-staging-api) && '
      + 'runtime_revision=$(docker image inspect --format \'{{index .Config.Labels "org.opencontainers.image.revision"}}\' "$runtime_id") && '
      + 'runtime_version=$(docker image inspect --format \'{{index .Config.Labels "org.opencontainers.image.version"}}\' "$runtime_id") && '
      + 'runtime_restarts=$(docker inspect --format \'{{.RestartCount}}\' shareittoo-staging-api) && '
      + 'printf \'%s|%s|%s|%s|%s\\n\' "$runtime_image" "$runtime_id" "$runtime_revision" "$runtime_version" "$runtime_restarts"',
    manifest: `docker manifest inspect --verbose ${image}`,
    imageConfig:
      `docker buildx imagetools inspect ${image} --format '{{json .Image}}'`,
  });
}

export function auditStagingRegistryReadPath({
  commit,
  expectedDigest,
  sshHost = defaultSshHost,
  run = defaultRun,
} = {}) {
  if (!/^[a-f0-9]{40}$/u.test(commit ?? '')) fail('WP139 commit is invalid.');
  if (!/^sha256:[a-f0-9]{64}$/u.test(expectedDigest ?? '')) {
    fail('WP139 expected digest is invalid.');
  }
  if (!/^[A-Za-z0-9._-]+$/u.test(sshHost)) fail('WP139 SSH host is invalid.');

  const commands = wp139ReadOnlyRemoteCommands(commit);
  const invoke = (remoteCommand) => run('ssh', sshArguments(sshHost, remoteCommand));
  const dockerConfig = parseJson(invoke(commands.dockerConfigMetadata), 'Docker config metadata');
  if (dockerConfig?.mode !== '600'
      || dockerConfig?.owner !== 'root'
      || !Number.isSafeInteger(dockerConfig?.size)
      || dockerConfig.size < 2
      || dockerConfig.size > 16 * 1024) {
    fail('WP139 Docker config metadata is unsafe.');
  }

  const runtime = parseRuntime(invoke(commands.runtime));
  const descriptor = manifestDescriptor(parseJson(invoke(commands.manifest), 'manifest'));
  if (descriptor.digest !== expectedDigest) fail('WP139 registry digest does not match.');

  const labels = imageLabels(parseJson(invoke(commands.imageConfig), 'image configuration'));
  const expectedVersion = `0.1.0-${commit.slice(0, 12)}`;
  if (labels['org.opencontainers.image.revision'] !== commit
      || labels['org.opencontainers.image.version'] !== expectedVersion
      || !/^\d{4}-\d{2}-\d{2}T/u.test(labels['org.opencontainers.image.created'] ?? '')) {
    fail('WP139 registry image labels do not match.');
  }

  return Object.freeze({
    kind: 'sit-wp139-staging-registry-read-path-audit',
    status: 'authenticated-manifest-and-config-read-passed',
    target: {
      image: `${imageRepository}:${commit}`,
      digest: descriptor.digest,
      platform: 'linux/amd64',
      revision: commit,
      version: expectedVersion,
    },
    runtime,
    protectedDockerConfig: {
      present: true,
      mode: dockerConfig.mode,
      owner: dockerConfig.owner,
      sizeBytes: dockerConfig.size,
      credentialContentRead: false,
    },
    limits: {
      credentialScopeInspected: false,
      leastPrivilegeProven: false,
      layerPullPerformed: false,
      runtimeChanged: false,
      dockerLoginChanged: false,
      packageVisibilityChanged: false,
    },
  });
}

function argumentValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const result = auditStagingRegistryReadPath({
      commit: argumentValue(args, '--commit'),
      expectedDigest: argumentValue(args, '--expected-digest'),
      sshHost: argumentValue(args, '--ssh-host') ?? defaultSshHost,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'WP139 registry audit failed.'}\n`);
    process.exitCode = 1;
  }
}
