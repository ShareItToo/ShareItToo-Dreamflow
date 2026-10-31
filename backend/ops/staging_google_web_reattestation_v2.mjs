import { createGoogleWebReattestationReaders, createGoogleWebRuntimeReader } from './staging_google_web_reattestation_adapter.mjs';
import { collectGoogleWebReattestation, googleWebReattestationDigest } from './staging_google_web_reattestation.mjs';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { GOOGLE_WEB_BINDING_V2_SOURCE_PATHS } from './staging_google_web_binding_v2.mjs';

const deny = () => { throw new Error('google_web_reattestation_v2_denied'); };
const check = (v) => { if (!v) deny(); };
const sha = /^[a-f0-9]{64}$/u;
const commit = /^[a-f0-9]{40}$/u;
const exact = (v, keys) => v !== null && Object.getPrototypeOf(v) === Object.prototype
  && Object.keys(v).sort().join('|') === [...keys].sort().join('|');

function validateV2(binding, repositoryRoot) {
  check(exact(binding, ['kind', 'schemaVersion', 'sourceCommit', 'sourceInventory', 'projectId', 'projectNumber', 'webAppId', 'origin',
    'serviceAccountEmailSha256', 'firebaseAccountEmailSha256', 'firebaseUserIdentityProofSha256', 'apiKey', 'apiKeyResourceName',
    'expectedSnapshotSha256', 'configurationSha256', 'reviewEvidenceSha256', 'runtimeContainerId', 'runtimeCommit', 'runtimeImageId',
    'runtimeRepoDigest', 'readEvidence']) && binding.kind === 'sit-google-web-reattestation-binding' && binding.schemaVersion === 2
    && binding.projectId === 'shareittoo-staging' && binding.projectNumber === '214007794438'
    && binding.webAppId === '1:214007794438:web:aefec13f9f030f46eaac87' && binding.origin === 'https://staging.shareittoo.com'
    && commit.test(binding.sourceCommit) && commit.test(binding.runtimeCommit) && sha.test(binding.runtimeContainerId)
    && /^sha256:[a-f0-9]{64}$/u.test(binding.runtimeImageId) && /^.+@sha256:[a-f0-9]{64}$/u.test(binding.runtimeRepoDigest)
    && ['serviceAccountEmailSha256', 'firebaseAccountEmailSha256', 'firebaseUserIdentityProofSha256', 'expectedSnapshotSha256',
      'configurationSha256', 'reviewEvidenceSha256'].every((k) => sha.test(binding[k]))
    && exact(binding.apiKey, ['apiKeyId', 'keyFingerprint', 'restrictionsDigest'])
    && sha.test(binding.apiKey.keyFingerprint) && sha.test(binding.apiKey.restrictionsDigest)
    && /^projects\/214007794438\/locations\/global\/keys\/[A-Za-z0-9_-]{1,200}$/u.test(binding.apiKeyResourceName)
    && Array.isArray(binding.sourceInventory) && binding.sourceInventory.length > 0
    && exact(binding.readEvidence, ['serviceProjectIdentity', 'userAccountIdentity', 'webApp', 'sdkConfig', 'apiKeyInventory', 'runtime', 'providerSnapshot'])
    && Object.values(binding.readEvidence).every((v) => sha.test(v)));
  check(path.resolve(repositoryRoot) === repositoryRoot && fs.realpathSync(repositoryRoot) === repositoryRoot
    && binding.sourceInventory.length === GOOGLE_WEB_BINDING_V2_SOURCE_PATHS.length);
  const git = (args) => execFileSync('git', ['-C', repositoryRoot, ...args], { stdio: ['ignore', 'pipe', 'ignore'] });
  check(git(['rev-parse', 'HEAD']).toString().trim() === binding.sourceCommit);
  for (let i = 0; i < GOOGLE_WEB_BINDING_V2_SOURCE_PATHS.length; i++) {
    const entry = binding.sourceInventory[i]; const locator = GOOGLE_WEB_BINDING_V2_SOURCE_PATHS[i];
    check(exact(entry, ['locator', 'commit', 'sha256']) && entry.locator === locator && entry.commit === binding.sourceCommit && sha.test(entry.sha256));
    const bytes = fs.readFileSync(path.join(repositoryRoot, locator));
    check(createHash('sha256').update(bytes).digest('hex') === entry.sha256 && bytes.equals(git(['show', `${binding.sourceCommit}:${locator}`])));
  }
}

/** V2 entrypoint. The only schema-1 projection is private to this adapter; v1
 * validators and consumers remain unchanged. The v2 binding hash is folded
 * into reviewEvidenceSha256 so candidate/readiness carries its provenance. */
export async function collectGoogleWebReattestationV2({ binding, serviceCredential, userCredentialBytes,
  repositoryRoot, fetchImpl, execute = execFileSync, now = Date.now } = {}) {
  try {
    validateV2(binding, repositoryRoot);
    check(serviceCredential?.projectId === binding.projectId && typeof serviceCredential.clientEmail === 'string'
      && createHash('sha256').update(serviceCredential.clientEmail.trim().toLowerCase()).digest('hex') === binding.serviceAccountEmailSha256);
    const bindingSha256 = googleWebReattestationDigest(binding);
    const projected = { schemaVersion: 1, sourceCommit: binding.sourceCommit, projectId: binding.projectId,
      projectNumber: binding.projectNumber, webAppId: binding.webAppId, firebaseAccountEmailSha256: binding.firebaseAccountEmailSha256,
      apiKey: { projectId: binding.projectId, ...binding.apiKey }, apiKeyResourceName: binding.apiKeyResourceName,
      runtimeContainerId: binding.runtimeContainerId, runtimeCommit: binding.runtimeCommit,
      expectedSnapshotSha256: binding.expectedSnapshotSha256, configurationSha256: binding.configurationSha256,
      reviewEvidenceSha256: googleWebReattestationDigest({ bindingSha256, sourceInventory: binding.sourceInventory,
        identityProofSha256: binding.firebaseUserIdentityProofSha256, serviceAccountEmailSha256: binding.serviceAccountEmailSha256,
        runtimeImageId: binding.runtimeImageId, runtimeRepoDigest: binding.runtimeRepoDigest, reviewEvidenceSha256: binding.reviewEvidenceSha256 }) };
    const assertImage = () => {
      const opts = { encoding: 'utf8', timeout: 10000, maxBuffer: 65536, stdio: ['ignore', 'pipe', 'pipe'] };
      const actual = execute('docker', ['inspect', binding.runtimeContainerId, '--format', '{{json .Image}}'], opts).trim();
      check(JSON.parse(actual) === binding.runtimeImageId);
      const raw = execute('docker', ['image', 'inspect', binding.runtimeImageId, '--format', '{{json .Id}}|{{json .RepoDigests}}'], opts).trim();
      const [imageId, digests] = raw.split('|').map(JSON.parse);
      check(imageId === binding.runtimeImageId && Array.isArray(digests) && digests.includes(binding.runtimeRepoDigest));
    };
    const guardedExecute = (...args) => {
      if (args[0] === 'docker' && args[1]?.[0] === 'exec') assertImage();
      const result = execute(...args);
      if (args[0] === 'docker' && args[1]?.[0] === 'exec') assertImage();
      return result;
    };
    assertImage();
    const baseRuntimeReader = createGoogleWebRuntimeReader(projected, guardedExecute);
    const runtimeReader = (projectId) => {
      assertImage(); const observed = baseRuntimeReader(projectId); assertImage();
      return observed;
    };
    const rawReaders = createGoogleWebReattestationReaders({ binding: projected, serviceCredential, userCredentialBytes,
      fetchImpl, execute: guardedExecute, runtimeReader, now });
    const readers = Object.freeze({ ...rawReaders, readAccountIdentity: async (...args) => {
      const observed = await rawReaders.readAccountIdentity(...args);
      check(observed.value.proofSha256 === binding.firebaseUserIdentityProofSha256);
      return observed;
    } });
    const collected = await collectGoogleWebReattestation({ binding: projected, readers, repositoryRoot, now });
    assertImage();
    return { ...collected, v2BindingSha256: bindingSha256 };
  } catch { throw new Error('google_web_reattestation_v2_denied'); }
}
