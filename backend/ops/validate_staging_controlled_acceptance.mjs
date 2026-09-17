#!/usr/bin/env node

import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function fail(code) {
  const error = new Error('Controlled Staging acceptance gate failed.');
  error.code = code;
  throw error;
}

function validateEvidence({ evidenceFile, runtimeCommit, opsCommit, requirePublicRelease = false } = {}) {
  if (!isAbsolute(evidenceFile ?? '')) fail('controlled_acceptance_evidence_path_invalid');
  const resolved = resolve(evidenceFile);
  const relativeRepository = relative(repositoryRoot, resolved);
  if (relativeRepository === '' || (!relativeRepository.startsWith('..') && !isAbsolute(relativeRepository))) {
    fail('controlled_acceptance_evidence_inside_repository');
  }
  let metadata;
  try { metadata = lstatSync(resolved); } catch { fail('controlled_acceptance_evidence_unavailable'); }
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0
    || (uid !== null && metadata.uid !== uid)) {
    fail('controlled_acceptance_evidence_permissions_invalid');
  }
  let evidence;
  try { evidence = JSON.parse(readFileSync(resolved, 'utf8')); } catch { fail('controlled_acceptance_evidence_json_invalid'); }
  if (evidence?.kind !== 'sit-staging-controlled-acceptance'
    || evidence.status !== 'passed'
    || evidence.runtimeCommit !== runtimeCommit
    || evidence.opsCommit !== opsCommit
    || evidence.acceptanceTarget !== 'loopback'
    || evidence.publicProxyReachable !== false
    || evidence.publicCandidateServed !== false
    || evidence.publicReleaseComplete !== false
    || evidence.servicesRemainQuiesced !== true) {
    fail('controlled_acceptance_evidence_binding_invalid');
  }
  if (requirePublicRelease && process.env.SIT_STAGING_PUBLIC_RELEASE_CONFIRM !== runtimeCommit) {
    fail('controlled_acceptance_public_release_confirmation_required');
  }
  return Object.freeze({ status: evidence.status, runtimeCommit, opsCommit, acceptanceTarget: evidence.acceptanceTarget });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const result = validateEvidence({
      evidenceFile: process.env.SIT_STAGING_ACCEPTANCE_EVIDENCE_FILE,
      runtimeCommit: process.env.SIT_EXPECTED_RUNTIME_COMMIT,
      opsCommit: process.env.SIT_EXPECTED_OPS_COMMIT,
      requirePublicRelease: process.env.SIT_REQUIRE_PUBLIC_RELEASE === '1',
    });
    process.stdout.write(`Controlled Staging acceptance: ${result.status}; target=${result.acceptanceTarget}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Controlled Staging acceptance gate failed.'}\n`);
    process.exitCode = 1;
  }
}

export { validateEvidence };
