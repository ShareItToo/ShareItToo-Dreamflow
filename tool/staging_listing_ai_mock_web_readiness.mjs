import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const LISTING_AI_MOCK_WEB_PROFILE = 'staging-listing-ai-mock-web-v1';
export const LISTING_AI_MOCK_DISCLOSURE_VERSION = 'listing-ai-mock-disclosure-v1';
export const LISTING_AI_MOCK_DISCLOSURE_TEXT = 'SIT verwendet für diesen technischen Test ausschließlich eine gekennzeichnete synthetische KI-Antwort. Es werden keine externen KI-Dienste kontaktiert und nichts wird automatisch veröffentlicht.';
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const hash = /^[a-f0-9]{64}$/u;
const commit = /^[a-f0-9]{40}$/u;
const fail = (code) => { throw new Error(`listing_ai_mock_web_${code}`); };
const check = (condition, code) => { if (!condition) fail(code); };
const exact = (value, keys, code = 'shape') => check(value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)), code);
const iso = (value) => {
  const timestamp = Date.parse(value);
  check(Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value, 'time');
  return timestamp;
};

function readProtected(file) {
  check(typeof file === 'string' && path.isAbsolute(file) && path.normalize(file) === file, 'path');
  const descriptors = [];
  const sameFile = (left, right) => [
    'dev', 'ino', 'mode', 'uid', 'gid', 'nlink', 'size', 'mtimeNs', 'ctimeNs',
  ].every((key) => left[key] === right[key]);
  const sameDirectory = (left, right, protectedRoot) => (
    protectedRoot ? ['dev', 'ino', 'mode', 'uid', 'gid', 'nlink']
      : ['dev', 'ino', 'mode', 'uid', 'gid']
  ).every((key) => left[key] === right[key]);
  let bytes;
  try {
    const directories = ['/'];
    for (const part of path.dirname(file).split('/').filter(Boolean)) {
      directories.push(path.join(directories.at(-1), part));
    }
    const opened = directories.map((directory, index) => {
      const descriptor = fs.openSync(directory, fs.constants.O_RDONLY
        | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      descriptors.push(descriptor);
      const stat = fs.fstatSync(descriptor, { bigint: true });
      check(stat.isDirectory() && sameDirectory(
        stat,
        fs.lstatSync(directory, { bigint: true }),
        index === directories.length - 1,
      ), 'path');
      return { directory, descriptor, stat };
    });
    const protectedRoot = opened.at(-1).stat;
    check(protectedRoot.uid === BigInt(process.getuid())
      && (protectedRoot.mode & 0o7777n) === 0o700n, 'parent');
    const fd = fs.openSync(file, fs.constants.O_RDONLY
      | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    descriptors.push(fd);
    const before = fs.fstatSync(fd, { bigint: true });
    check(before.isFile() && before.nlink === 1n
      && before.uid === BigInt(process.getuid())
      && (before.mode & 0o7777n) === 0o600n
      && before.size >= 2n && before.size <= 16384n
      && sameFile(before, fs.lstatSync(file, { bigint: true })), 'file');
    const assertPathsUnchanged = () => {
      for (const [index, entry] of opened.entries()) {
        const root = index === opened.length - 1;
        check(sameDirectory(entry.stat, fs.fstatSync(entry.descriptor, { bigint: true }), root)
          && sameDirectory(entry.stat,
            fs.lstatSync(entry.directory, { bigint: true }), root), 'changed');
      }
    };
    assertPathsUnchanged();
    bytes = Buffer.alloc(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) { const count = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); check(count > 0, 'changed'); offset += count; }
    check(fs.readSync(fd, Buffer.alloc(1), 0, 1, bytes.length) === 0
      && sameFile(before, fs.fstatSync(fd, { bigint: true }))
      && sameFile(before, fs.lstatSync(file, { bigint: true })), 'changed');
    assertPathsUnchanged();
  } catch (error) {
    if (/^listing_ai_mock_web_[a-z_]+$/u.test(error?.message ?? '')) throw error;
    fail('file');
  } finally {
    let closeFailed = false;
    for (const descriptor of descriptors.reverse()) {
      try { fs.closeSync(descriptor); } catch { closeFailed = true; }
    }
    check(!closeFailed, 'file');
  }
  return bytes;
}

export function bindListingAiMockWebReadiness(evidence, evidenceDigest,
  { now = new Date(), expectedSource, expectedVersion } = {}) {
  const keys = ['schemaVersion', 'kind', 'evidenceClass', 'syntheticFixture', 'web', 'runtime',
    'configuration', 'configurationSha256', 'capability', 'capabilitySha256', 'collectedAtUtc', 'validUntilUtc'];
  exact(evidence, keys);
  exact(evidence.web, ['sourceCommit', 'clientVersion']);
  exact(evidence.runtime, ['environment', 'runtimeCommit', 'imageDigest']);
  exact(evidence.configuration, ['environment', 'provider', 'model', 'budgetCents',
    'externalProviderExecutionAllowed', 'automaticPublicationAllowed', 'productionEligible', 'runtimeCommit', 'imageDigest']);
  exact(evidence.capability, ['authenticatedReadback', 'available', 'provider', 'mode', 'model', 'budgetCents',
    'externalProviderExecutionAllowed', 'automaticPublicationAllowed', 'productionEligible',
    'supportedClientVersion', 'runtimeCommit', 'imageDigest', 'disclosureVersion', 'disclosureText',
    'disclosureHash', 'configRevision', 'configurationSha256', 'readAtUtc']);
  const json = JSON.stringify(evidence);
  check(evidence.schemaVersion === 1 && evidence.kind === 'sit-staging-listing-ai-mock-web-readiness'
    && evidence.evidenceClass === 'authenticated-staging-mock-capability' && evidence.syntheticFixture === false
    && hash.test(evidenceDigest ?? '') && sha(json) === evidenceDigest, 'evidence');
  check(commit.test(evidence.web.sourceCommit) && evidence.web.sourceCommit === expectedSource
    && /^\d+\.\d+\.\d+\+\d+$/u.test(evidence.web.clientVersion)
    && evidence.web.clientVersion === expectedVersion, 'source_binding');
  const { runtime, configuration: config, capability } = evidence;
  check(runtime.environment === 'staging' && commit.test(runtime.runtimeCommit)
    && /^sha256:[a-f0-9]{64}$/u.test(runtime.imageDigest)
    && config.environment === 'staging' && config.provider === 'mock' && config.model === 'listing-ai-mock-v1'
    && config.budgetCents === 0 && config.externalProviderExecutionAllowed === false
    && config.automaticPublicationAllowed === false && config.productionEligible === false
    && config.runtimeCommit === runtime.runtimeCommit && config.imageDigest === runtime.imageDigest,
  'configuration');
  const configurationSha256 = sha(JSON.stringify(config));
  check(hash.test(evidence.configurationSha256) && evidence.configurationSha256 === configurationSha256,
    'configuration_digest');
  check(capability.authenticatedReadback === true && capability.available === true
    && capability.provider === 'mock' && capability.mode === 'mock' && capability.model === 'listing-ai-mock-v1'
    && capability.budgetCents === 0 && capability.externalProviderExecutionAllowed === false
    && capability.automaticPublicationAllowed === false && capability.productionEligible === false
    && capability.supportedClientVersion === evidence.web.clientVersion
    && capability.runtimeCommit === runtime.runtimeCommit && capability.imageDigest === runtime.imageDigest
    && capability.disclosureVersion === LISTING_AI_MOCK_DISCLOSURE_VERSION
    && capability.disclosureText === LISTING_AI_MOCK_DISCLOSURE_TEXT
    && hash.test(capability.disclosureHash) && sha(capability.disclosureText) === capability.disclosureHash
    && typeof capability.configRevision === 'string' && capability.configRevision.length > 0
    && capability.configurationSha256 === configurationSha256, 'capability');
  const capabilitySha256 = sha(JSON.stringify(capability));
  check(hash.test(evidence.capabilitySha256) && evidence.capabilitySha256 === capabilitySha256, 'capability_digest');
  const collected = iso(evidence.collectedAtUtc); const until = iso(evidence.validUntilUtc);
  const readAt = iso(capability.readAtUtc); const at = now instanceof Date ? now.getTime() : iso(now);
  check(until > collected && until - collected <= 15 * 60_000 && at >= collected && at < until
    && readAt >= collected && readAt <= at && at - readAt <= 2 * 60_000, 'stale');
  return Object.freeze({ profileVersion: LISTING_AI_MOCK_WEB_PROFILE, readinessJson: json,
    readinessDigest: evidenceDigest, configurationDigest: configurationSha256,
    capabilityDigest: capabilitySha256, decisionDigest: null, validatedAtUtc: new Date(at).toISOString() });
}

export function validateListingAiMockWebBinding(binding, options) {
  exact(binding, ['profileVersion', 'readinessJson', 'readinessDigest', 'configurationDigest',
    'capabilityDigest', 'decisionDigest', 'validatedAtUtc'], 'binding_shape');
  check(binding.profileVersion === LISTING_AI_MOCK_WEB_PROFILE && binding.decisionDigest === null, 'binding_shape');
  let evidence;
  try { evidence = JSON.parse(binding.readinessJson); } catch { fail('shape'); }
  const result = bindListingAiMockWebReadiness(evidence, binding.readinessDigest, {
    ...options, now: new Date(binding.validatedAtUtc),
  });
  check(result.configurationDigest === binding.configurationDigest && result.capabilityDigest === binding.capabilityDigest
    && result.validatedAtUtc === binding.validatedAtUtc, 'binding_mismatch');
  if (options?.freshAt !== null && options?.freshAt !== undefined) {
    const now = options.freshAt instanceof Date ? options.freshAt.getTime() : iso(options.freshAt);
    const ready = JSON.parse(binding.readinessJson);
    check(now >= iso(ready.collectedAtUtc) && now < iso(ready.validUntilUtc), 'stale');
  }
  return result;
}

export function readListingAiMockWebReadiness(file, digest, options) {
  let evidence;
  try { evidence = JSON.parse(readProtected(file)); } catch (error) {
    if (/^listing_ai_mock_web_[a-z_]+$/u.test(error?.message ?? '')) throw error;
    fail('file');
  }
  return bindListingAiMockWebReadiness(evidence, digest, options);
}
