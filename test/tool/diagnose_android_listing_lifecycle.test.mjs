import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ownerListingSurfaceClassification,
  runAndroidListingLifecycle,
} from '../../tool/diagnose_android_listing_lifecycle.mjs';

const candidate = Object.freeze({
  applicationId: 'com.shareittoo.app',
  versionName: '1.0.0',
  buildNumber: '2026090505',
  commit: 'e18e788c0d04fe6b80e3be2f63b30d5f3719ae7d',
  releaseChannel: 'internal',
  apiBaseUrl: 'https://staging.shareittoo.com/api/v1',
  apkSha256: '1'.repeat(64),
});

function passingOperations(calls) {
  let revision = 4;
  const server = (status) => async () => {
    calls.push(`server-${status}`);
    revision += 1;
    return { catalogRevision: revision };
  };
  return {
    prepare: async () => {
      calls.push('prepare');
      return { vaultFile: '/private/accounts.json' };
    },
    editDraft: async () => {
      calls.push('edit');
      return { status: 'pixel-owner-draft-edit-saved' };
    },
    verifyDraft: server('draft'),
    publish: async () => {
      calls.push('publish');
      return { status: 'pixel-owner-listing-published' };
    },
    verifyPublished: server('active-1'),
    verifyRenterVisibleBeforePause: async () => {
      calls.push('visible-1');
      return { status: 'pixel-renter-listing-visible' };
    },
    pause: async () => {
      calls.push('pause');
      return { status: 'pixel-owner-listing-pausiert' };
    },
    verifyPaused: server('paused'),
    verifyRenterHiddenWhilePaused: async () => {
      calls.push('hidden-paused');
      return { status: 'pixel-renter-listing-hidden-stably' };
    },
    reactivate: async () => {
      calls.push('reactivate');
      return { status: 'pixel-owner-listing-aktiv' };
    },
    verifyReactivated: server('active-2'),
    verifyRenterVisibleAfterReactivate: async () => {
      calls.push('visible-2');
      return { status: 'pixel-renter-listing-visible' };
    },
    end: async () => {
      calls.push('end');
      return { status: 'pixel-owner-listing-beendet' };
    },
    verifyEnded: server('ended'),
    verifyRenterHiddenAfterEnd: async () => {
      calls.push('hidden-ended');
      return { status: 'pixel-renter-listing-hidden-stably' };
    },
    retire: async () => {
      calls.push('retire');
      return { status: 'email-verified-two-role-product-journey-retired' };
    },
    restoreOwner: async () => {
      calls.push('restore-owner');
      return true;
    },
  };
}

test('classifies a missing owner listing without exposing its title', () => {
  const title = 'SIT Rollenpruefung private-fixture';
  const hierarchy = '<hierarchy>'
    + '<node text="Meine Anzeigen" content-desc="Meine Anzeigen" />'
    + '<node text="Deine Anzeigen konnten nicht sicher geladen werden." />'
    + '<node class="android.widget.ProgressBar" />'
    + '</hierarchy>';
  const classification = ownerListingSurfaceClassification(
    hierarchy,
    title,
    'Aktiv',
  );
  assert.equal(
    classification,
    'my-listings-1_drafts-tab-0_title-0_status-action-0_expected-status-0_load-failed-1_empty-active-0_empty-draft-0_progress-1',
  );
  assert.equal(classification.includes(title), false);
});

test('closes the exact Pixel listing lifecycle with sanitized evidence', async () => {
  const calls = [];
  const result = await runAndroidListingLifecycle({
    candidate,
    deviceSummary: { model: 'Pixel 7 Pro', physical: true },
    operations: passingOperations(calls),
    capturedAt: '2026-09-05T18:00:00.000Z',
  });
  assert.equal(result.status, 'passed-pixel-listing-lifecycle');
  assert.deepEqual(calls, [
    'prepare',
    'edit',
    'server-draft',
    'publish',
    'server-active-1',
    'visible-1',
    'pause',
    'server-paused',
    'hidden-paused',
    'reactivate',
    'server-active-2',
    'visible-2',
    'end',
    'server-ended',
    'hidden-ended',
    'retire',
    'restore-owner',
  ]);
  assert.equal(result.tests.catalogRevisionStrictlyAdvanced, true);
  assert.equal(result.tests.renterHiddenWhilePaused, 'passed-three-stable-settled-observations');
  assert.equal(result.boundaries.paymentEndpointCalled, false);
  assert.equal(result.boundaries.bookingCreated, false);
  assert.equal(result.boundaries.listingLeftActive, false);
  assert.equal(result.boundaries.containsSecrets, false);
  assert.equal(JSON.stringify(result).includes('/private/'), false);
});

test('retires prepared state and restores owner after a lifecycle failure', async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.verifyRenterHiddenWhilePaused = async () => {
    calls.push('hidden-paused');
    throw new Error('Paused listing remained visible safely.');
  };
  await assert.rejects(
    () => runAndroidListingLifecycle({
      candidate,
      deviceSummary: { model: 'Pixel 7 Pro', physical: true },
      operations,
    }),
    /remained visible safely/u,
  );
  assert.deepEqual(calls.slice(-2), ['retire', 'restore-owner']);
});

test('rejects non-monotonic server revisions and still cleans up', async () => {
  const calls = [];
  const operations = passingOperations(calls);
  operations.verifyEnded = async () => {
    calls.push('server-ended');
    return { catalogRevision: 2 };
  };
  await assert.rejects(
    () => runAndroidListingLifecycle({
      candidate,
      deviceSummary: { model: 'Pixel 7 Pro', physical: true },
      operations,
    }),
    /did not close exactly/u,
  );
  assert.deepEqual(calls.slice(-2), ['retire', 'restore-owner']);
});
