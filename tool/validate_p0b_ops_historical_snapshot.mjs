#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { validateP0BOpsReadiness } from './validate_p0b_ops_readiness.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const historicalSourceRevision = '2bfc3ce027d8a5dea09b401744fc86be6900b467';
const manifestPath = 'docs/operations/p0b-ops-role-delegate-absence-gate.json';
const historicalManifestSha = 'eb5cd54c3894f74534d21d04c079c942b276aa553324cd581b0d6519ae8800ff';

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function historicalSource(repositoryRoot, path) {
  return execFileSync('git', ['show', `${historicalSourceRevision}:${path}`], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

export function validateP0BOpsHistoricalSnapshot({ repositoryRoot = root } = {}) {
  const manifestBytes = readFileSync(resolve(repositoryRoot, manifestPath));
  if (sha256(manifestBytes) !== historicalManifestSha) {
    throw new Error('Historical P0B manifest is not byte-exact.');
  }
  const result = validateP0BOpsReadiness({
    root: repositoryRoot,
    sourceOverrides: {
      'backend/src/operational_readiness_gate.js': historicalSource(repositoryRoot, 'backend/src/operational_readiness_gate.js'),
      'backend/test/operational_readiness_gate.test.js': historicalSource(repositoryRoot, 'backend/test/operational_readiness_gate.test.js'),
    },
  });
  return Object.freeze({ revision: historicalSourceRevision, ...result });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const result = validateP0BOpsHistoricalSnapshot();
    process.stdout.write(`Historical P0B ops snapshot valid: revision=${result.revision}, version=${result.version}, state=${result.state}, requiredRoles=${result.requiredRoles}, assignedRoles=${result.assignedRoles}, technicalRehearsalsPassed=${result.technicalRehearsalsPassed}, humanAbsenceTestsPassed=${result.humanAbsenceTestsPassed}, operationsReady=${result.operationsReady}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Historical P0B ops snapshot validation failed.'}\n`);
    process.exitCode = 1;
  }
}
