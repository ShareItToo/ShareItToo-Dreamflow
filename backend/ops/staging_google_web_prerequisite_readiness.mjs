import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  readStagingGoogleWebPrerequisiteJournal,
} from './staging_google_web_prerequisites.mjs';
import {
  readProtectedActivationFile,
} from './green_password_enrollment_activation.mjs';
import {
  bindGoogleWebConfig,
  sha256,
} from '../../tool/staging_web_contract.mjs';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const runnerFile = fileURLToPath(new URL('./staging_google_web_prerequisites.mjs', import.meta.url));
const hashPattern = /^[a-f0-9]{64}$/u;
const maximumAgeMs = 2 * 60 * 60 * 1000;

export class StagingGoogleWebPrerequisiteReadinessError extends Error {
  constructor() {
    super('google_web_prerequisite_readiness_denied');
  }
}
const deny = () => { throw new StagingGoogleWebPrerequisiteReadinessError(); };
const exact = (value, keys) => value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key));
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, canonical(value[key])]));
  return value;
};
const digest = (value) => sha256(JSON.stringify(canonical(value)));

function protectedConfig(file, expectedDigest) {
  let opened;
  try {
    opened = readProtectedActivationFile(file, { maximumBytes: 4096 });
    const text = new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes);
    const value = JSON.parse(text);
    const bound = bindGoogleWebConfig(value, expectedDigest);
    if (text !== JSON.stringify(bound.config)) deny();
    return bound;
  } catch (error) {
    if (error instanceof StagingGoogleWebPrerequisiteReadinessError) throw error;
    deny();
  } finally {
    opened?.bytes.fill(0);
  }
}

export function collectStagingGoogleWebPrerequisiteReadiness({
  journalFile,
  configFile,
  expectedJournalSha256,
  now = Date.now,
} = {}) {
  try {
    if (typeof journalFile !== 'string' || typeof configFile !== 'string'
        || !path.isAbsolute(journalFile) || path.normalize(journalFile) !== journalFile
        || !path.isAbsolute(configFile) || path.normalize(configFile) !== configFile
        || !hashPattern.test(expectedJournalSha256 ?? '') || typeof now !== 'function') deny();
    const journal = readStagingGoogleWebPrerequisiteJournal(journalFile);
    if (journal.schemaVersion !== 4 || journal.phase !== 'complete'
        || journal.journalSha256 !== expectedJournalSha256
        || journal.state.configFile !== configFile
        || !exact(journal.state.completion, [
          'schemaVersion', 'collectedAtUtc', 'sourceCommit', 'runnerSha256',
          'firebaseAccountEmailSha256', 'gateEvidenceSha256', 'baselineSha256',
          'projectId', 'projectNumber', 'backendProjectId', 'webAppId',
          'authorizedDomain', 'firebaseProviderId', 'firebaseProviderEnabled',
          'firebaseAuthEnabled', 'firebaseEmulatorEnabled', 'finalSnapshotSha256',
          'finalRevisionSha256', 'authConfigReadbackSha256',
          'providerConfigReadbackSha256', 'webAppReadbackSha256',
          'authorizedDomainsReadbackSha256', 'keyInventoryReadbackSha256',
          'otherAppsReadbackSha256', 'runtimeReadbackSha256', 'publicConfigSha256',
        ])) deny();
    const completion = journal.state.completion;
    const collected = Date.parse(completion.collectedAtUtc);
    const observedNow = now();
    if (!Number.isFinite(observedNow) || observedNow < collected
        || observedNow - collected > maximumAgeMs
        || completion.runnerSha256 !== sha256(fs.readFileSync(runnerFile))
        || completion.sourceCommit !== execFileSync(
          'git', ['-C', repositoryRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' },
        ).trim()) deny();
    const configuration = protectedConfig(configFile, completion.publicConfigSha256);
    if (configuration.config.projectId !== completion.projectId
        || configuration.config.messagingSenderId !== completion.projectNumber
        || configuration.config.backendProjectId !== completion.backendProjectId
        || configuration.config.appId !== completion.webAppId
        || configuration.config.authorizedOrigin !== 'https://staging.shareittoo.com') deny();
    const readiness = Object.freeze({
      sourceCommit: completion.sourceCommit,
      prerequisiteRunnerSha256: completion.runnerSha256,
      firebaseAccountEmailSha256: completion.firebaseAccountEmailSha256,
      gateEvidenceSha256: completion.gateEvidenceSha256,
      baselineSha256: completion.baselineSha256,
      projectId: completion.projectId,
      projectNumber: completion.projectNumber,
      backendProjectId: completion.backendProjectId,
      webAppId: completion.webAppId,
      authorizedDomain: completion.authorizedDomain,
      firebaseProviderId: completion.firebaseProviderId,
      firebaseProviderEnabled: completion.firebaseProviderEnabled,
      firebaseAuthEnabled: completion.firebaseAuthEnabled,
      firebaseEmulatorEnabled: completion.firebaseEmulatorEnabled,
      finalSnapshotSha256: completion.finalSnapshotSha256,
      finalRevisionSha256: completion.finalRevisionSha256,
      authConfigReadbackSha256: completion.authConfigReadbackSha256,
      providerConfigReadbackSha256: completion.providerConfigReadbackSha256,
      webAppReadbackSha256: completion.webAppReadbackSha256,
      authorizedDomainsReadbackSha256: completion.authorizedDomainsReadbackSha256,
      keyInventoryReadbackSha256: completion.keyInventoryReadbackSha256,
      otherAppsReadbackSha256: completion.otherAppsReadbackSha256,
      runtimeReadbackSha256: completion.runtimeReadbackSha256,
      prerequisiteJournalSha256: journal.journalSha256,
      prerequisiteFinalRecordSha256: journal.finalRecordSha256,
      collectedAtUtc: completion.collectedAtUtc,
      validUntilUtc: new Date(collected + maximumAgeMs).toISOString(),
    });
    return Object.freeze({
      schemaVersion: 1,
      kind: 'sit-google-web-prerequisite-readiness-candidate',
      evidenceClass: 'verified-prerequisite-journal',
      syntheticFixture: false,
      activationDecision: 'pending-independent-review',
      activationEligible: false,
      configuration: Object.freeze({ ...configuration.config }),
      configurationSha256: configuration.digest,
      readiness,
      readinessSha256: digest(readiness),
    });
  } catch (error) {
    if (error instanceof StagingGoogleWebPrerequisiteReadinessError) throw error;
    deny();
  }
}
