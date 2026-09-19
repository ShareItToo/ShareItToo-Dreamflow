#!/usr/bin/env node

import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = realpathSync(resolve(fileURLToPath(new URL('..', import.meta.url))));
const sourceReadyStatus = 'email-link-verified-ready-for-login';
const retiredStatuses = new Set([
  'email-linked-product-journey-retired',
  'email-verified-two-role-product-journey-retired',
]);

function fail(message) {
  throw new Error(message);
}

function defaultVaultRoot() {
  return resolve(
    homedir(),
    'Library',
    'Application Support',
    'ShareItToo',
    'qa',
  );
}

function assertOutsideRepository(path) {
  if (typeof path !== 'string' || !isAbsolute(path)) {
    fail('The private QA vault root must be absolute.');
  }
  const absolute = resolve(path);
  if (absolute === repositoryRoot || absolute.startsWith(`${repositoryRoot}${sep}`)) {
    fail('The private QA vault root must remain outside the repository.');
  }
  return absolute;
}

function ownerOnly(stat) {
  return (stat.mode & 0o077) === 0;
}

function safeVaultMetadata(value) {
  if (value?.schemaVersion !== 1 || value?.kind !== 'sit-staging-synthetic-account-vault') {
    return null;
  }
  if (typeof value.status !== 'string') return { state: 'invalid' };
  if (value.status === sourceReadyStatus) return { state: 'source-ready' };
  if (retiredStatuses.has(value.status)) return { state: 'retired' };
  return { state: 'other' };
}

function privateJsonFiles(root, { maxDepth = 8 } = {}) {
  const files = [];
  const unsafe = {
    symlink: 0,
    directory: 0,
    file: 0,
    depth: 0,
  };
  const visit = (directory, depth) => {
    if (depth > maxDepth) {
      unsafe.depth += 1;
      return;
    }
    const directoryStat = lstatSync(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || !ownerOnly(directoryStat)) {
      unsafe.directory += 1;
      return;
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = resolve(directory, entry.name);
      const stat = lstatSync(child);
      if (stat.isSymbolicLink()) {
        unsafe.symlink += 1;
      } else if (stat.isDirectory()) {
        visit(child, depth + 1);
      } else if (stat.isFile() && entry.name.endsWith('.json')) {
        if (!ownerOnly(stat) || stat.size === 0 || stat.size > 256 * 1024) {
          unsafe.file += 1;
        } else {
          files.push(child);
        }
      }
    }
  };
  visit(root, 0);
  return { files, unsafe };
}

/**
 * Audits only private-vault structure and lifecycle labels. It never emits a
 * filename, address, password, token, or other account value.
 */
export function auditStagingTwoRoleVaultReadiness({ vaultRoot = defaultVaultRoot() } = {}) {
  const root = assertOutsideRepository(vaultRoot);
  let rootStat;
  try {
    rootStat = lstatSync(root);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return Object.freeze({
        schemaVersion: 1,
        kind: 'sit-staging-two-role-vault-readiness',
        rootPresent: false,
        recognizedVaultCount: 0,
        activeSourceVaultCount: 0,
        retiredJourneyVaultCount: 0,
        otherRecognizedVaultCount: 0,
        invalidRecognizedVaultCount: 0,
        unsafeEntryCount: 0,
        unsafeEntryKinds: { symlink: 0, directory: 0, file: 0, depth: 0, invalidJson: 0 },
        freshSourceProvenanceAvailable: false,
        safeForFreshSourceProvisioning: true,
        containsCredentialMaterial: false,
        containsPrivatePath: false,
      });
    }
    throw error;
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || !ownerOnly(rootStat)) {
    fail('The private QA vault root is not an owner-only regular directory.');
  }

  const scanned = privateJsonFiles(root);
  let recognizedVaultCount = 0;
  let activeSourceVaultCount = 0;
  let retiredJourneyVaultCount = 0;
  let otherRecognizedVaultCount = 0;
  let invalidRecognizedVaultCount = 0;
  const unsafe = { ...scanned.unsafe, invalidJson: 0 };
  for (const file of scanned.files) {
    try {
      const metadata = safeVaultMetadata(JSON.parse(readFileSync(file, 'utf8')));
      if (!metadata) continue;
      recognizedVaultCount += 1;
      if (metadata.state === 'source-ready') activeSourceVaultCount += 1;
      else if (metadata.state === 'retired') retiredJourneyVaultCount += 1;
      else if (metadata.state === 'invalid') invalidRecognizedVaultCount += 1;
      else otherRecognizedVaultCount += 1;
    } catch {
      unsafe.invalidJson += 1;
    }
  }
  const unsafeEntryCount = Object.values(unsafe).reduce((total, value) => total + value, 0);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'sit-staging-two-role-vault-readiness',
    rootPresent: true,
    recognizedVaultCount,
    activeSourceVaultCount,
    retiredJourneyVaultCount,
    otherRecognizedVaultCount,
    invalidRecognizedVaultCount,
    unsafeEntryCount,
    unsafeEntryKinds: Object.freeze(unsafe),
    freshSourceProvenanceAvailable: false,
    safeForFreshSourceProvisioning: activeSourceVaultCount === 0
      && invalidRecognizedVaultCount === 0
      && unsafeEntryCount === 0,
    containsCredentialMaterial: false,
    containsPrivatePath: false,
  });
}

export function assertNoActiveStagingTwoRoleSource(result) {
  if (result?.kind !== 'sit-staging-two-role-vault-readiness'
      || result.activeSourceVaultCount !== 0
      || result.invalidRecognizedVaultCount !== 0
      || result.unsafeEntryCount !== 0
      || result.safeForFreshSourceProvisioning !== true
      || result.freshSourceProvenanceAvailable !== false) {
    fail('A fresh two-role source cannot be provisioned safely from the inspected QA vault state.');
  }
  return result;
}

function argumentValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) fail(`${name} requires a value.`);
  return value;
}

function main(args) {
  if (args.includes('--help')) {
    process.stdout.write('Usage: node tool/audit_staging_two_role_vault_readiness.mjs [--vault-root ABSOLUTE_PATH] [--expect-no-active-source]\n');
    return;
  }
  const result = auditStagingTwoRoleVaultReadiness({
    vaultRoot: argumentValue(args, '--vault-root') ?? defaultVaultRoot(),
  });
  if (args.includes('--expect-no-active-source')) assertNoActiveStagingTwoRoleSource(result);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`ERROR: ${error?.message ?? 'Private two-role vault audit failed safely.'}\n`);
    process.exitCode = 1;
  }
}
