#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const reverseIndexEvidencePath =
  'docs/evidence/release-readiness/wp160-source-binding-reverse-index-20260915.json';
export const currentWp160EvidencePath =
  'docs/evidence/release-readiness/wp160-special-category-health-data-intake-minimization-safety-20260915.json';
export const currentMutableBindingRoots = Object.freeze([
  'docs/evidence/external-gates',
  'store',
]);
const historicalBindingRoot = 'docs/evidence/release-readiness';
const reverseIndexSearchRoots = Object.freeze([
  historicalBindingRoot,
  ...currentMutableBindingRoots,
]);

// These are the WP160 implementation paths whose source changes can fan out
// into already captured package evidence. The list is intentionally narrow:
// common coordination documents are mutable bindings but are not source edges.
export const baselineHead = 'c092cfe84965251f36a8f70525a49082f0959d63';
export const precommitTargetRevision = 'WORKTREE_STAGED';

const revisionJsonListCache = new Map();
const revisionJsonCache = new Map();
const candidateJsonCache = new Map();
const revisionPathSetCache = new Map();
const reverseIndexMetrics = { gitGrepCalls: 0 };

export function clearReverseIndexCaches() {
  revisionJsonListCache.clear();
  revisionJsonCache.clear();
  candidateJsonCache.clear();
  revisionPathSetCache.clear();
}

export function clearReverseIndexMetrics() {
  reverseIndexMetrics.gitGrepCalls = 0;
}

export function getReverseIndexMetrics() {
  return { ...reverseIndexMetrics };
}

function gitLines(repositoryRoot, args) {
  return execFileSync('git', ['-C', repositoryRoot, ...args], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export function deriveChangedSourcePaths({
  repositoryRoot = root,
  targetRevision,
  baselineRevision = baselineHead,
} = {}) {
  const implicitCurrentTarget = targetRevision === undefined;
  const target = targetRevision ?? gitLines(repositoryRoot, ['rev-parse', 'HEAD'])[0];
  const changed = new Set([
    ...(target === precommitTargetRevision
      ? gitLines(repositoryRoot, ['diff', '--name-only', baselineRevision])
      : gitLines(repositoryRoot, ['diff', '--name-only', baselineRevision, target])),
  ]);
  if (target === precommitTargetRevision || (implicitCurrentTarget
    && target === gitLines(repositoryRoot, ['rev-parse', 'HEAD'])[0])) {
    for (const path of gitLines(repositoryRoot, ['ls-files', '--others', '--exclude-standard'])) {
      changed.add(path);
    }
  }
  changed.delete(reverseIndexEvidencePath);
  return [...changed].sort();
}

function fail(message) {
  throw new Error(`WP160 reverse source index ${message}.`);
}

function inventoryPaths(value) {
  const paths = new Set();
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const entry of node) {
        if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
          paths.add(entry.path);
        }
        visit(entry);
      }
      return;
    }
    for (const [key, entry] of Object.entries(node)) {
      if (key === 'sourceInventory' && entry && typeof entry === 'object') {
        if (Array.isArray(entry)) {
          for (const item of entry) {
            if (item && typeof item.path === 'string') paths.add(item.path);
          }
        } else {
          for (const item of Object.keys(entry)) paths.add(item);
        }
      }
      visit(entry);
    }
  };
  visit(value);
  return [...paths];
}

function historicalBindings(repositoryRoot, changedSourcePaths, targetRevision, candidateFiles = null) {
  const evidenceFiles = jsonFilesAtRevision(
    repositoryRoot,
    historicalBindingRoot,
    targetRevision,
    candidateFiles,
  );
  return evidenceFiles
    .filter((file) => file !== reverseIndexEvidencePath
      && file !== currentWp160EvidencePath)
    .map((file) => ({
      name: file.slice(historicalBindingRoot.length + 1),
      value: readJsonAtRevision(repositoryRoot, file, targetRevision),
    }))
    .map(({ name, value }) => ({
      evidence: `${historicalBindingRoot}/${name}`,
      paths: inventoryPaths(value).filter((path) => changedSourcePaths.includes(path)).sort(),
    }))
    .filter(({ paths }) => paths.length > 0)
    .sort((left, right) => left.evidence.localeCompare(right.evidence));
}

function candidateJsonFilesAtRevision(repositoryRoot, changedSourcePaths, revision) {
  if (changedSourcePaths.length === 0) return [];
  if (revision === precommitTargetRevision) {
    return reverseIndexSearchRoots
      .flatMap((rootPath) => jsonFilesUnder(repositoryRoot, rootPath))
      .sort();
  }

  const changedDigest = createHash('sha256')
    .update(changedSourcePaths.join('\0'))
    .digest('hex');
  const cacheKey = `${repositoryRoot}\0${revision}\0${changedDigest}`;
  const cached = candidateJsonCache.get(cacheKey);
  if (cached !== undefined) return cached;

  reverseIndexMetrics.gitGrepCalls += 1;
  const args = [
    '-C', repositoryRoot,
    'grep', '-l', '-F',
    ...changedSourcePaths.flatMap((path) => ['-e', path]),
    revision,
    '--',
    ...reverseIndexSearchRoots,
  ];
  let output;
  try {
    output = execFileSync('git', args, { encoding: 'utf8' });
  } catch (error) {
    // git grep uses status 1 for a valid search with no matches. Any other
    // status is a repository/search failure and must fail the validator.
    if (error?.status === 1) {
      candidateJsonCache.set(cacheKey, []);
      return [];
    }
    fail(`git grep candidate discovery failed${error?.status ? ` (status ${error.status})` : ''}`);
  }
  const files = output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(':');
      return separator < 0 ? line : line.slice(separator + 1);
    })
    .filter((file) => file.endsWith('.json'))
    .sort();
  candidateJsonCache.set(cacheKey, files);
  return files;
}

function filesForRoot(files, rootPath) {
  const prefix = `${rootPath}/`;
  return files.filter((file) => file.startsWith(prefix));
}

function jsonFilesUnder(repositoryRoot, relativeRoot) {
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile() && entry.name.endsWith('.json')) found.push(child);
    }
  };
  visit(resolve(repositoryRoot, relativeRoot));
  return found.map((file) => file.slice(repositoryRoot.length + 1)).sort();
}

function jsonFilesAtRevision(repositoryRoot, relativeRoot, revision, candidateFiles = null) {
  if (candidateFiles !== null) return filesForRoot(candidateFiles, relativeRoot);
  if (revision === precommitTargetRevision) return jsonFilesUnder(repositoryRoot, relativeRoot);
  const cacheKey = `${repositoryRoot}\0${revision}\0${relativeRoot}`;
  const cached = revisionJsonListCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const files = gitLines(repositoryRoot, ['ls-tree', '-r', '--name-only', revision, '--', relativeRoot])
    .filter((file) => file.endsWith('.json'))
    .sort();
  revisionJsonListCache.set(cacheKey, files);
  return files;
}

function readJsonAtRevision(repositoryRoot, binding, revision) {
  if (revision === precommitTargetRevision) {
    return JSON.parse(readFileSync(resolve(repositoryRoot, binding), 'utf8'));
  }
  const cacheKey = `${repositoryRoot}\0${revision}\0${binding}`;
  const cached = revisionJsonCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const value = JSON.parse(execFileSync('git', ['-C', repositoryRoot, 'show', `${revision}:${binding}`], {
    encoding: 'utf8',
  }));
  revisionJsonCache.set(cacheKey, value);
  return value;
}

function existsAtRevision(repositoryRoot, relativePath, revision) {
  if (revision === precommitTargetRevision) {
    try {
      statSync(resolve(repositoryRoot, relativePath));
      return true;
    } catch {
      return false;
    }
  }
  const cacheKey = `${repositoryRoot}\0${revision}`;
  let paths = revisionPathSetCache.get(cacheKey);
  if (paths === undefined) {
    paths = new Set(gitLines(repositoryRoot, ['ls-tree', '-r', '--name-only', revision]));
    revisionPathSetCache.set(cacheKey, paths);
  }
  return paths.has(relativePath);
}

export function deriveCurrentMutableBindings(
  repositoryRoot,
  changedSourcePaths,
  targetRevision = precommitTargetRevision,
  candidateFiles = null,
) {
  return currentMutableBindingRoots
    .flatMap((rootPath) => jsonFilesAtRevision(
      repositoryRoot,
      rootPath,
      targetRevision,
      candidateFiles,
    ))
    .sort()
    .map((binding) => {
      let value;
      try {
        value = readJsonAtRevision(repositoryRoot, binding, targetRevision);
      } catch {
        fail(`current mutable binding is missing or invalid: ${binding}`);
      }
      return {
        binding,
        paths: inventoryPaths(value)
          .filter((path) => changedSourcePaths.includes(path))
          .sort(),
      };
    })
    .filter(({ paths }) => paths.length > 0);
}

export function deriveWp160ReverseIndex({
  repositoryRoot = root,
  targetRevision,
  baselineRevision = baselineHead,
} = {}) {
  const changedSourcePaths = deriveChangedSourcePaths({
    repositoryRoot,
    targetRevision,
    baselineRevision,
  });
  const effectiveTarget = targetRevision ?? gitLines(repositoryRoot, ['rev-parse', 'HEAD'])[0];
  const mutableBindingFiles = [...changedSourcePaths, reverseIndexEvidencePath];
  for (const path of mutableBindingFiles) {
    if (!existsAtRevision(repositoryRoot, path, effectiveTarget)) {
      fail(`mutable binding is missing: ${path}`);
    }
  }
  const candidateFiles = candidateJsonFilesAtRevision(
    repositoryRoot,
    changedSourcePaths,
    effectiveTarget,
  );
  const historical = historicalBindings(
    repositoryRoot,
    changedSourcePaths,
    effectiveTarget,
    candidateFiles,
  );
  const current = deriveCurrentMutableBindings(
    repositoryRoot,
    changedSourcePaths,
    effectiveTarget,
    candidateFiles,
  );
  return {
    schemaVersion: 1,
    package: 'WP160-SOURCE-BINDING-REVERSE-INDEX-20260915',
    repository: {
      baselineHead: baselineRevision,
      targetRevision: effectiveTarget,
    },
    changedSourcePaths,
    mutableBindings: [...mutableBindingFiles],
    currentMutableBindings: current,
    immutableHistoricalBindings: historical,
    boundaries: {
      historicalEvidenceRewritten: false,
      currentMutableClosureRequired: true,
      repeatedFullRegressionSubstitutesForReverseIndex: false,
    },
  };
}

export function validateWp160ReverseIndex({ repositoryRoot = root, evidence } = {}) {
  const value = evidence ?? JSON.parse(readFileSync(resolve(repositoryRoot, reverseIndexEvidencePath), 'utf8'));
  const targetRevision = value.repository?.targetRevision;
  if (typeof targetRevision !== 'string'
      || (!/^[a-f0-9]{40}$/u.test(targetRevision) && targetRevision !== precommitTargetRevision)) {
    fail('evidence target revision is missing or invalid');
  }
  const derived = deriveWp160ReverseIndex({
    repositoryRoot,
    baselineRevision: value.repository?.baselineHead,
    targetRevision,
  });
  if (JSON.stringify(value) !== JSON.stringify(derived)) fail('evidence does not match the machine-derived closure');
  return { changedSources: derived.changedSourcePaths.length, historicalBindings: derived.immutableHistoricalBindings.length };
}

function main() {
  const result = validateWp160ReverseIndex();
  console.log(`WP160 reverse source index valid: changed=${result.changedSources}, historical=${result.historicalBindings}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
