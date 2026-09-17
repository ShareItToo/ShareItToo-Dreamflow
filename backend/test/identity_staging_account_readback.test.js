import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { validateIdentityStagingAccountReadback } from '../ops/validate_identity_staging_account_readback.mjs';

const accountId = 'acct_current_identity_test';
const evidence = {
  accountId: 'acct_evidencemustnotbeused',
  accountContextHash: crypto.createHash('sha256').update(accountId).digest('hex'),
};

function currentAccount(overrides = {}) {
  return {
    id: accountId,
    livemode: false,
    country: 'DE',
    ...overrides,
  };
}

test('Identity staging readback uses the restricted key current account and never creates a session', async () => {
  const calls = [];
  let verificationCreates = 0;
  const stripeClient = {
    accounts: {
      retrieve: async (...args) => {
        calls.push(args);
        return currentAccount();
      },
    },
    identity: {
      verificationSessions: {
        create: async () => {
          verificationCreates += 1;
          throw new Error('must not be called');
        },
      },
    },
  };
  const result = await validateIdentityStagingAccountReadback({ evidence, stripeClient });
  assert.deepEqual(calls, [[]]);
  assert.equal(verificationCreates, 0);
  assert.deepEqual(result, {
    livemode: false,
    country: 'DE',
    accountContextHash: evidence.accountContextHash,
  });
});

test('Identity staging readback fails closed for live, non-DE, unavailable, or mismatched identity accounts', async () => {
  for (const account of [
    currentAccount({ livemode: true }),
    currentAccount({ country: 'US' }),
    currentAccount({ id: 'acct_other' }),
  ]) {
    await assert.rejects(
      validateIdentityStagingAccountReadback({
        evidence,
        stripeClient: { accounts: { retrieve: async () => account } },
      }),
      /readback gate failed/u,
    );
  }
});
