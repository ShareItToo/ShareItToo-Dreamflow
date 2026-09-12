import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { validateG2DataLifecycle } from '../../tool/validate_g2_data_lifecycle.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseLifecycle = JSON.parse(
  readFileSync(resolve(root, 'store/g2-data-lifecycle.json'), 'utf8'),
);
const clone = (value) => structuredClone(value);

function validate({ lifecycleManifest = clone(baseLifecycle), sourceTexts = {} } = {}) {
  return validateG2DataLifecycle({ root, lifecycleManifest, sourceTexts });
}

test('accepts active local and account-bound persistent G2B data', () => {
  assert.deepEqual(validate(), {
    state: 'g2b-persistent-cart-active',
    currentSavedItemKeyCount: 5,
    localSafetyPrivacyKeyCount: 9,
    persistentCartEnabled: true,
    projectCartEnabled: true,
    reservationCreatedByCart: false,
  });
});

test('rejects disconnected or unowned extracted listing-to-cart intent', () => {
  for (const [path, marker] of [
    ['lib/widgets/item_details_overlay.dart', 'saveListingToRentalCart(context, item: item, range: range)'],
    ...['DataService.addRentalCartItem', 'expectedOwner: owner', 'await action.isCurrent()',
      'await action.notice(context,', 'noch nicht reserviert',
      'Speichern im Mietkorb konnte nicht bestätigt werden'].map(marker => ['lib/widgets/saved_cart_intent.dart', marker]),
  ]) {
    const original = readFileSync(resolve(root, path), 'utf8');
    assert.ok(original.includes(marker));
    const changed = original.replaceAll(marker, 'removed_required_contract');
    assert.throws(() => validate({ sourceTexts: { [path]: changed } }), /(?:Item detail Mietkorb entry|Owned Mietkorb intent) is missing/u);
  }
});

test('rejects cross-principal or unbounded local safety/privacy state', () => {
  const unscoped = clone(baseLifecycle);
  unscoped.localSafetyPrivacy.principalBinding = 'device-global';
  assert.throws(
    () => validate({ lifecycleManifest: unscoped }),
    /Local safety\/privacy lifecycle is incomplete/u,
  );

  const unbounded = clone(baseLifecycle);
  unbounded.localSafetyPrivacy.maximumRetainedPrincipals = null;
  assert.throws(
    () => validate({ lifecycleManifest: unbounded }),
    /Local safety\/privacy lifecycle is incomplete/u,
  );
});

test('rejects unbound or read-seeded local review reputation state', () => {
  const unbound = clone(baseLifecycle);
  unbound.localReviewReputation.mutationIdentityBinding = 'caller-provided-id';
  assert.throws(
    () => validate({ lifecycleManifest: unbound }),
    /Local review\/reputation lifecycle is incomplete/u,
  );

  const seeded = clone(baseLifecycle);
  seeded.localReviewReputation.demoSeedPolicy = 'seed-on-public-read';
  assert.throws(
    () => validate({ lifecycleManifest: seeded }),
    /Local review\/reputation lifecycle is incomplete/u,
  );
});

test('rejects a cart reservation or hold claim', () => {
  for (const key of [
    'reservationCreatedByCart',
    'availabilityHoldCreatedByCart',
  ]) {
    const lifecycleManifest = clone(baseLifecycle);
    lifecycleManifest.boundaries[key] = true;
    assert.throws(
      () => validate({ lifecycleManifest }),
      new RegExp(`boundaries\\.${key} must remain false`, 'u'),
    );
  }
});

test('rejects activation without account export and deletion coverage', () => {
  const lifecycleManifest = clone(baseLifecycle);
  lifecycleManifest.persistentData.rentalCart.exportStatus =
    'required-before-activation';
  assert.throws(
    () => validate({ lifecycleManifest }),
    /Persistent rental-cart lifecycle is incomplete/u,
  );
  lifecycleManifest.persistentData.rentalCart.exportStatus =
    'implemented-current-principal-local-and-account-export';
  lifecycleManifest.persistentData.rentalCart.accountDeletionStatus =
    'required-before-activation';
  assert.throws(
    () => validate({ lifecycleManifest }),
    /Persistent rental-cart lifecycle is incomplete/u,
  );
});

test('rejects guest cart purge before the complete server merge', () => {
  const path = 'lib/services/data_service.dart';
  const original = readFileSync(resolve(root, path), 'utf8');
  const changed = original.replace(
    `    await _writeLocalRentalCart(
      guest,
      const RentalCart(
        reservationCreated: false,
        localDeviceOnly: true,
      ),
    );
    return true;`,
    '    return true;',
  );
  assert.throws(
    () => validate({ sourceTexts: { [path]: changed } }),
    /Guest cart must be purged only after all server upserts complete/u,
  );
});

test('rejects a backend workflow that creates a booking', () => {
  const path = 'backend/src/rental_cart_workflow.js';
  const changed = `${readFileSync(resolve(root, path), 'utf8')}\ncreateBooking();\n`;
  assert.throws(
    () => validate({ sourceTexts: { [path]: changed } }),
    /must never create a booking or reservation/u,
  );
});

test('rejects account deletion that leaves local G2 data behind', () => {
  const path = 'lib/screens/legal_privacy_screen.dart';
  const changed = readFileSync(resolve(root, path), 'utf8')
    .replace('Im Mietkorb – noch nicht reserviert', 'Mietkorb');
  assert.throws(
    () => validate({ sourceTexts: { [path]: changed } }),
    /Legal privacy copy is missing/u,
  );
});
