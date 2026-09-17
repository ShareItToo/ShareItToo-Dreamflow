#!/usr/bin/env node

import { constants, fstatSync, lstatSync, openSync, closeSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const maxAgeMs = 24 * 60 * 60 * 1000;

function fail(code) {
  const error = new Error('Stripe Identity staging evidence gate failed.');
  error.code = code;
  throw error;
}

export function validateIdentityStagingEvidence({ evidenceFile, deploymentCommit, pilotId, now = Date.now() } = {}) {
  if (!isAbsolute(evidenceFile ?? '')) fail('identity_staging_evidence_path_invalid');
  let descriptor;
  try {
    descriptor = openSync(evidenceFile, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC);
    const metadata = fstatSync(descriptor);
    const linkMetadata = lstatSync(evidenceFile);
    const resolved = realpathSync(evidenceFile);
    const inside = relative(realpathSync(repositoryRoot), resolved);
    if (!metadata.isFile() || linkMetadata.isSymbolicLink() || inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) {
      fail('identity_staging_evidence_location_invalid');
    }
    if ((metadata.mode & 0o777) !== 0o600
        || (typeof process.getuid === 'function' && metadata.uid !== process.getuid())) {
      fail('identity_staging_evidence_permissions_invalid');
    }
    if (metadata.size < 120 || metadata.size > 16_384) fail('identity_staging_evidence_size_invalid');
    let evidence;
    try { evidence = JSON.parse(readFileSync(descriptor, 'utf8')); } catch { fail('identity_staging_evidence_json_invalid'); }
    if (evidence?.kind !== 'sit-stripe-identity-staging-account-evidence'
        || evidence.commit !== deploymentCommit
        || evidence.pilotId !== pilotId
        || evidence.mode !== 'test'
        || evidence.country !== 'DE'
        || !/^acct_[A-Za-z0-9]+$/u.test(String(evidence.accountId ?? ''))
        || !/^[0-9a-f]{64}$/u.test(String(evidence.accountContextHash ?? ''))
        || evidence.readbackMethod !== 'owner_dashboard_readback'
        || typeof evidence.privacyPolicyUrl !== 'string'
        || evidence.privacyPolicyUrl !== 'https://shareittoo.com/privacy'
        || !/^[0-9a-f]{64}$/u.test(String(evidence.privacyReadbackHash ?? ''))
        || !Array.isArray(evidence.privacyIdentityNoticeMarkers)
        || !['identity-test-staging-only-v1', 'identity-test-consent-art6a', 'identity-test-provider-redaction', 'identity-test-stripe-retention-caveat']
          .every((marker) => evidence.privacyIdentityNoticeMarkers.includes(marker))
        || evidence.identityApplicationEnabled !== true
        || evidence.brandingReviewed !== true
        || evidence.accountBound !== true
        || evidence.legalFactsBound !== true
        || !['controller', 'processor', 'mixed'].includes(evidence.stripeRole)
        || !['application', 'stripe'].includes(evidence.feesCollector)
        || !['application', 'stripe'].includes(evidence.lossesCollector)
        || typeof evidence.contractingEntity !== 'string'
        || evidence.contractingEntity.trim().length < 3
        || evidence.contractingEntity.trim().length > 240
        || !Array.isArray(evidence.processingLocations)
        || evidence.processingLocations.length < 1
        || evidence.processingLocations.some((value) => typeof value !== 'string' || value.trim().length < 2 || value.length > 120)
        || !Array.isArray(evidence.transferMechanisms)
        || evidence.transferMechanisms.length < 1
        || evidence.transferMechanisms.some((value) => !['scc', 'eu_us_dpf'].includes(value))
        || !Array.isArray(evidence.officialSourceUrls)
        || !evidence.officialSourceUrls.includes('https://stripe.com/de/legal/privacy-center')
        || !evidence.officialSourceUrls.includes('https://stripe.com/de/legal/dpa')
        || typeof evidence.legalFactsObservedAt !== 'string') {
      fail('identity_staging_evidence_binding_invalid');
    }
    const observedAt = Date.parse(evidence.observedAt ?? '');
    const legalFactsObservedAt = Date.parse(evidence.legalFactsObservedAt ?? '');
    if (!Number.isFinite(observedAt) || observedAt > now + 5 * 60 * 1000 || now - observedAt > maxAgeMs
        || !Number.isFinite(legalFactsObservedAt)
        || legalFactsObservedAt > now + 5 * 60 * 1000
        || now - legalFactsObservedAt > maxAgeMs) {
      fail('identity_staging_evidence_stale');
    }
    return Object.freeze({
      kind: evidence.kind,
      commit: evidence.commit,
      pilotId: evidence.pilotId,
      observedAt: evidence.observedAt,
      accountBound: true,
      legalFactsBound: true,
    });
  } catch (error) {
    if (String(error?.code ?? '').startsWith('identity_staging_evidence_')) throw error;
    fail('identity_staging_evidence_unavailable');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    validateIdentityStagingEvidence({
      evidenceFile: process.env.IDENTITY_STAGING_EVIDENCE_FILE ?? '',
      deploymentCommit: process.env.SIT_DEPLOYMENT_COMMIT ?? '',
      pilotId: process.env.SIT_STAGING_PILOT_ID ?? '',
    });
    process.stdout.write('Stripe Identity staging evidence gate: PASS\n');
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Stripe Identity staging evidence gate failed.'}\n`);
    process.exitCode = 1;
  }
}
