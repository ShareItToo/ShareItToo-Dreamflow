#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const fail = code => { const error = new Error(code); error.code = code; throw error; };
const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const hashBytes = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const hashObject = value => hashBytes(Buffer.from(canonical(value)));
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function exactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) fail(code);
}
function fresh(value, now, maximumMs, code) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || parsed > now || now - parsed > maximumMs) fail(code);
  return parsed;
}

/** Validates sanitized, externally collected evidence. No credential bytes are read. */
export function validateTechnicalSandbox106Evidence(evidence, { now = Date.now() } = {}) {
  exactKeys(evidence, ['kind','schemaVersion','environment','pilotId','runtime','promotion','ownerAuthorization','credentials','stripeReadback','rollback','boundaries','validatedAt'], 'sandbox106_evidence_shape');
  if (evidence.kind !== 'sit-technical-sandbox-106-activation-evidence' || evidence.schemaVersion !== 1
      || evidence.environment !== 'staging' || evidence.pilotId !== 'heilbronn_wave0') fail('sandbox106_scope');
  exactKeys(evidence.runtime, ['canonicalContainerId','commit','imageDigest'], 'sandbox106_runtime_shape');
  if (!/^[a-f0-9]{64}$/u.test(evidence.runtime.canonicalContainerId) || !/^[a-f0-9]{40}$/u.test(evidence.runtime.commit)
      || !/^sha256:[a-f0-9]{64}$/u.test(evidence.runtime.imageDigest)) fail('sandbox106_runtime_binding');
  exactKeys(evidence.promotion, ['status','kind','runId','candidateId','receiptSha256','sourceSchema','targetSchema','runtimeCommit','imageDigest','promotedAt'], 'sandbox106_promotion_shape');
  if (evidence.promotion.status !== 'promoted' || evidence.promotion.kind !== 'sit-green-staging-106-106-promotion'
      || !/^[a-z0-9][a-z0-9-]{7,47}$/u.test(evidence.promotion.runId)
      || evidence.promotion.candidateId !== evidence.runtime.canonicalContainerId
      || evidence.promotion.sourceSchema !== 106 || evidence.promotion.targetSchema !== 106
      || evidence.promotion.runtimeCommit !== evidence.runtime.commit || evidence.promotion.imageDigest !== evidence.runtime.imageDigest
      || !sha(evidence.promotion.receiptSha256)) fail('sandbox106_promotion_binding');
  fresh(evidence.promotion.promotedAt, now, 24 * 60 * 60 * 1000, 'sandbox106_promotion_stale');
  exactKeys(evidence.ownerAuthorization, ['id','issuedAt','expiresAt','receiptSha256','scope','userIds'], 'sandbox106_authorization_shape');
  const issued = fresh(evidence.ownerAuthorization.issuedAt, now, 24 * 60 * 60 * 1000, 'sandbox106_authorization_stale');
  const expires = Date.parse(evidence.ownerAuthorization.expiresAt);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/u.test(evidence.ownerAuthorization.id)
      || !sha(evidence.ownerAuthorization.receiptSha256) || evidence.ownerAuthorization.scope !== 'stripe-technical-sandbox-1eur-staging'
      || !Array.isArray(evidence.ownerAuthorization.userIds) || evidence.ownerAuthorization.userIds.length !== 2
      || new Set(evidence.ownerAuthorization.userIds).size !== 2
      || evidence.ownerAuthorization.userIds.some(id => !/^synthetic_sandbox_user_[A-Za-z0-9_-]{4,100}$/u.test(id))
      || !Number.isFinite(expires) || expires <= now || expires - issued > 24 * 60 * 60 * 1000) fail('sandbox106_authorization_invalid');
  exactKeys(evidence.credentials, ['secretKey','webhookSecret'], 'sandbox106_credentials_shape');
  for (const [name, item, expectedKind] of [['secretKey', evidence.credentials.secretKey, 'restricted_test_key'], ['webhookSecret', evidence.credentials.webhookSecret, 'webhook_signing_secret']]) {
    exactKeys(item, ['kind','path','sha256','mode','uid','gid','regular','symlink','outsideRepository','mountReadOnly'], `sandbox106_${name}_shape`);
    if (item.kind !== expectedKind || typeof item.path !== 'string' || !path.isAbsolute(item.path) || item.path.includes('\n')
        || !sha(item.sha256) || item.mode !== '0600' || item.uid !== 100 || item.gid !== 101
        || item.regular !== true || item.symlink !== false || item.outsideRepository !== true || item.mountReadOnly !== true) fail(`sandbox106_${name}_metadata`);
  }
  if (evidence.credentials.secretKey.sha256 === evidence.credentials.webhookSecret.sha256
      || evidence.credentials.secretKey.path === evidence.credentials.webhookSecret.path) fail('sandbox106_credentials_not_distinct');
  exactKeys(evidence.stripeReadback, ['authenticated','accountId','accountMode','livemode','readAt','receiptSha256'], 'sandbox106_stripe_shape');
  fresh(evidence.stripeReadback.readAt, now, 60 * 60 * 1000, 'sandbox106_stripe_readback_stale');
  if (evidence.stripeReadback.authenticated !== true || !/^acct_[A-Za-z0-9]+$/u.test(evidence.stripeReadback.accountId)
      || evidence.stripeReadback.accountMode !== 'test'
      || evidence.stripeReadback.livemode !== false || !sha(evidence.stripeReadback.receiptSha256)) fail('sandbox106_stripe_live_mode');
  exactKeys(evidence.rollback, ['target','receiptSha256','verifiedAt','mockPaymentTransport','technicalSandboxDisabled','secretMountsRemoved'], 'sandbox106_rollback_shape');
  fresh(evidence.rollback.verifiedAt, now, 60 * 60 * 1000, 'sandbox106_rollback_stale');
  if (evidence.rollback.target !== evidence.runtime.commit || !sha(evidence.rollback.receiptSha256)
      || evidence.rollback.mockPaymentTransport !== true || evidence.rollback.technicalSandboxDisabled !== true
      || evidence.rollback.secretMountsRemoved !== true) fail('sandbox106_rollback_invalid');
  exactKeys(evidence.boundaries, ['paymentTransport','stripeLivemode','marketplaceStripe','bookingLedger','connect','payout','notifications','amountMinor','currency','maxRunsPerUser24h','syntheticOnly'], 'sandbox106_boundary_shape');
  if (evidence.boundaries.paymentTransport !== 'memory' || evidence.boundaries.stripeLivemode !== false
      || evidence.boundaries.marketplaceStripe !== false || evidence.boundaries.bookingLedger !== false
      || evidence.boundaries.connect !== false || evidence.boundaries.payout !== false || evidence.boundaries.notifications !== false
      || evidence.boundaries.amountMinor !== 100 || evidence.boundaries.currency !== 'EUR'
      || evidence.boundaries.maxRunsPerUser24h !== 3 || evidence.boundaries.syntheticOnly !== true) fail('sandbox106_boundary_invalid');
  fresh(evidence.validatedAt, now, 60 * 60 * 1000, 'sandbox106_evidence_stale');
  return Object.freeze({ evidenceSha256: hashObject(evidence), runtimeCommit: evidence.runtime.commit,
    imageDigest: evidence.runtime.imageDigest, promotionReceiptSha256: evidence.promotion.receiptSha256,
    authorizationReceiptSha256: evidence.ownerAuthorization.receiptSha256,
    stripeReadbackSha256: evidence.stripeReadback.receiptSha256, rollbackReceiptSha256: evidence.rollback.receiptSha256,
    validatedAt: new Date(now).toISOString() });
}

export function validateTechnicalSandbox106Phase({ evidence, phase, evidenceSha256, rehearsalSha256, confirmation, now = Date.now() }) {
  if (!['collect','preflight','rehearse','promote'].includes(phase)) fail('sandbox106_phase_invalid');
  const binding = validateTechnicalSandbox106Evidence(evidence, { now });
  if (phase === 'collect' && evidenceSha256 === undefined) return Object.freeze({ phase, status: 'collected', ...binding });
  if (evidenceSha256 !== binding.evidenceSha256) fail('sandbox106_evidence_digest');
  if (phase === 'collect') return Object.freeze({ phase, status: 'collected', ...binding });
  if (phase === 'preflight') return Object.freeze({ phase, status: 'preflight_passed', ...binding,
    env: Object.freeze({ PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false', ENABLE_STAGING_STRIPE: '0',
      TECHNICAL_SANDBOX_ENABLED: '1', TECHNICAL_SANDBOX_KILL_SWITCH: '0' }) });
  if (!sha(rehearsalSha256)) fail('sandbox106_rehearsal_receipt_required');
  const expected = `${phase}:${binding.runtimeCommit}:${binding.imageDigest}:${evidenceSha256}:${rehearsalSha256}`;
  if (confirmation !== expected) fail('sandbox106_explicit_confirmation_required');
  return Object.freeze({ phase, status: phase === 'rehearse' ? 'rehearsal_authorized' : 'promotion_authorized', ...binding,
    rehearsalSha256, confirmationBound: true, productionTargetAllowed: false, mutationPerformed: false });
}

function main(argv) {
  const [phase, filename, expectedFileSha, evidenceSha, rehearsalSha, confirmation] = argv;
  if (!phase || !filename || !sha(expectedFileSha)) fail('sandbox106_arguments');
  const absolute = path.resolve(filename);
  if (!path.isAbsolute(filename) || absolute !== filename || absolute === repositoryRoot
      || absolute.startsWith(`${repositoryRoot}${path.sep}`)) fail('sandbox106_path');
  const lstat = fs.lstatSync(absolute);
  if (!lstat.isFile() || lstat.isSymbolicLink() || lstat.nlink !== 1 || lstat.uid !== process.getuid()
      || (lstat.mode & 0o7777) !== 0o600 || lstat.size > 32768) fail('sandbox106_input_metadata');
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_CLOEXEC);
  let bytes;
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.dev !== lstat.dev || opened.ino !== lstat.ino || opened.nlink !== 1
        || opened.uid !== process.getuid() || (opened.mode & 0o7777) !== 0o600 || opened.size !== lstat.size) fail('sandbox106_input_metadata');
    bytes = Buffer.alloc(opened.size); let offset = 0;
    while (offset < bytes.length) { const n = fs.readSync(fd, bytes, offset, bytes.length - offset, offset); if (n <= 0) fail('sandbox106_input_read'); offset += n; }
    const after = fs.fstatSync(fd);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
        || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) fail('sandbox106_input_changed');
  } finally { fs.closeSync(fd); }
  if (hashBytes(bytes) !== expectedFileSha) fail('sandbox106_file_digest');
  let evidence; try { evidence = JSON.parse(bytes.toString('utf8')); } catch { fail('sandbox106_json'); }
  bytes.fill(0);
  const result = validateTechnicalSandbox106Phase({ evidence, phase, evidenceSha256: phase === 'collect' && evidenceSha === undefined ? undefined : evidenceSha,
    rehearsalSha256: rehearsalSha, confirmation, now: Date.now() });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error?.code ?? 'sandbox106_failed'}\n`); process.exitCode = 1; }
}
