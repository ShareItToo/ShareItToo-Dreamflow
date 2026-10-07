import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import test from 'node:test';

import {
  createSyntheticCloneBookingLane,
  registerSyntheticCloneBookingLaneRoutes,
  SYNTHETIC_CLONE_NON_BINDING_MARKER,
} from '../src/synthetic_clone_booking_lane.js';

const ownerId = '00000000-0000-4000-8000-000000000011';
const renterId = '00000000-0000-4000-8000-000000000012';
const outsiderId = '00000000-0000-4000-8000-000000000013';
const listingId = 'synthetic_clone_listing_wp255';

function createLane() {
  return createSyntheticCloneBookingLane({
    enabled: true,
    deploymentEnvironment: 'test',
    targetKind: 'clone',
    datasetId: 'wp255-green-clone-http',
    runId: 'wp255-20260929091000-a1b2c3d4',
    ownerId,
    renterId,
    secret: 'synthetic-clone-http-test-secret-20260929',
  });
}

async function withServer(callback) {
  const lane = createLane();
  const app = express();
  app.use(express.json());
  const tokenUsers = new Map([
    ['owner-token', ownerId],
    ['renter-token', renterId],
    ['outsider-token', outsiderId],
  ]);
  const requireAuth = (req, res, next) => {
    const token = req.get('Authorization')?.replace(/^Bearer\s+/u, '');
    const userId = tokenUsers.get(token);
    if (!userId) return res.status(401).json({ error: 'authentication_required' });
    req.auth = { userId };
    return next();
  };
  const requireActiveAccount = (_req, _res, next) => next();
  registerSyntheticCloneBookingLaneRoutes(app, { lane, requireAuth, requireActiveAccount });
  // The canonical route stays independently fail-closed while clone routes are enabled.
  app.post('/v1/bookings', requireAuth, (_req, res) => res.status(409).json({ error: 'v52_contract_documents_unavailable' }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    return await callback(`http://127.0.0.1:${address.port}`, lane);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function headers(token) {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
}

test('actual Express clone routes bind exact principals and preserve canonical 409 hold', async () => {
  await withServer(async (baseUrl, lane) => {
    const createdResponse = await fetch(`${baseUrl}/v1/synthetic-clone/bookings`, {
      method: 'POST',
      headers: headers('renter-token'),
      body: JSON.stringify({ listingId }),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.ownerId, ownerId);
    assert.equal(created.renterId, renterId);
    assert.equal(created.marker.persistentNotice, 'Synthetischer Test – keine vertragliche oder finanzielle Wirkung');

    const statusResponse = await fetch(`${baseUrl}/v1/synthetic-clone/status`, { headers: headers('owner-token') });
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.deepEqual(status.marker, SYNTHETIC_CLONE_NON_BINDING_MARKER);
    assert.equal(status.sideEffects.payment, false);
    assert.equal(status.sideEffects.platformContract, false);
    assert.equal(status.sideEffects.review, false);
    assert.equal(status.sideEffects.ranking, false);
    assert.equal(status.sideEffects.notification, false);

    const normal = await fetch(`${baseUrl}/v1/bookings`, {
      method: 'POST',
      headers: headers('renter-token'),
      body: JSON.stringify({ listingId }),
    });
    assert.equal(normal.status, 409);
    assert.equal((await normal.json()).error, 'v52_contract_documents_unavailable');
    assert.equal(lane.status().bookings, 1);
  });
});

test('actual Express clone routes reject missing and non-allowlisted principals', async () => {
  await withServer(async (baseUrl) => {
    const missing = await fetch(`${baseUrl}/v1/synthetic-clone/status`);
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).error, 'authentication_required');
    const outsider = await fetch(`${baseUrl}/v1/synthetic-clone/status`, { headers: headers('outsider-token') });
    assert.equal(outsider.status, 403);
    assert.equal((await outsider.json()).error, 'synthetic_clone_principal_not_allowlisted');
  });
});
