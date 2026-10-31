#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readFixtureEnvBootstrapManifest } from './promote_staging_web_fixture_env.mjs';
import {
  prepareCatalogActivationManifest,
  readCatalogActivationManifest,
  runCatalogActivation,
  sanitizeCatalogActivationError,
} from './staging_web_fixture_catalog_activation.mjs';
import { readStablePrivateFile } from './stable_private_file.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fail = (code) => { throw Object.assign(new Error(code), { code }); };

export function assertCatalogActivationHost({ uid = process.getuid?.(),
  nodeMajor = Number(process.versions.node.split('.')[0]) } = {}) {
  if (uid !== 0 || !Number.isInteger(nodeMajor) || nodeMajor < 22) {
    fail('catalog_activation_root_node22_required');
  }
}

export function readCleanCatalogActivationSource(run = execFileSync) {
  try {
    const status = run('git', ['-C', repositoryRoot, 'status', '--porcelain=v1', '--untracked-files=all'],
      { encoding: 'utf8' });
    const commit = run('git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    if (status !== '' || !/^[a-f0-9]{40}$/u.test(commit)) fail('catalog_activation_source_not_clean');
    return commit;
  } catch (error) {
    if (error?.code === 'catalog_activation_source_not_clean') throw error;
    fail('catalog_activation_git_readback_failed');
  }
}

export function readCatalogActivationEvidence(filePath, expectedSha256, {
  read = readStablePrivateFile,
} = {}) {
  const bytes = read(filePath, { encoding: null, expectedMode: 0o600,
    expectedUid: 0, expectedGid: 0, minBytes: 1, maxBytes: 256 * 1024,
    code: 'catalog_activation_input_evidence_metadata_invalid' });
  if (!/^[a-f0-9]{64}$/u.test(expectedSha256 ?? '') || hash(bytes) !== expectedSha256) {
    fail('catalog_activation_input_evidence_digest_invalid');
  }
  return bytes;
}

export function assertCatalogActivationPreparePaths(paths,
  envFile = '/docker/shareittoo/ops/green.env') {
  if (!Array.isArray(paths) || paths.length !== 6
      || paths.some((path) => typeof path !== 'string' || resolve(path) !== path)
      || new Set([...paths, envFile].map((path) => resolve(path))).size !== 7) {
    fail('catalog_activation_prepare_paths_alias');
  }
}

async function main(argv = process.argv.slice(2)) {
  assertCatalogActivationHost();
  const sourceCommit = readCleanCatalogActivationSource();
  if (argv[0] === '--prepare') {
    if (argv.length !== 10) fail('catalog_activation_prepare_usage');
    assertCatalogActivationPreparePaths([argv[1], argv[3], argv[5], argv[7], argv[8], argv[9]]);
    const bootstrapManifestBytes = readFixtureEnvBootstrapManifest(argv[1], argv[2]);
    const databaseEvidenceBytes = readCatalogActivationEvidence(argv[3], argv[4]);
    const loginEvidenceBytes = readCatalogActivationEvidence(argv[5], argv[6]);
    const result = await prepareCatalogActivationManifest({ sourceCommit,
      bootstrapManifestBytes, bootstrapManifestSha256: argv[2],
      databaseEvidenceBytes, databaseEvidenceSha256: argv[4],
      loginEvidenceBytes, loginEvidenceSha256: argv[6],
      backupFile: argv[7], evidenceFile: argv[8], outputFile: argv[9] });
    process.stdout.write(`${JSON.stringify(result)}\n`); return;
  }
  const execute = argv[0] === '--execute';
  if (argv.length !== (execute ? 3 : 0)) fail('catalog_activation_usage');
  const manifest = readCatalogActivationManifest(
    process.env.STAGING_WEB_FIXTURE_CATALOG_RUNTIME_MANIFEST ?? '',
    process.env.STAGING_WEB_FIXTURE_CATALOG_RUNTIME_MANIFEST_SHA256,
  );
  const bootstrapManifestBytes = readFixtureEnvBootstrapManifest(
    process.env.STAGING_WEB_FIXTURE_CATALOG_BOOTSTRAP_MANIFEST ?? '',
    process.env.STAGING_WEB_FIXTURE_CATALOG_BOOTSTRAP_MANIFEST_SHA256,
  );
  const databaseEvidenceBytes = readCatalogActivationEvidence(
    process.env.STAGING_WEB_FIXTURE_CATALOG_DATABASE_EVIDENCE ?? '',
    manifest.fixtureBinding.databasePreparationEvidenceSha256,
  );
  const loginEvidenceBytes = readCatalogActivationEvidence(
    process.env.STAGING_WEB_FIXTURE_CATALOG_LOGIN_EVIDENCE ?? '',
    manifest.fixtureBinding.loginProofEvidenceSha256,
  );
  const result = await runCatalogActivation({ manifest, bootstrapManifestBytes,
    databaseEvidenceBytes, loginEvidenceBytes, sourceCommit,
    evidenceFile: manifest.fixtureBinding.evidenceFile, execute,
    confirmSource: execute ? argv[1] : undefined, confirmRun: execute ? argv[2] : undefined });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { await main(); }
  catch (error) {
    process.stderr.write(`${JSON.stringify(sanitizeCatalogActivationError(error))}\n`);
    process.exitCode = 1;
  }
}
