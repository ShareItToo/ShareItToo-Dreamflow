import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  assertPrivatePilotOwnerAcceptance,
  privatePilotDeclarations,
  privatePilotDocument,
} from '../src/private_pilot_domain.js';

const workflowPath = resolve(import.meta.dirname, '../src/booking_workflow.js');

test('booking creation binds its shared creation instant as timestamptz everywhere', async () => {
  const source = await readFile(workflowPath, 'utf8');
  const insert = source.match(
    /INSERT INTO bookings \([\s\S]*?private_status_confirmed_at[\s\S]*?\n     \)`/u,
  )?.[0] ?? '';

  assert.notEqual(insert, '');
  assert.match(
    insert,
    /\$25::timestamptz, \$25::timestamptz,[\s\S]*THEN \$25::timestamptz ELSE NULL::timestamptz END/u,
  );
  assert.doesNotMatch(insert, /\$24::jsonb, \$25, \$25,/u);
});

test('missing owner pilot acceptance is translated into a client error', async () => {
  const source = await readFile(workflowPath, 'utf8');

  assert.match(
    source,
    /function requiredPrivatePilotOwnerAcceptance[\s\S]*error instanceof PrivatePilotValidationError[\s\S]*new BookingWorkflowError\(400, error\.code\)/u,
  );
  assert.equal(
    source.match(/requiredPrivatePilotOwnerAcceptance\(candidate\)/gu)?.length,
    3,
  );
});

test('owner acceptance requires the exact current one-action declaration', () => {
  const declaration = {
    type: 'owner_booking_acceptance',
    exactWording: privatePilotDeclarations.ownerAcceptance,
    documentName: privatePilotDocument.name,
    documentVersion: privatePilotDocument.version,
    language: privatePilotDocument.language,
    accepted: true,
    acceptedAt: '2026-09-23T10:00:00.000Z',
  };
  assert.equal(
    assertPrivatePilotOwnerAcceptance({ legalDeclarations: [declaration] }),
    declaration,
  );
  for (const changed of [
    { exactWording: 'tampered wording' },
    { documentVersion: 'V5.0-legacy' },
    { accepted: false },
    { acceptedAt: 'not-an-instant' },
  ]) {
    assert.throws(
      () => assertPrivatePilotOwnerAcceptance({
        legalDeclarations: [{ ...declaration, ...changed }],
      }),
      (error) => error.code === 'private_pilot_declaration_missing:owner_booking_acceptance',
    );
  }
});

test('private booking eligibility is rechecked from persisted state at quote, request and acceptance', async () => {
  const source = await readFile(workflowPath, 'utf8');

  for (const marker of [
    'listing.private_pilot_region_code',
    'owner.private_use_confirmed_at AS owner_private_use_confirmed_at',
    'owner.private_marketplace_review_status AS owner_private_marketplace_review_status',
    'SELECT private_use_confirmed_at, private_marketplace_review_status',
    'assertPrivatePilotStoredListing({',
    'assertPrivatePilotAccountState({',
    'allowedRegions: config.privatePilot?.allowedRegions ?? []',
  ]) assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  assert.equal(
    source.match(/await assertPrivatePilotBookingEligibility\(client,/gu)?.length,
    3,
  );
  assert.match(
    source,
    /listingForBooking\(client, row\.listing_id, \{ lock: true \}\)[\s\S]*allowedRegions: config\.privatePilot\?\.allowedRegions/u,
  );
});

test('participant booking history carries a privacy-shaped listing snapshot', async () => {
  const source = await readFile(workflowPath, 'utf8');

  assert.match(source, /listingSnapshot:\s*\{[\s\S]*shapePublicListing\(\{[\s\S]*photos: \[\]/u);
  assert.match(source, /status: row\.listing_status/u);
  assert.match(source, /isActive: row\.listing_is_active === true/u);
  assert.match(source, /catalogRevision: Number\(row\.listing_catalog_revision\)/u);
  assert.match(source, /JOIN listings AS listing ON listing\.id = booking\.listing_id/u);
  assert.match(source, /listing\.payload AS listing_payload/u);
});
