#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const commitPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
const sourcePathPattern = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;
const snapshotCache = new Map();
const sourceBytesCache = new Map();
const snapshotRegistry = new WeakSet();
export const boundSnapshotAttestationBrand = Symbol('sit.boundSnapshotAttestation');

function assertSafePath(path) {
  if (!sourcePathPattern.test(String(path ?? '')) || String(path).includes('\\')) {
    throw new Error(`bound source path invalid: ${path}`);
  }
}

function assertRevision(revision, label = 'bound source revision') {
  if (!commitPattern.test(String(revision ?? ''))) {
    throw new Error(`${label} invalid: ${revision}`);
  }
}

function inventoryDigest(inventory) {
  return createHash('sha256')
    .update(Object.entries(inventory)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([path, digest]) => `${path}\0${digest}\n`)
      .join(''))
    .digest('hex');
}

function readAtRevision(repositoryRoot, revision, path) {
  assertRevision(revision);
  assertSafePath(path);
  const cacheKey = `${repositoryRoot}\0${revision}\0${path}`;
  const cached = sourceBytesCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const bytes = execFileSync('git', ['-C', repositoryRoot, 'show', `${revision}:${path}`], {
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  sourceBytesCache.set(cacheKey, bytes);
  return bytes;
}

function assertDigest(digest, label) {
  if (!digestPattern.test(String(digest ?? ''))) throw new Error(`${label} invalid: ${digest}`);
}

/** Resolve one coherent immutable commit for a complete historical inventory. */
export function resolveBoundSnapshot({
  repositoryRoot,
  baselineHead,
  inventory,
  anchorPath,
  finalHead,
  exactRevision = false,
} = {}) {
  assertRevision(baselineHead, 'bound snapshot baseline');
  if (inventory === null || typeof inventory !== 'object' || Array.isArray(inventory)) {
    throw new Error('bound snapshot inventory invalid');
  }
  const entries = Object.entries(inventory);
  if (entries.length === 0) throw new Error('bound snapshot inventory empty');
  for (const [path, digest] of entries) {
    assertSafePath(path);
    assertDigest(digest, `bound snapshot digest ${path}`);
  }
  if (anchorPath !== undefined) assertSafePath(anchorPath);
  const digest = inventoryDigest(inventory);
  const cacheKey = `${repositoryRoot}\0${baselineHead}\0${anchorPath ?? ''}\0${finalHead ?? ''}\0${exactRevision ? 'exact' : 'search'}\0${digest}`;
  const cached = snapshotCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const head = execFileSync('git', ['-C', repositoryRoot, 'rev-parse', '--verify', 'HEAD'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  assertRevision(head, 'current branch head');
  try {
    execFileSync('git', ['-C', repositoryRoot, 'merge-base', '--is-ancestor', baselineHead, head], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
  } catch {
    throw new Error(`bound snapshot unavailable: baseline is not current-branch ancestry ${baselineHead}`);
  }
  let searchHead = head;
  if (exactRevision) {
    if (finalHead === undefined) {
      throw new Error('bound snapshot exact revision requires final head');
    }
    assertRevision(finalHead, 'bound snapshot final head');
    try {
      execFileSync('git', ['-C', repositoryRoot, 'merge-base', '--is-ancestor', finalHead, head], {
        stdio: ['ignore', 'ignore', 'ignore'],
      });
    } catch {
      throw new Error(`bound snapshot final head is not current-branch ancestry ${finalHead}`);
    }
    searchHead = finalHead;
  }
  let candidates;
  if (exactRevision) {
    candidates = [finalHead];
  } else if (anchorPath === undefined) {
    let descendants;
    descendants = execFileSync(
      'git',
      ['-C', repositoryRoot, 'rev-list', '--ancestry-path', '--reverse', `${baselineHead}..${searchHead}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim().split(/\s+/u).filter(Boolean);
    candidates = [baselineHead, ...descendants];
  } else {
    let descendants;
    descendants = execFileSync(
      'git',
      ['-C', repositoryRoot, 'log', '--format=%H', '--reverse', '--ancestry-path',
        `${baselineHead}..${searchHead}`, '--', anchorPath],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim().split(/\s+/u).filter(Boolean);
    candidates = [baselineHead, ...descendants];
  }
  if (finalHead !== undefined && !exactRevision) {
    if (!candidates.includes(finalHead)) candidates.push(finalHead);
  }
  for (const revision of candidates) {
    let matches = true;
    for (const [path, expected] of entries) {
      let bytes;
      try { bytes = readAtRevision(repositoryRoot, revision, path); } catch { matches = false; break; }
      if (createHash('sha256').update(bytes).digest('hex') !== expected) {
        matches = false;
        break;
      }
    }
    if (matches) {
      const result = Object.freeze({
        [boundSnapshotAttestationBrand]: true,
        repositoryRoot,
        baselineHead,
        revision,
        inventory: Object.freeze(Object.fromEntries(entries)),
        inventoryDigest: digest,
      });
      snapshotRegistry.add(result);
      snapshotCache.set(cacheKey, result);
      return result;
    }
  }
  throw new Error(`bound snapshot unavailable: baseline=${baselineHead} inventory=${digest}`);
}

export function readBoundSource({ repositoryRoot, path, revision, sourceTexts = {}, expectedDigest } = {}) {
  assertSafePath(path);
  assertRevision(revision);
  if (sourceTexts?.[path] !== undefined) {
    const bytes = Buffer.from(String(sourceTexts[path]), 'utf8');
    if (expectedDigest !== undefined) {
      assertDigest(expectedDigest, `bound source digest ${path}`);
      const actual = createHash('sha256').update(bytes).digest('hex');
      if (actual !== expectedDigest) throw new Error(`bound source digest mismatch: ${actual}`);
    }
    return bytes;
  }
  const bytes = readAtRevision(repositoryRoot, revision, path);
  if (expectedDigest !== undefined) {
    assertDigest(expectedDigest, `bound source digest ${path}`);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== expectedDigest) throw new Error(`bound source digest mismatch: ${actual}`);
  }
  return bytes;
}

export function assertBoundSnapshotAttestation({ repositoryRoot, snapshot, inventory } = {}) {
  if (snapshot?.[boundSnapshotAttestationBrand] !== true || !snapshotRegistry.has(snapshot)) {
    throw new Error('bound snapshot attestation invalid');
  }
  if (snapshot.repositoryRoot !== repositoryRoot) throw new Error('bound snapshot repository invalid');
  assertRevision(snapshot.baselineHead, 'bound snapshot baseline');
  assertRevision(snapshot.revision, 'bound snapshot revision');
  const snapshotInventory = snapshot.inventory;
  if (snapshotInventory === null || typeof snapshotInventory !== 'object' || Array.isArray(snapshotInventory)) {
    throw new Error('bound snapshot inventory invalid');
  }
  const snapshotEntries = Object.entries(snapshotInventory);
  if (snapshotEntries.length === 0) throw new Error('bound snapshot inventory empty');
  for (const [path, expectedDigest] of snapshotEntries) {
    assertSafePath(path);
    assertDigest(expectedDigest, `bound snapshot digest ${path}`);
    readBoundSource({ repositoryRoot, path, revision: snapshot.revision, expectedDigest });
  }
  if (inventory === undefined) return snapshot;
  if (inventory === null || typeof inventory !== 'object' || Array.isArray(inventory)) {
    throw new Error('bound snapshot inventory invalid');
  }
  const expectedDigest = inventoryDigest(inventory);
  if (expectedDigest !== snapshot.inventoryDigest) throw new Error('bound snapshot inventory digest mismatch');
  if (JSON.stringify(inventory) !== JSON.stringify(snapshotInventory)) {
    throw new Error('bound snapshot inventory mismatch');
  }
  return snapshot;
}

export function deriveBoundSnapshotAttestation({ repositoryRoot, snapshot, inventory } = {}) {
  assertBoundSnapshotAttestation({ repositoryRoot, snapshot });
  if (inventory === null || typeof inventory !== 'object' || Array.isArray(inventory)) {
    throw new Error('bound snapshot inventory invalid');
  }
  if (Object.keys(inventory).length === 0) throw new Error('bound snapshot inventory empty');
  for (const [path, expectedDigest] of Object.entries(inventory)) {
    readBoundSource({
      repositoryRoot,
      path,
      revision: snapshot.revision,
      expectedDigest,
    });
  }
  const derived = Object.freeze({
    [boundSnapshotAttestationBrand]: true,
    repositoryRoot,
    baselineHead: snapshot.baselineHead,
    revision: snapshot.revision,
    inventory: Object.freeze(Object.fromEntries(Object.entries(inventory))),
    inventoryDigest: inventoryDigest(inventory),
  });
  snapshotRegistry.add(derived);
  return derived;
}

export function materializeBoundSourceTexts({ repositoryRoot, snapshot, inventory } = {}) {
  const attestation = inventory === undefined
    ? assertBoundSnapshotAttestation({ repositoryRoot, snapshot })
    : deriveBoundSnapshotAttestation({ repositoryRoot, snapshot, inventory });
  return Object.fromEntries(Object.entries(attestation.inventory).map(([path, expectedDigest]) => [
    path,
    readBoundSource({
      repositoryRoot,
      path,
      revision: attestation.revision,
      expectedDigest,
    }).toString('utf8'),
  ]));
}

export function boundDigest({ repositoryRoot, path, revision, sourceTexts = {}, expectedDigest } = {}) {
  return createHash('sha256')
    .update(readBoundSource({ repositoryRoot, path, revision, sourceTexts, expectedDigest }))
    .digest('hex');
}

export function boundText({ repositoryRoot, path, revision, sourceTexts = {}, expectedDigest } = {}) {
  return readBoundSource({ repositoryRoot, path, revision, sourceTexts, expectedDigest }).toString('utf8');
}
