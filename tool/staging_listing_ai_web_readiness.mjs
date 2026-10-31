import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LISTING_AI_MOCK_WEB_PROFILE, validateListingAiMockWebBinding } from './staging_listing_ai_mock_web_readiness.mjs';

export const LISTING_AI_WEB_PROFILE = 'staging-listing-ai-web-v1';
export const LISTING_AI_WEB_MODEL = 'gpt-4o-mini-2024-07-18';
const envelopeKeys = ['schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture',
  'activationDecision', 'activationEligible', 'web', 'configuration',
  'configurationSha256', 'capability', 'capabilitySha256', 'collectedAtUtc',
  'validUntilUtc', 'geminiDecision', 'geminiDecisionSha256'];
const webKeys = ['sourceCommit', 'clientVersion'];
const configurationKeys = ['environment', 'pilotId', 'runtimeCommit', 'imageDigest',
  'promotionKind', 'promotionReceiptSha256', 'promotedAtUtc', 'provider', 'model', 'budgetCents',
  'budgetScope', 'stagingSmokeBudgetCents', 'stagingSmokeActivationId', 'runMaxProviderCalls',
  'externalExecutionApproved', 'automaticPublicationAllowed',
  'providerSecretMetadataValidated', 'providerSecretMetadataReceiptSha256',
  'providerSecretMode', 'providerSecretOwnerUid', 'providerSecretGroupGid',
  'providerSecretRegularFile', 'providerSecretNonSymlink',
  'providerSecretOutsideRepository', 'providerSecretReadOnlyMount',
  'rollbackToMockVerified', 'rollbackToMockProofSha256'];
const capabilityKeys = ['authenticatedReadback', 'available', 'provider', 'mode',
  'budgetScope', 'lifetimeBudgetCents', 'stagingSmokeBudgetCents',
  'stagingSmokeActivationId', 'supportedClientVersion', 'imageLimit', 'disclosureVersion', 'disclosureHash',
  'configRevision', 'configurationSha256', 'readAtUtc'];
const decisionKeys = ['schemaVersion', 'kind', 'evidenceClass', 'reviewerRole',
  'decision', 'gateId', 'sourceCommit', 'clientVersion', 'runtimeCommit',
  'imageDigest', 'promotionReceiptSha256', 'capabilitySha256',
  'configurationSha256', 'decisionEvidenceSha256', 'decidedAtUtc', 'validUntilUtc'];
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hashPattern = /^[a-f0-9]{64}$/u;
const sourcePattern = /^[a-f0-9]{40}$/u;
const check = (condition, code) => { if (!condition) throw new Error(code); };
const exact = (value, keys, code) => check(value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), code);
const ordered = (value, keys) => Object.fromEntries(keys.map((key) => [key, value[key]]));
const canonical = (value) => {
  exact(value, envelopeKeys, 'listing_ai_web_readiness_shape');
  exact(value.web, webKeys, 'listing_ai_web_readiness_shape');
  exact(value.configuration, configurationKeys, 'listing_ai_web_readiness_shape');
  exact(value.capability, capabilityKeys, 'listing_ai_web_readiness_shape');
  exact(value.geminiDecision, decisionKeys, 'listing_ai_web_readiness_shape');
  return ordered({ ...value, web: ordered(value.web, webKeys),
    configuration: ordered(value.configuration, configurationKeys),
    capability: ordered(value.capability, capabilityKeys),
    geminiDecision: ordered(value.geminiDecision, decisionKeys) }, envelopeKeys);
};
const iso = (value, code) => {
  const parsed = new Date(value);
  check(!Number.isNaN(parsed.getTime()) && parsed.toISOString() === value, code);
  return parsed.getTime();
};

function sameFile(left, right) {
  return ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .every((key) => left[key] === right[key]);
}
function sameDirectory(left, right, protectedRoot) {
  return (protectedRoot ? ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink']
    : ['dev', 'ino', 'mode', 'uid', 'gid']).every((key) => left[key] === right[key]);
}
function readProtected(file) {
  check(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file,
    'listing_ai_web_readiness_path');
  const descriptors = [];
  let bytes;
  try {
    const directories = ['/'];
    for (const part of path.dirname(file).split('/').filter(Boolean)) {
      directories.push(path.join(directories.at(-1), part));
    }
    const opened = directories.map((directory, index) => {
      const fd = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY
        | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      descriptors.push(fd);
      const stat = fs.fstatSync(fd, { bigint: true });
      check(stat.isDirectory() && sameDirectory(stat,
        fs.lstatSync(directory, { bigint: true }), index === directories.length - 1),
      'listing_ai_web_readiness_path');
      return { directory, fd, stat };
    });
    const protectedRoot = opened.at(-1).stat;
    check(protectedRoot.uid === BigInt(process.getuid())
      && (protectedRoot.mode & 0o7777n) === 0o700n,
    'listing_ai_web_readiness_parent');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
      | fs.constants.O_NONBLOCK);
    descriptors.push(fd);
    const before = fs.fstatSync(fd, { bigint: true });
    check(before.isFile() && before.nlink === 1n
      && before.uid === BigInt(process.getuid())
      && (before.mode & 0o7777n) === 0o600n
      && before.size >= 2n && before.size <= 32768n
      && sameFile(before, fs.lstatSync(file, { bigint: true })),
    'listing_ai_web_readiness_file');
    const assertPathsUnchanged = () => {
      for (const [index, entry] of opened.entries()) {
        const root = index === opened.length - 1;
        check(sameDirectory(entry.stat, fs.fstatSync(entry.fd, { bigint: true }), root)
          && sameDirectory(entry.stat, fs.lstatSync(entry.directory, { bigint: true }), root),
        'listing_ai_web_readiness_changed');
      }
    };
    assertPathsUnchanged();
    bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
      check(count > 0, 'listing_ai_web_readiness_changed');
      offset += count;
    }
    check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0
      && sameFile(before, fs.fstatSync(fd, { bigint: true }))
      && sameFile(before, fs.lstatSync(file, { bigint: true })),
    'listing_ai_web_readiness_changed');
    assertPathsUnchanged();
  } catch (error) {
    if (/^listing_ai_web_[a-z_]+$/u.test(error?.message ?? '')) throw error;
    throw new Error('listing_ai_web_readiness_file');
  } finally {
    let closeFailed = false;
    for (const fd of descriptors.reverse()) {
      try { fs.closeSync(fd); } catch { closeFailed = true; }
    }
    check(!closeFailed, 'listing_ai_web_readiness_file');
  }
  return bytes;
}

export function bindListingAiWebReadiness(evidence, evidenceDigest,
  { now = new Date(), expectedSource, expectedVersion } = {}) {
  const value = canonical(evidence);
  const bytes = JSON.stringify(value);
  check(JSON.stringify(evidence) === bytes && hashPattern.test(evidenceDigest ?? '')
    && sha(bytes) === evidenceDigest, 'listing_ai_web_evidence_digest_mismatch');
  check(value.schemaVersion === 1 && value.kind === 'sit-staging-listing-ai-web-readiness'
    && value.evidenceClass === 'verified-promoted-runtime-authenticated-capability-and-independent-gemini-decision'
    && value.syntheticFixture === false && value.activationDecision === 'approved-independent-gemini-review'
    && value.activationEligible === true, 'listing_ai_web_evidence_class');
  const web = value.web;
  check(sourcePattern.test(web.sourceCommit) && web.sourceCommit === expectedSource
    && /^\d+\.\d+\.\d+\+\d+$/u.test(web.clientVersion)
    && web.clientVersion === expectedVersion, 'listing_ai_web_source_binding');
  const config = value.configuration;
  check(config.environment === 'staging' && config.pilotId === 'heilbronn_wave0'
    && sourcePattern.test(config.runtimeCommit) && /^sha256:[a-f0-9]{64}$/u.test(config.imageDigest)
    && config.promotionKind === 'green-staging-106-106'
    && hashPattern.test(config.promotionReceiptSha256)
    && config.provider === 'openai' && config.model === LISTING_AI_WEB_MODEL
    && config.budgetCents === 10_000 && config.budgetScope === 'lifetime'
    && Number.isSafeInteger(config.stagingSmokeBudgetCents)
    && config.stagingSmokeBudgetCents >= 4 && config.stagingSmokeBudgetCents <= 500
    && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
      .test(config.stagingSmokeActivationId)
    && config.runMaxProviderCalls === 5
    && config.externalExecutionApproved === true && config.automaticPublicationAllowed === false,
  'listing_ai_web_configuration_invalid');
  check(config.providerSecretMetadataValidated === true
    && hashPattern.test(config.providerSecretMetadataReceiptSha256)
    && config.providerSecretOwnerUid === 0
    && ((config.providerSecretMode === '0600' && config.providerSecretGroupGid === 0)
      || (config.providerSecretMode === '0640' && config.providerSecretGroupGid === 65532))
    && config.providerSecretRegularFile === true && config.providerSecretNonSymlink === true
    && config.providerSecretOutsideRepository === true
    && config.providerSecretReadOnlyMount === true
    && config.rollbackToMockVerified === true
    && hashPattern.test(config.rollbackToMockProofSha256),
  'listing_ai_web_secret_or_rollback_proof_invalid');
  const configurationJson = JSON.stringify(config);
  check(hashPattern.test(value.configurationSha256)
    && sha(configurationJson) === value.configurationSha256,
  'listing_ai_web_configuration_digest_mismatch');
  const capability = value.capability;
  check(capability.authenticatedReadback === true && capability.available === true
    && capability.provider === 'openai' && capability.mode === 'external'
    && capability.budgetScope === 'lifetime'
    && capability.lifetimeBudgetCents === config.budgetCents
    && capability.stagingSmokeBudgetCents === config.stagingSmokeBudgetCents
    && capability.stagingSmokeActivationId === config.stagingSmokeActivationId
    && capability.supportedClientVersion === web.clientVersion
    && Number.isSafeInteger(capability.imageLimit) && capability.imageLimit > 0
    && capability.imageLimit <= 4 && typeof capability.disclosureVersion === 'string'
    && capability.disclosureVersion.length > 0 && hashPattern.test(capability.disclosureHash)
    && typeof capability.configRevision === 'string' && capability.configRevision.length > 0
    && hashPattern.test(capability.configurationSha256)
    && capability.configurationSha256 === value.configurationSha256,
  'listing_ai_web_capability_invalid');
  const capabilityJson = JSON.stringify(capability);
  check(hashPattern.test(value.capabilitySha256) && sha(capabilityJson) === value.capabilitySha256,
    'listing_ai_web_capability_digest_mismatch');
  const collected = iso(value.collectedAtUtc, 'listing_ai_web_readiness_time');
  const until = iso(value.validUntilUtc, 'listing_ai_web_readiness_time');
  const promoted = iso(config.promotedAtUtc, 'listing_ai_web_promotion_time');
  const readAt = iso(capability.readAtUtc, 'listing_ai_web_capability_time');
  const validated = now instanceof Date ? now.getTime() : iso(now, 'listing_ai_web_clock');
  check(until > collected && until - collected <= 60 * 60_000 && validated >= collected
    && validated < until && promoted <= collected && readAt >= collected && readAt <= validated,
  'listing_ai_web_readiness_stale');
  const decision = value.geminiDecision;
  const decisionJson = JSON.stringify(decision);
  check(hashPattern.test(value.geminiDecisionSha256)
    && sha(decisionJson) === value.geminiDecisionSha256,
  'listing_ai_web_decision_digest_mismatch');
  const decided = iso(decision.decidedAtUtc, 'listing_ai_web_decision_time');
  const decisionUntil = iso(decision.validUntilUtc, 'listing_ai_web_decision_time');
  check(decision.schemaVersion === 1 && decision.kind === 'sit-staging-listing-ai-web-decision'
    && decision.evidenceClass === 'independent-gemini-release-review'
    && decision.reviewerRole === 'gemini-independent' && decision.decision === 'approve-external-web-listing-ai'
    && typeof decision.gateId === 'string' && /^[A-Z0-9][A-Z0-9-]{5,100}$/u.test(decision.gateId)
    && decision.sourceCommit === web.sourceCommit && decision.clientVersion === web.clientVersion
    && decision.runtimeCommit === config.runtimeCommit && decision.imageDigest === config.imageDigest
    && decision.promotionReceiptSha256 === config.promotionReceiptSha256
    && decision.capabilitySha256 === value.capabilitySha256
    && decision.configurationSha256 === value.configurationSha256
    && hashPattern.test(decision.decisionEvidenceSha256)
    && decided >= collected && decisionUntil > decided && decisionUntil - decided <= 60 * 60_000
    && decisionUntil <= until && validated >= decided && validated < decisionUntil,
  'listing_ai_web_decision_invalid');
  return Object.freeze({ profileVersion: LISTING_AI_WEB_PROFILE, readinessJson: bytes,
    readinessDigest: evidenceDigest, configurationDigest: value.configurationSha256,
    capabilityDigest: value.capabilitySha256, decisionDigest: value.geminiDecisionSha256,
    validatedAtUtc: new Date(validated).toISOString() });
}

export function validateListingAiWebBinding(binding,
  { expectedSource, expectedVersion, freshAt = null } = {}) {
  if (binding?.profileVersion === LISTING_AI_MOCK_WEB_PROFILE) {
    return validateListingAiMockWebBinding(binding, { expectedSource, expectedVersion, freshAt });
  }
  exact(binding, ['profileVersion', 'readinessJson', 'readinessDigest', 'configurationDigest',
    'capabilityDigest', 'decisionDigest', 'validatedAtUtc'], 'listing_ai_web_binding_shape');
  check(binding.profileVersion === LISTING_AI_WEB_PROFILE,
    'listing_ai_web_binding_shape');
  let evidence;
  try { evidence = JSON.parse(binding.readinessJson); }
  catch { throw new Error('listing_ai_web_readiness_shape'); }
  const validated = bindListingAiWebReadiness(evidence, binding.readinessDigest, {
    now: new Date(binding.validatedAtUtc), expectedSource, expectedVersion,
  });
  check(validated.configurationDigest === binding.configurationDigest
    && validated.capabilityDigest === binding.capabilityDigest
    && validated.decisionDigest === binding.decisionDigest
    && validated.validatedAtUtc === binding.validatedAtUtc,
  'listing_ai_web_binding_mismatch');
  if (freshAt !== null) {
    const now = freshAt instanceof Date ? freshAt.getTime() : iso(freshAt, 'listing_ai_web_clock');
    const ready = JSON.parse(binding.readinessJson);
    check(now >= iso(ready.collectedAtUtc, 'listing_ai_web_readiness_time')
      && now < iso(ready.validUntilUtc, 'listing_ai_web_readiness_time')
      && now >= iso(ready.geminiDecision.decidedAtUtc, 'listing_ai_web_decision_time')
      && now < iso(ready.geminiDecision.validUntilUtc, 'listing_ai_web_decision_time'),
    'listing_ai_web_readiness_stale');
  }
  return Object.freeze({ ...validated, validatedAtUtc: binding.validatedAtUtc });
}

export function readListingAiWebReadiness(file, digest, options) {
  let evidence;
  try { evidence = JSON.parse(readProtected(file)); }
  catch (error) {
    if (/^listing_ai_web_[a-z_]+$/u.test(error?.message ?? '')) throw error;
    throw new Error('listing_ai_web_readiness_file');
  }
  return bindListingAiWebReadiness(evidence, digest, options);
}
