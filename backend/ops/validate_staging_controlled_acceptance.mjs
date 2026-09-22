#!/usr/bin/env node

import { isAbsolute, relative, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { closeStablePrivateFile, openStablePrivateFile } from './stable_private_file.mjs';

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
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;
  let evidence;
  let opened;
  try {
    opened = openStablePrivateFile(resolved, {
      expectedUid: uid ?? undefined,
      mode: 0o077,
      code: 'controlled_acceptance_evidence_permissions_invalid',
    });
    evidence = JSON.parse(readFileSync(opened.descriptor, 'utf8'));
  } catch (error) {
    if (error?.code === 'controlled_acceptance_evidence_permissions_invalid') fail(error.code);
    fail('controlled_acceptance_evidence_json_invalid');
  } finally {
    if (opened) closeStablePrivateFile(opened);
  }
  if (evidence?.kind !== 'sit-staging-controlled-acceptance'
    || evidence.status !== 'passed'
    || evidence.runtimeCommit !== runtimeCommit
    || evidence.opsCommit !== opsCommit
    || evidence.acceptanceTarget !== 'loopback'
    || evidence.publicProxyReachable !== false
    || evidence.publicCandidateServed !== false
    || evidence.publicReleaseComplete !== false
    || evidence.servicesRemainQuiesced !== true
    || evidence.featureProbes?.mfa !== 'enroll-pending-cancel-passed'
    || evidence.featureProbes?.identity !== 'start-status-resume-revoke-passed') {
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
