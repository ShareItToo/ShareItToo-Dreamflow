#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

// These are the WP160 implementation paths whose source changes can fan out
// into already captured package evidence. The list is intentionally narrow:
// common coordination documents are mutable bindings but are not source edges.
export const baselineHead = 'c092cfe84965251f36a8f70525a49082f0959d63';
export const precommitTargetRevision = 'WORKTREE_STAGED';

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
  const target = targetRevision ?? gitLines(repositoryRoot, ['rev-parse', 'HEAD'])[0];
  const changed = new Set([
    ...(target === precommitTargetRevision
      ? gitLines(repositoryRoot, ['diff', '--name-only', baselineRevision])
      : gitLines(repositoryRoot, ['diff', '--name-only', baselineRevision, target])),
  ]);
  if (target === precommitTargetRevision || target === gitLines(repositoryRoot, ['rev-parse', 'HEAD'])[0]) {
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

function historicalBindings(repositoryRoot, changedSourcePaths) {
  const evidenceRoot = resolve(repositoryRoot, 'docs/evidence/release-readiness');
  const evidenceFiles = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory, { withFileTypes: true })) {
      const child = resolve(directory, name.name);
      if (name.isDirectory()) visit(child);
      else if (name.isFile() && name.name.endsWith('.json')) evidenceFiles.push(child);
    }
  };
  visit(evidenceRoot);
  return evidenceFiles
    .filter((file) => file !== resolve(repositoryRoot, reverseIndexEvidencePath)
      && file !== resolve(repositoryRoot, currentWp160EvidencePath))
    .map((file) => ({
      name: file.slice(evidenceRoot.length + 1),
      value: JSON.parse(readFileSync(file, 'utf8')),
    }))
    .map(({ name, value }) => ({
      evidence: `docs/evidence/release-readiness/${name}`,
      paths: inventoryPaths(value).filter((path) => changedSourcePaths.includes(path)).sort(),
    }))
    .filter(({ paths }) => paths.length > 0)
    .sort((left, right) => left.evidence.localeCompare(right.evidence));
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

export function deriveCurrentMutableBindings(repositoryRoot, changedSourcePaths) {
  return currentMutableBindingRoots
    .flatMap((rootPath) => jsonFilesUnder(repositoryRoot, rootPath))
    .sort()
    .map((binding) => {
      let value;
      try {
        value = JSON.parse(readFileSync(resolve(repositoryRoot, binding), 'utf8'));
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
  const mutableBindingFiles = [...changedSourcePaths, reverseIndexEvidencePath];
  for (const path of mutableBindingFiles) {
    try { statSync(resolve(repositoryRoot, path)); } catch { fail(`mutable binding is missing: ${path}`); }
  }
  const historical = historicalBindings(repositoryRoot, changedSourcePaths);
  const current = deriveCurrentMutableBindings(repositoryRoot, changedSourcePaths);
  return {
    schemaVersion: 1,
    package: 'WP160-SOURCE-BINDING-REVERSE-INDEX-20260915',
    repository: {
      baselineHead: baselineRevision,
      targetRevision: targetRevision ?? gitLines(repositoryRoot, ['rev-parse', 'HEAD'])[0],
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
