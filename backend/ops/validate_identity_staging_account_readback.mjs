#!/usr/bin/env node
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import Stripe from 'stripe';

function fail(code = 'identity_staging_account_readback_failed') {
  const error = new Error('Stripe Identity staging account readback gate failed.');
  error.code = code;
  throw error;
}

export async function validateIdentityStagingAccountReadback({ evidence, stripeClient } = {}) {
  if (!evidence || typeof evidence !== 'object'
      || !/^acct_[A-Za-z0-9]+$/u.test(String(evidence.accountId ?? ''))
      || !/^[0-9a-f]{64}$/u.test(String(evidence.accountContextHash ?? ''))) {
    fail('identity_staging_account_evidence_invalid');
  }
  if (!stripeClient?.accounts || typeof stripeClient.accounts.retrieve !== 'function') {
    fail('identity_staging_account_client_invalid');
  }
  let account;
  try {
    // Read the authenticated current account. Never pass an account ID here:
    // the restricted key's account context is the authority being checked.
    account = await stripeClient.accounts.retrieve();
  } catch {
    fail('identity_staging_account_unavailable');
  }
  const actualHash = crypto.createHash('sha256').update(String(account?.id ?? '')).digest('hex');
  if (account?.livemode !== false
      || account?.country !== 'DE'
      || account?.identity?.country !== undefined
         && account.identity.country !== 'DE'
      || actualHash !== evidence.accountContextHash) {
    fail('identity_staging_account_mismatch');
  }
  return Object.freeze({ livemode: false, country: 'DE', accountContextHash: actualHash });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const evidencePath = process.env.IDENTITY_STAGING_EVIDENCE_FILE?.trim();
  const secretPath = process.env.IDENTITY_STRIPE_SECRET_KEY_HOST_FILE?.trim();
  if (!evidencePath || !secretPath) fail('identity_staging_account_inputs_missing');
  let evidence;
  try { evidence = JSON.parse(readFileSync(evidencePath, 'utf8')); } catch { fail('identity_staging_account_evidence_invalid'); }
  const secretKey = readFileSync(secretPath, 'utf8').trim();
  if (!/^rk_test_[A-Za-z0-9]{16,500}$/u.test(secretKey)) fail('identity_staging_account_secret_invalid');
  const stripe = new Stripe(secretKey, {
    apiVersion: process.env.STRIPE_API_VERSION?.trim() || '2026-08-26.dahlia',
    maxNetworkRetries: 0,
    timeout: 15_000,
  });
  await validateIdentityStagingAccountReadback({ evidence, stripeClient: stripe });
  process.stdout.write('Stripe Identity staging account readback: PASS\n');
}
