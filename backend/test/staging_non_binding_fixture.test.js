import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import express from 'express';
import {
  createStageAFixtureLane, readStageAFixtureConfiguration,
  registerStageAFixtureRoutes, stageAFixtureCanonicalGuard, STAGE_A_FIXTURE_MARKER,
} from '../src/staging_non_binding_fixture.js';

const now = new Date('2026-10-31T12:00:00.000Z');
const runId = 'stagea-sim-20261031t120000z-aabbccdd';
const environment = {
  SIT_STAGE_A_FIXTURE_ENABLED: '1', SIT_STAGING_PILOT_ID: 'heilbronn_wave0',
  SIT_STAGE_A_FIXTURE_OWNER_ID: 'synthetic-owner', SIT_STAGE_A_FIXTURE_RENTER_ID: 'synthetic-renter',
  SIT_STAGE_A_FIXTURE_RUN_ID: runId, SIT_STAGE_A_FIXTURE_EXPIRES_AT: '2026-10-31T12:30:00.000Z',
};
const application = {
  deploymentEnvironment: 'test', nonBindingSimulationEnabled: true,
  stagingAccess: { enabled: true, valid: true, allowedUserIds: ['synthetic-owner', 'synthetic-renter'] },
  payments: { transport: 'memory', livemode: false },
  listingAi: { externalProviderExecutionAllowed: false },
};
const lane = (options = {}) => createStageAFixtureLane({ environment, application, clock: () => now, ...options });
const call = (value, method, actor, args = {}) => value.invoke(method, `synthetic-${actor}`, runId, args);

test('new fixture envelope is disabled by default and fails closed outside exact test Stage-A scope', () => {
  assert.equal(createStageAFixtureLane({ environment: {}, application }), null);
  for (const patch of [
    { deploymentEnvironment: 'production' }, { deploymentEnvironment: 'staging' },
    { nonBindingSimulationEnabled: false }, { stagingAccess: { enabled: false } },
    { stagingAccess: { enabled: true, valid: true } },
    { stagingAccess: { enabled: true, valid: true, allowedUserIds: ['synthetic-owner'] } },
    { payments: { transport: 'stripe', livemode: false } },
    { payments: { transport: 'memory', livemode: true } },
    { listingAi: { externalProviderExecutionAllowed: true } },
  ]) assert.throws(() => lane({ application: { ...application, ...patch } }), /scope_invalid/u);
  for (const patch of [
    { SIT_STAGE_A_FIXTURE_ENABLED: 'true' }, { SIT_STAGING_PILOT_ID: 'other' },
    { SIT_STAGE_A_FIXTURE_OWNER_ID: 'synthetic-renter' }, { SIT_STAGE_A_FIXTURE_RUN_ID: 'arbitrary' },
    { SIT_STAGE_A_FIXTURE_EXPIRES_AT: '2026-10-31T12:00:00.000Z' },
    { SIT_STAGE_A_FIXTURE_EXPIRES_AT: '2026-10-31T13:00:00.001Z' },
  ]) assert.throws(() => lane({ environment: { ...environment, ...patch } }), /stage_a_fixture_/u);
  assert.equal(readStageAFixtureConfiguration(environment, application, now).runId, runId);
});

test('fixture reuses isolated lifecycle, keeps synthetic truth, private drafts and exact zero-resource cleanup', () => {
  const value = lane();
  const listing = call(value, 'getListing', 'renter');
  assert.equal(listing.isActive, false);
  assert.equal(listing.bookingAllowed, false);
  assert.equal(listing.catalogVisible, false);
  assert.deepEqual(listing.photos, []);
  assert.deepEqual(listing.photoTruthClassifications, ['synthetic_fixture']);
  assert.deepEqual(listing.marker, STAGE_A_FIXTURE_MARKER);
  assert.throws(() => value.invoke('getListing', 'foreign', runId), /principal_forbidden/u);
  assert.throws(() => value.invoke('getListing', 'synthetic-owner', 'wrong'), /run_mismatch/u);
  const booking = call(value, 'createBooking', 'renter', { listingId: listing.id });
  assert.deepEqual(booking.marker, STAGE_A_FIXTURE_MARKER);
  assert.equal(booking.listing.bookingAllowed, false);
  assert.throws(() => call(value, 'createBooking', 'renter'), /one_booking_per_run/u);
  call(value, 'acceptBooking', 'owner', { bookingId: booking.id });
  for (const segment of ['pickup', 'return']) {
    const presenter = segment === 'pickup' ? 'owner' : 'renter';
    const verifier = segment === 'pickup' ? 'renter' : 'owner';
    for (const slot of ['overview', 'detail', 'accessories', 'critical']) {
      call(value, 'addPhoto', presenter, { bookingId: booking.id, segment, slot, source: 'synthetic_fixture' });
    }
    const challenge = call(value, 'issueChallenge', presenter, { bookingId: booking.id, segment });
    call(value, 'verifyChallenge', verifier, { bookingId: booking.id, raw: { qrPayload: challenge.qrPayload } });
  }
  const completed = call(value, 'getBooking', 'owner', { bookingId: booking.id });
  assert.equal(completed.status, 'returned');
  assert.equal(completed.photos.pickup.length, 4);
  assert.equal(completed.photos.return.length, 4);
  call(value, 'saveReviewDraft', 'renter', { bookingId: booking.id, rating: 5 });
  assert.equal(call(value, 'status', 'owner').sideEffects.review, false);
  const cleanup = call(value, 'cleanup', 'owner');
  assert.equal(cleanup.cleanupVerified, true);
  assert.ok(Object.values(cleanup.remainingResources).every(count => count === 0));
  assert.ok(cleanup.auditRetained && cleanup.auditEventCount > 0);
  assert.ok(cleanup.audit.every(event => event.metadata.runId === runId
    && event.metadata.marker === STAGE_A_FIXTURE_MARKER.mode));
  assert.deepEqual(call(value, 'cleanup', 'renter'), cleanup);
  assert.equal(call(value, 'getAuditLog', 'owner').length, cleanup.auditEventCount);
  assert.ok(value.isSimulationBookingId(booking.id), 'canonical rejection persists after cleanup');
  assert.throws(() => call(value, 'getListing', 'owner'), /cleaned/u);
});

test('expiry and bounded requests cannot prevent cleanup or audit readback', () => {
  let time = now;
  const value = lane({ clock: () => time });
  for (let index = 0; index < 200; index++) call(value, 'getListing', 'owner');
  assert.throws(() => call(value, 'getListing', 'owner'), error => error.status === 429);
  time = new Date(environment.SIT_STAGE_A_FIXTURE_EXPIRES_AT);
  assert.throws(() => call(value, 'getListing', 'renter'), error => error.status === 410);
  assert.equal(call(value, 'cleanup', 'owner').cleanupVerified, true);
  assert.ok(Array.isArray(call(value, 'getAuditLog', 'owner')));
});

test('HTTP fixture is absent from catalog and canonical booking/payment/review/availability routes reject its identities', async t => {
  const value = lane();
  const app = express(); app.use(express.json()); app.use(stageAFixtureCanonicalGuard({ lane: value }));
  const auth = (req, res, next) => {
    if (!req.get('X-Test-Actor')) return res.sendStatus(401);
    req.auth = { userId: req.get('X-Test-Actor') }; next();
  };
  registerStageAFixtureRoutes(app, { lane: value, requireAuth: auth,
    requireActiveAccount: (_req, _res, next) => next(),
    asyncRoute: handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next) });
  let canonicalCalls = 0;
  app.get('/v1/listings', (_req, res) => res.json({ listings: [] }));
  app.use((_req, res) => { canonicalCalls++; res.sendStatus(404); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = 'GET', body, actor = 'synthetic-renter') => fetch(root + path, {
    method, headers: { ...(actor ? { 'X-Test-Actor': actor } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const prefix = `/v1/staging-non-binding/${runId}`;
  assert.equal((await request(prefix + '/fixture', 'GET', undefined, null)).status, 401);
  assert.equal((await request(prefix + '/fixture', 'GET', undefined, 'foreign')).status, 403);
  const fixture = await (await request(prefix + '/fixture')).json();
  const booking = await (await request(prefix + '/bookings', 'POST', { listingId: fixture.id })).json();
  assert.deepEqual(await (await request('/v1/listings')).json(), { listings: [] });
  for (const [path, method, body] of [
    ['/v1/bookings', 'POST', { itemId: fixture.id, simulationOnly: true }],
    ['/v1/listings', 'POST', { id: fixture.id }],
    [`/v1/listings/${fixture.id}/availability`, 'GET'],
    [`/v1/bookings/${booking.id}/payment/checkout`, 'POST', {}],
    [`/v1/bookings/${booking.id}/reviews`, 'POST', {}],
    ['/v1/booking-groups', 'POST', { listingIds: [fixture.id] }],
    ['/v1/blue-ocean/listing-drafts/publish', 'POST', { listing: { id: fixture.id } }],
    ['/v1/listings/sync', 'POST', { listings: [...Array(501).fill({ id: 'ordinary' }), { id: fixture.id }] }],
  ]) assert.equal((await request(path, method, body)).status, 409);
  assert.equal(canonicalCalls, 0);
  assert.equal((await request(prefix + '/bookings', 'POST', { listingId: fixture.id, realOffer: true })).status, 400);
  assert.equal((await request(prefix + '/fixture', 'DELETE', {}, 'synthetic-owner')).status, 200);
  assert.equal((await request(`/v1/bookings/${booking.id}/reviews`, 'POST', {})).status, 409);
});

test('engine has no canonical storage/provider imports and startup gate precedes database initialization', () => {
  const module = fs.readFileSync(new URL('../src/staging_non_binding_fixture.js', import.meta.url), 'utf8');
  assert.doesNotMatch(module, /from ['"].*(?:db|stripe|payment_workflow|booking_workflow|listing_catalog)/u);
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  assert.ok(server.indexOf('createStageAFixtureLane({') < server.indexOf('await initializeDatabase()'));
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.ok(app.indexOf('app.use(stageAFixtureCanonicalGuard') < app.indexOf("app.post('/v1/bookings'"));
});
