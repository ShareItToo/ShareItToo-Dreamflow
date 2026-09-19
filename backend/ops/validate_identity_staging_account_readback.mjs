#!/usr/bin/env node

import crypto from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Stripe from 'stripe';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const maxAgeMs = 24 * 60 * 60 * 1000;
const statuses = new Set(['requires_input', 'processing', 'verified', 'canceled', 'redacted']);

function fail(code) {
  const error = new Error('Stripe Identity staging account readback gate failed.');
  error.code = code;
  throw error;
}

function readPrivateFile(filePath, { minSize = 1, maxSize = 512, label }) {
  if (!isAbsolute(filePath ?? '')) fail(`${label}_path_invalid`);
  let descriptor;
  try {
    descriptor = openSync(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_CLOEXEC);
    const metadata = fstatSync(descriptor);
    const linkMetadata = lstatSync(filePath);
    const resolved = realpathSync(filePath);
    const inside = relative(realpathSync(repositoryRoot), resolved);
    if (!metadata.isFile() || linkMetadata.isSymbolicLink()
        || inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) {
      fail(`${label}_location_invalid`);
    }
    if ((metadata.mode & 0o777) !== 0o600
        || (typeof process.getuid === 'function' && metadata.uid !== process.getuid())) {
      fail(`${label}_permissions_invalid`);
    }
    if (metadata.size < minSize || metadata.size > maxSize) fail(`${label}_size_invalid`);
    const bytes = readFileSync(descriptor);
    return { bytes, value: bytes.toString('utf8').trim() };
  } catch (error) {
    if (String(error?.code ?? '').startsWith(`${label}_`)) throw error;
    if (error?.code === 'ELOOP') fail(`${label}_location_invalid`);
    fail(`${label}_unavailable`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readEvidence(evidenceFile) {
  const inspected = readPrivateFile(evidenceFile, {
    minSize: 180,
    maxSize: 16_384,
    label: 'identity_staging_readback_evidence',
  });
  try {
    try {
      return JSON.parse(inspected.value);
    } catch {
      fail('identity_staging_readback_evidence_json_invalid');
    }
  } finally {
    inspected.bytes.fill(0);
  }
}

function assertNoSensitiveEvidence(value, path = 'root') {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveEvidence(entry, `${path}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (/^(?:secret|secretKey|webhookSecret|client_secret|clientSecret|document|selfie|provider_session_id|raw_payload)$/u.test(key)) {
      fail(`identity_staging_readback_sensitive_field:${path}.${key}`);
    }
    assertNoSensitiveEvidence(entry, `${path}.${key}`);
  }
}

function canonicalAccountContext(account) {
  return {
    id: typeof account?.id === 'string' ? account.id : null,
    country: account?.country ?? account?.identity?.country ?? null,
    currency: account?.default_currency ?? account?.defaults?.currency ?? null,
    type: account?.type ?? account?.object ?? null,
  };
}

export function identityAccountContextHash(account) {
  return crypto.createHash('sha256')
    .update(JSON.stringify(canonicalAccountContext(account)))
    .digest('hex');
}

export function identityVerificationSessionIdHash(sessionId) {
  return crypto.createHash('sha256').update(sessionId).digest('hex');
}

export async function validateIdentityStagingAccountReadback({
  evidenceFile,
  secretKeyFile,
  verificationSessionIdFile,
  deploymentCommit,
  pilotId,
  now = Date.now(),
  stripeClient = null,
} = {}) {
  const evidence = readEvidence(evidenceFile);
  assertNoSensitiveEvidence(evidence);
  if (evidence?.kind !== 'sit-stripe-identity-staging-account-readback'
      || evidence.commit !== deploymentCommit
      || evidence.pilotId !== pilotId
      || evidence.mode !== 'test'
      || evidence.provider !== 'stripe_identity'
      || !/^acct_[A-Za-z0-9]+$/u.test(String(evidence.accountId ?? ''))
      || !/^[0-9a-f]{64}$/u.test(String(evidence.accountContextHash ?? ''))
      || !/^[0-9a-f]{64}$/u.test(String(evidence.verificationSessionIdHash ?? ''))
      || evidence.credentialSource !== 'file'
      || evidence.secretKeyClass !== 'rk_test_'
      || evidence.webhookSecretConfigured !== true) {
    fail('identity_staging_readback_binding_invalid');
  }
  const observedAt = Date.parse(evidence.observedAt ?? '');
  if (!Number.isFinite(observedAt)
      || observedAt > now + 5 * 60 * 1000
      || now - observedAt > maxAgeMs) {
    fail('identity_staging_readback_stale');
  }

  const secret = readPrivateFile(secretKeyFile, {
    minSize: 16,
    maxSize: 512,
    label: 'identity_staging_secret_key',
  });
  const sessionId = readPrivateFile(verificationSessionIdFile, {
    minSize: 8,
    maxSize: 255,
    label: 'identity_staging_session_id',
  });
  try {
    if (!/^rk_test_[A-Za-z0-9]{16,500}$/u.test(secret.value)) {
      fail('identity_staging_secret_key_invalid');
    }
    if (!/^vs_[A-Za-z0-9]+$/u.test(sessionId.value)) {
      fail('identity_staging_session_id_invalid');
    }
    if (identityVerificationSessionIdHash(sessionId.value) !== evidence.verificationSessionIdHash) {
      fail('identity_staging_readback_session_hash_mismatch');
    }
    // A real SDK client is initialized for every validation. Tests may inject
    // an SDK-shaped client to remain network-free, but no create/mutation API
    // is called by this validator.
    const client = stripeClient ?? new Stripe(secret.value, {
      apiVersion: '2026-08-26.dahlia',
      maxNetworkRetries: 0,
    });
    if (typeof client?.accounts?.retrieve !== 'function'
        || typeof client?.identity?.verificationSessions?.retrieve !== 'function') {
      fail('identity_staging_sdk_surface_invalid');
    }
    const account = await client.accounts.retrieve();
    if (account?.id !== evidence.accountId
        || identityAccountContextHash(account) !== evidence.accountContextHash) {
      fail('identity_staging_readback_account_mismatch');
    }
    // Stripe's Account object has no trustworthy livemode field for this
    // binding; do not invent or require one. VerificationSession is the
    // authoritative mode-bearing object for this sandbox flow.
    const session = await client.identity.verificationSessions.retrieve(sessionId.value);
    if (session?.id !== sessionId.value
        || session.livemode !== false
        || !statuses.has(session.status)) {
      fail('identity_staging_readback_session_invalid');
    }
    return Object.freeze({
      kind: evidence.kind,
      commit: evidence.commit,
      pilotId: evidence.pilotId,
      observedAt: evidence.observedAt,
      accountId: account.id,
      accountContextHash: evidence.accountContextHash,
      verificationSessionIdHash: evidence.verificationSessionIdHash,
      verificationSessionLivemode: false,
      verificationSessionStatus: session.status,
      credentialSource: 'file',
      secretKeyClass: 'rk_test_',
      providerReadback: true,
      mutationPerformed: false,
    });
  } finally {
    secret.bytes.fill(0);
    sessionId.bytes.fill(0);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await validateIdentityStagingAccountReadback({
      evidenceFile: process.env.IDENTITY_STAGING_ACCOUNT_READBACK_EVIDENCE_FILE ?? '',
      secretKeyFile: process.env.IDENTITY_STRIPE_SECRET_KEY_HOST_FILE ?? '',
      verificationSessionIdFile: process.env.IDENTITY_VERIFICATION_SESSION_ID_HOST_FILE ?? '',
      deploymentCommit: process.env.SIT_DEPLOYMENT_COMMIT ?? '',
      pilotId: process.env.SIT_STAGING_PILOT_ID ?? '',
    });
    process.stdout.write('Stripe Identity staging account readback gate: PASS\n');
  } catch (error) {
    process.stderr.write(`${error?.message ?? 'Stripe Identity staging account readback gate failed.'}\n`);
    process.exitCode = 1;
  }
}
