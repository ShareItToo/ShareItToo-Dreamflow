import assert from 'node:assert/strict';
import test from 'node:test';

import {
  projectNonBindingDiagnosticVault,
  reusableNonBindingDiagnosticContext,
  sanitizedChildFailure,
} from '../../tool/run_isolated_android_device_message_diagnostic.mjs';

test('preserves a bounded generic child diagnostic failure', () => {
  assert.equal(
    sanitizedChildFailure({
      stderr: 'ERROR: The controlled message did not appear after realtime recovery.\n',
    }),
    'The controlled message did not appear after realtime recovery.',
  );
});

test('rejects child failure details containing private-looking values', () => {
  assert.equal(
    sanitizedChildFailure({
      stderr: 'ERROR: Account test@example.invalid could not use token 123456789.\n',
    }),
    null,
  );
});

test('keeps structured Staging failures while removing request correlation identifiers', () => {
  assert.equal(
    sanitizedChildFailure({
      stderr: 'ERROR: Staging POST request failed with HTTP 409 (listing_limit_reached) [request private-correlation-123456789].\n',
    }),
    'Staging POST request failed with HTTP 409 (listing_limit_reached).',
  );
});

test('rejects unstructured child stderr', () => {
  assert.equal(sanitizedChildFailure({ stderr: 'unexpected stack trace\n' }), null);
});

test('preserves a bounded generic parent-stage failure', () => {
  assert.equal(
    sanitizedChildFailure({ message: 'The protected fixture is not ready.' }),
    'The protected fixture is not ready.',
  );
});

test('reuses only a verified accepted payment-free non-binding simulation', () => {
  const vault = {
    status: 'non-binding-simulation-active',
    verificationMethod: 'isolated-staging-fixture',
    accounts: ['owner', 'renter'].map((role) => ({
      role,
      registrationStatus: 'accepted',
      verificationStatus: 'fixture-verified',
    })),
    nonBindingSimulation: {
      schemaVersion: 1,
      status: 'accepted-chat-ready',
      listingId: 'listing',
      bookingId: 'booking',
      threadId: 'thread',
      availabilityUnaffected: true,
      paymentReadRejected: true,
      inAppNotificationsVerified: true,
      paymentEndpointCalled: false,
      stripeLivemode: false,
    },
  };
  assert.equal(reusableNonBindingDiagnosticContext(vault), true);
  assert.equal(reusableNonBindingDiagnosticContext({
    ...vault,
    nonBindingSimulation: { ...vault.nonBindingSimulation, stripeLivemode: true },
  }), false);
  assert.equal(reusableNonBindingDiagnosticContext({
    ...vault,
    verificationMethod: 'email-link',
    accounts: vault.accounts.map((account) => ({
      ...account,
      verificationStatus: 'email-link-verified',
    })),
  }), true);
  assert.equal(reusableNonBindingDiagnosticContext({
    ...vault,
    accounts: vault.accounts.map((account) => ({ ...account, role: 'owner' })),
  }), false);
  assert.equal(reusableNonBindingDiagnosticContext({
    ...vault,
    verificationMethod: 'email-link',
  }), false);

  const projected = projectNonBindingDiagnosticVault({
    ...vault,
    runId: 'fixture-run',
  });
  assert.equal(vault.syntheticBooking, undefined);
  assert.equal(projected.nonBindingSimulation, undefined);
  assert.equal(projected.status, 'synthetic-booking-active');
  assert.deepEqual(projected.syntheticBooking, {
    schemaVersion: 1,
    listingId: 'listing',
    bookingId: 'booking',
    threadId: 'thread',
    title: 'SIT Rollenprüfung fixture-run',
    workflowStatus: 'accepted',
    paymentMode: 'memory',
    stripeLivemode: false,
    paymentEndpointCalled: false,
  });
});
