import assert from 'node:assert/strict';
import test from 'node:test';

import { StripeProvider } from '../src/stripe_provider.js';

test('memory identity fixture resumes deterministically after provider restart', async () => {
  const firstProvider = new StripeProvider({ mode: 'memory' });
  const created = await firstProvider.createIdentityVerificationSession({
    providerIdempotencyKey: 'sit_identity_restart_fixture',
  });

  const restartedProvider = new StripeProvider({ mode: 'memory' });
  const resumed = await restartedProvider.retrieveIdentityVerificationSession(created.id);
  assert.deepEqual(resumed, {
    id: created.id,
    object: 'identity.verification_session',
    status: 'requires_input',
    livemode: false,
    url: null,
  });

  const redacted = await restartedProvider.redactIdentityVerificationSession(created.id);
  assert.deepEqual(redacted, {
    id: created.id,
    status: 'requires_input',
    redaction: { status: 'redacted' },
    livemode: false,
  });
});
