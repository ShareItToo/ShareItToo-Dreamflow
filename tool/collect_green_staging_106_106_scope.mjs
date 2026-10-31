#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { collectGreenScope } from '../backend/ops/green_staging_106_106_scope_collector.mjs';
import { requireBinding } from '../backend/ops/green_staging_106_106_binding.mjs';

const accepted = new Set(['runtime-commit', 'api-container-name', 'database-container-name', 'internal-network-name',
  'external-network-name', 'uploads-volume-name', 'database-user', 'database-name', 'evidence-directory', 'output-name']);

export function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const raw = args[index];
    const key = typeof raw === 'string' && raw.startsWith('--') ? raw.slice(2) : '';
    const value = args[index + 1];
    requireBinding(accepted.has(key) && !values.has(key) && typeof value === 'string'
      && value.length > 0 && !value.startsWith('--'), 'scope_arguments');
    values.set(key, value);
  }
  requireBinding(values.size === accepted.size && [...accepted].every(key => values.has(key)), 'scope_arguments');
  return {
    runtimeCommit: values.get('runtime-commit'),
    apiContainerName: values.get('api-container-name'),
    databaseContainerName: values.get('database-container-name'),
    internalNetworkName: values.get('internal-network-name'),
    externalNetworkName: values.get('external-network-name'),
    uploadsVolumeName: values.get('uploads-volume-name'),
    databaseUser: values.get('database-user'),
    databaseName: values.get('database-name'),
    evidenceDirectory: values.get('evidence-directory'),
    outputName: values.get('output-name'),
  };
}

export function runCli(args, { stdout = process.stdout, stderr = process.stderr, dependencies } = {}) {
  try {
    const result = collectGreenScope(parseArguments(args), dependencies);
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch {
    stderr.write('green_106_106_scope_collect_failed\n');
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = runCli(process.argv.slice(2));
}
