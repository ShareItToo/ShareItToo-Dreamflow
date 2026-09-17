#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const manifestPath = 'store/google-play/sit-pilot-feature-scope-20260917.json';
const scopeId = 'SIT-PILOT-FEATURE-SCOPE-20260917';
const forbiddenPilotFlags = Object.freeze([
  'realMoney',
  'paidDelivery',
  'shipping',
  'express',
  'vehicles',
  'deposit',
  'insurance',
]);
const forbiddenEffectTerms = /(?:real[- ]money|paid[- ]delivery|shipping|express|vehicle|deposit|insurance|placeholder|demo[- ]only|toast[- ]only|no[- ]op)/iu;

function fail(message) {
  throw new Error(`BLOCK:${scopeId}:${message}`);
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function validateManifest(manifest = readJson(manifestPath), { repositoryRoot = root } = {}) {
  assert(manifest?.schemaVersion === 1, 'schema_version_invalid');
  assert(manifest?.kind === 'sit-pilot-feature-scope-20260917', 'kind_invalid');
  assert(manifest?.pilot?.region === 'Germany', 'pilot_region_invalid');
  assert(manifest?.pilot?.mode === 'private-adult-staging', 'pilot_mode_invalid');
  assert(manifest?.pilot?.applicationId === 'com.shareittoo.app', 'application_id_invalid');
  assert(manifest?.pilot?.releaseChannel === 'internal', 'release_channel_invalid');
  for (const flag of forbiddenPilotFlags) {
    assert(manifest.pilot[flag] === false, `pilot_boundary_${flag}_must_be_false`);
  }
  assert(manifest?.candidate?.versionName === '1.0.0', 'candidate_version_name_invalid');
  assert(/^2026091705$/u.test(String(manifest?.candidate?.versionCode ?? '')), 'candidate_version_code_invalid');
  assert(Array.isArray(manifest.reachablePaths) && manifest.reachablePaths.length >= 1,
    'reachable_inventory_too_small');

  const blockers = [];
  const ids = new Set();
  for (const entry of manifest.reachablePaths) {
    assert(entry && typeof entry === 'object', 'path_entry_not_object');
    assert(typeof entry.id === 'string' && entry.id.length > 0, 'path_id_missing');
    assert(!ids.has(entry.id), `duplicate_path:${entry.id}`);
    ids.add(entry.id);
    assert(entry.reachable !== false, `reachable_path_hidden:${entry.id}`);
    assert(typeof entry.route === 'string' && entry.route.length > 0, `route_missing:${entry.id}`);
    assert(typeof entry.source === 'string' && existsSync(resolve(repositoryRoot, entry.source)),
      `source_missing:${entry.id}`);
    const source = readFileSync(resolve(repositoryRoot, entry.source), 'utf8');
    assert(typeof entry.reachabilityMarker === 'string' && source.includes(entry.reachabilityMarker),
      `reachability_marker_missing:${entry.id}`);
    assert(typeof entry.effect === 'string' && entry.effect.length > 0, `effect_missing:${entry.id}`);
    assert(!forbiddenEffectTerms.test(entry.effect), `unsafe_or_deceptive_effect:${entry.id}`);
    assert(Array.isArray(entry.proof) && entry.proof.length > 0, `proof_missing:${entry.id}`);
    for (const proof of entry.proof) {
      assert(typeof proof === 'string' && existsSync(resolve(repositoryRoot, proof)),
        `proof_missing:${entry.id}:${proof}`);
    }
    assert(entry.pilot === 'allowed' || entry.pilot === 'excluded', `pilot_state_invalid:${entry.id}`);
    if (entry.pilot === 'excluded') {
      assert(typeof entry.blocker === 'string' && entry.blocker.length > 0,
        `excluded_path_without_blocker:${entry.id}`);
      blockers.push({ id: entry.id, route: entry.route, blocker: entry.blocker });
    }
  }

  const result = {
    gate: scopeId,
    status: blockers.length === 0 ? 'PASS' : 'BLOCK',
    candidate: manifest.candidate,
    inventoryCount: manifest.reachablePaths.length,
    allowedCount: manifest.reachablePaths.filter((entry) => entry.pilot === 'allowed').length,
    blockerCount: blockers.length,
    blockers,
  };
  if (blockers.length > 0) {
    fail(`reachable_excluded_paths=${blockers.map((entry) => entry.id).join(',')}`);
  }
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(`${JSON.stringify(validateManifest())}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

export { validateManifest };
