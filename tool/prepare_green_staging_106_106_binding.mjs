#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { closeArtifact, openArtifact, privateDirectory, verifyArtifact, writeArtifact } from '../backend/ops/green_staging_98_106_evidence.mjs';
import { digest, equal, repositoryRoot } from '../backend/ops/green_staging_98_106_contract.mjs';
import { requireBinding, successorSourcePaths, validateSuccessorSource } from '../backend/ops/green_staging_106_106_binding.mjs';
import { validateSuccessorPublication } from '../backend/ops/green_staging_106_106_contract.mjs';

const hash = /^[a-f0-9]{64}$/u;
const fullCommit = /^[a-f0-9]{40}$/u;
const imageId = /^sha256:[a-f0-9]{64}$/u;
const safeName = /^[a-z0-9][a-z0-9._-]{0,150}$/u;
const allowed = new Set(['runtime-commit', 'ops-commit', 'reviewed-commit', 'publication', 'publication-sha256',
  'scope', 'scope-sha256', 'candidate-image-id', 'evidence-directory', 'output-name']);
const gitRead = (args, root) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });

export function parseArguments(args) {
  const result = {}, seen = new Set();
  for (let index = 0; index < args.length; index += 2) {
    const raw = args[index];
    const key = typeof raw === 'string' && raw.startsWith('--') ? raw.slice(2) : '';
    const value = args[index + 1];
    requireBinding(allowed.has(key) && !seen.has(key) && typeof value === 'string' && value.length > 0
      && !value.startsWith('--'), 'binding_arguments');
    seen.add(key);
    result[key] = value;
  }
  requireBinding([...allowed].every(key => seen.has(key)), 'binding_arguments');
  requireBinding(fullCommit.test(result['runtime-commit']) && fullCommit.test(result['ops-commit'])
    && fullCommit.test(result['reviewed-commit']) && hash.test(result['publication-sha256'])
    && hash.test(result['scope-sha256']) && imageId.test(result['candidate-image-id'])
    && path.isAbsolute(result['publication']) && path.normalize(result['publication']) === result['publication']
    && path.isAbsolute(result.scope) && path.normalize(result.scope) === result.scope
    && path.isAbsolute(result['evidence-directory']) && path.normalize(result['evidence-directory']) === result['evidence-directory']
    && safeName.test(result['output-name']), 'binding_arguments');
  return result;
}

function parseJson(bytes, code) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error(`green_106_106_${code}`); }
}

export function createBindingRecord({ runtimeCommit, opsCommit, reviewedCommit, publicationBytes, publicationSha256,
  scope, candidateImageId, sourceInventory }) {
  requireBinding(fullCommit.test(runtimeCommit ?? '') && fullCommit.test(opsCommit ?? '')
    && fullCommit.test(reviewedCommit ?? '') && hash.test(publicationSha256 ?? '')
    && imageId.test(candidateImageId ?? '') && sourceInventory && typeof sourceInventory === 'object'
    && Object.getPrototypeOf(sourceInventory) === Object.prototype, 'binding_shape');
  validateSuccessorPublication(publicationBytes, { publicationSha256, runtimeCommit });
  validateScopeShape(scope);
  return {
    kind: 'sit-green-staging-106-106-binding',
    schemaVersion: 1,
    opsCommit,
    reviewedCommit,
    runtimeCommit,
    publicationSha256,
    candidateImageId,
    sourceInventory,
    scope,
  };
}

function validateScopeShape(scope) {
  requireBinding(scope && equal(Object.keys(scope).sort(), ['api', 'database', 'databaseName', 'databaseUser', 'networks', 'uploads', 'witnesses']), 'scope');
  requireBinding(Array.isArray(scope.witnesses), 'scope_inventory');
  const containers = [scope.api, scope.database, ...scope.witnesses];
  for (const container of containers) {
    requireBinding(container && equal(Object.keys(container).sort(),
      ['id', 'imageDigest', 'imageId', 'name', ...(container === scope.api ? ['runtimeCommit'] : [])].sort())
      && hash.test(container.id) && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u.test(container.name)
      && imageId.test(container.imageId) && imageId.test(container.imageDigest), 'scope_container');
  }
  requireBinding(/^[a-f0-9]{40}$/u.test(scope.api.runtimeCommit)
    && new Set(containers.map(container => container.id)).size === containers.length
    && new Set(containers.map(container => container.name)).size === containers.length, 'scope_inventory');
  requireBinding(Array.isArray(scope.networks) && scope.networks.length === 2
    && scope.networks.every(network => network && equal(Object.keys(network).sort(), ['id', 'internal', 'name'])
      && hash.test(network.id) && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u.test(network.name)
      && typeof network.internal === 'boolean')
    && new Set(scope.networks.map(network => network.id)).size === 2
    && new Set(scope.networks.map(network => network.name)).size === 2
    && scope.networks.filter(network => network.internal).length === 1
    && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/u.test(scope.uploads)
    && ['databaseName', 'databaseUser'].every(key => typeof scope[key] === 'string' && /^[a-z][a-z0-9_]+$/u.test(scope[key])),
  'scope_networks');
}

function readBoundArtifact(filename, expectedSha256, code) {
  const handle = openArtifact(filename);
  try {
    const { bytes, sha256 } = verifyArtifact(handle, { expectedDigest: expectedSha256, maxBytes: 4 * 1024 * 1024 });
    return { handle, bytes, sha256, value: parseJson(bytes, code) };
  } catch (error) {
    closeArtifact(handle);
    throw error;
  }
}

export function prepareBinding(options, { root = repositoryRoot, git = gitRead } = {}) {
  const publication = readBoundArtifact(options.publication, options.publicationSha256, 'publication_json');
  const scope = readBoundArtifact(options.scope, options.scopeSha256, 'scope_json');
  try {
    const sourceInventory = Object.fromEntries(successorSourcePaths(root).map(relative => [
      relative,
      digest(fs.readFileSync(path.join(root, relative))),
    ]));
    const binding = createBindingRecord({
      runtimeCommit: options.runtimeCommit,
      opsCommit: options.opsCommit,
      reviewedCommit: options.reviewedCommit,
      publicationBytes: publication.bytes,
      publicationSha256: publication.sha256,
      scope: scope.value,
      candidateImageId: options.candidateImageId,
      sourceInventory,
    });
    // The collector independently repeats this check. Do it before writing so
    // an uncommitted, stale, or unreviewed source tree cannot yield a binding.
    validateSuccessorSource(binding, { root, git });
    const directory = privateDirectory(options.evidenceDirectory);
    const artifact = writeArtifact(directory, options.outputName, binding);
    return Object.freeze({
      status: 'binding_prepared',
      artifact: artifact.name,
      bindingSha256: artifact.sha256,
      bindingContentSha256: artifact.contentSha256,
      sourceInventoryCount: Object.keys(sourceInventory).length,
      runtimeCommit: binding.runtimeCommit,
      opsCommit: binding.opsCommit,
      reviewedCommit: binding.reviewedCommit,
    });
  } finally {
    publication.bytes.fill(0);
    scope.bytes.fill(0);
    closeArtifact(publication.handle);
    closeArtifact(scope.handle);
  }
}

export function runCli(args, { stdout = process.stdout, stderr = process.stderr, dependencies } = {}) {
  try {
    const parsed = parseArguments(args);
    const result = prepareBinding({
      runtimeCommit: parsed['runtime-commit'],
      opsCommit: parsed['ops-commit'],
      reviewedCommit: parsed['reviewed-commit'],
      publication: parsed.publication,
      publicationSha256: parsed['publication-sha256'],
      scope: parsed.scope,
      scopeSha256: parsed['scope-sha256'],
      candidateImageId: parsed['candidate-image-id'],
      evidenceDirectory: parsed['evidence-directory'],
      outputName: parsed['output-name'],
    }, dependencies);
    stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch {
    stderr.write('green_106_106_binding_prepare_failed\n');
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url) {
  process.exitCode = runCli(process.argv.slice(2));
}
