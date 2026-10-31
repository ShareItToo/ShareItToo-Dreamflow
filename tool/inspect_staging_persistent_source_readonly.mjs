#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const apiContainer = 'shareittoo-staging-api';
const databaseContainer = 'shareittoo-staging-postgres';
const deploymentRoot = '/docker/shareittoo';
const stagingProjectPattern = /staging/iu;

export class StagingPersistentSourceReadonlyError extends Error {
  constructor(code) {
    super('Staging persistent-source inspection failed.');
    this.code = code;
  }
}

function fail(code) {
  throw new StagingPersistentSourceReadonlyError(code);
}

function defaultRun(command, args) {
  try {
    return String(execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })).trim();
  } catch {
    fail('command_failed');
  }
}

function regularMetadata(path, { ownerOnly = false, executable = false } = {}) {
  let link;
  let metadata;
  try {
    link = lstatSync(path);
    metadata = statSync(path);
  } catch {
    fail('persistent_source_missing');
  }
  if (link.isSymbolicLink() || !metadata.isFile() || metadata.size < 1) {
    fail('persistent_source_unsafe');
  }
  if (ownerOnly && (metadata.mode & 0o077) !== 0) fail('persistent_source_permissions');
  if (executable && (metadata.mode & 0o111) === 0) fail('persistent_release_script_not_executable');
  if ((metadata.mode & 0o022) !== 0) fail('persistent_source_writable_by_group_or_other');
  return Object.freeze({
    regular: true,
    symlink: false,
    ownerOnly,
    executable,
  });
}

function regularDirectory(path, { ownerOnly = false } = {}) {
  let link;
  let metadata;
  try {
    link = lstatSync(path);
    metadata = statSync(path);
  } catch {
    fail('persistent_directory_missing');
  }
  if (link.isSymbolicLink() || !metadata.isDirectory()) fail('persistent_directory_unsafe');
  if (ownerOnly && (metadata.mode & 0o077) !== 0) fail('persistent_directory_permissions');
  if ((metadata.mode & 0o022) !== 0) fail('persistent_directory_writable_by_group_or_other');
  return Object.freeze({ regular: true, symlink: false, ownerOnly });
}

function containedPath(root, path, code) {
  const normalizedRoot = resolve(root);
  const normalizedPath = resolve(path);
  if (!normalizedPath.startsWith(`${normalizedRoot}/`)) fail(code);
  return normalizedPath;
}

function dockerLabel(run, container, name) {
  const value = run('docker', [
    'inspect', '--format', `{{ index .Config.Labels ${JSON.stringify(name)} }}`, container,
  ]);
  if (typeof value !== 'string' || value.trim() === '' || value.trim() === '<no value>') {
    fail('compose_label_missing');
  }
  return value.trim();
}

function composeMetadata(run, container) {
  return Object.freeze({
    project: dockerLabel(run, container, 'com.docker.compose.project'),
    workingDirectory: dockerLabel(run, container, 'com.docker.compose.project.working_dir'),
    configFiles: dockerLabel(run, container, 'com.docker.compose.project.config_files'),
  });
}

function parseConfigFiles(value) {
  const files = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  if (files.length !== 5 || new Set(files).size !== files.length) fail('compose_config_count_invalid');
  return files;
}

function namedVolumeCount(run, container) {
  const raw = run('docker', [
    'inspect', '--format', '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{"\\n"}}{{end}}{{end}}', container,
  ]);
  const names = raw.split(/\r?\n/u).map((entry) => entry.trim()).filter(Boolean);
  if (names.length === 0 || names.some((name) => !stagingProjectPattern.test(name))) {
    fail('staging_volume_binding_invalid');
  }
  return names.length;
}

export function inspectStagingPersistentSourceReadonly({
  run = defaultRun,
  rootDirectory = deploymentRoot,
} = {}) {
  const root = realpathSync(rootDirectory);
  regularDirectory(root);
  const api = composeMetadata(run, apiContainer);
  const database = composeMetadata(run, databaseContainer);
  if (!stagingProjectPattern.test(api.project)
      || !stagingProjectPattern.test(database.project)
      || api.project !== database.project) {
    fail('compose_project_binding_invalid');
  }

  const configuredWorkingDirectory = resolve(api.workingDirectory);
  regularDirectory(configuredWorkingDirectory);
  const workingDirectory = realpathSync(configuredWorkingDirectory);
  containedPath(root, workingDirectory, 'working_directory_outside_root');
  const configFiles = parseConfigFiles(api.configFiles);
  const persistentConfigs = configFiles.map((path) => {
    const configured = resolve(path);
    regularMetadata(configured);
    const contained = realpathSync(configured);
    containedPath(workingDirectory, contained, 'compose_config_outside_working_directory');
    return contained;
  });
  const overrideDirectory = resolve(workingDirectory, '.runtime-overrides');
  regularDirectory(overrideDirectory, { ownerOnly: true });
  const overrideFiles = readdirSync(overrideDirectory)
    .filter((name) => name.endsWith('.yml'))
    .map((name) => resolve(overrideDirectory, name));
  if (overrideFiles.length < 1 || !persistentConfigs.some((path) => path.startsWith(`${overrideDirectory}/`))) {
    fail('persistent_runtime_override_missing');
  }
  overrideFiles.forEach((path) => regularMetadata(path, { ownerOnly: true }));
  regularMetadata(resolve(workingDirectory, '.env.staging'), { ownerOnly: true });
  regularMetadata(resolve(workingDirectory, 'ops', 'deploy_release.sh'), { executable: true });

  const databaseVolumeCount = namedVolumeCount(run, databaseContainer);
  const apiVolumeCount = namedVolumeCount(run, apiContainer);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-staging-persistent-source-readonly-inventory',
    status: 'passed-read-only',
    environment: 'staging',
    compose: {
      projectClass: 'staging',
      activeConfigFileCount: persistentConfigs.length,
      activeConfigFilesPersistentRegular: true,
      activeConfigFilesContainedInWorkingDirectory: true,
      apiAndDatabaseProjectBindingMatches: true,
    },
    persistentSource: {
      workingDirectoryRegular: true,
      environmentFileRegularOwnerOnly: true,
      releaseScriptRegularExecutable: true,
      runtimeOverrideDirectoryRegularOwnerOnly: true,
      retainedRuntimeOverrideCount: overrideFiles.length,
    },
    volumes: {
      apiNamedVolumeCount: apiVolumeCount,
      databaseNamedVolumeCount: databaseVolumeCount,
      allNamedVolumesBoundToStagingProject: true,
    },
    boundaries: {
      configurationContentsRead: false,
      credentialContentsRead: false,
      containerConfigurationDumped: false,
      remoteSourceChanged: false,
      containerChanged: false,
      stagingDataChanged: false,
      deploymentPerformed: false,
      productionChanged: false,
      pathsEmitted: false,
      volumeNamesEmitted: false,
    },
  });
}
