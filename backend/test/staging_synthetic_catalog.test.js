import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { readSyntheticCatalogConfiguration, syntheticCatalogProjection,
  syntheticCatalogNotice, syntheticCatalogError, syntheticCatalogMutationGuard } from '../src/staging_synthetic_catalog.js';
import { parseCatalogQuery, storageNameFromListingPhoto } from '../src/listing_catalog.js';

const env = { DEPLOYMENT_ENVIRONMENT: 'test', SIT_STAGING_ACCESS_GATE_ENABLED: 'true',
  SIT_STAGING_ALLOWED_USER_IDS: 'synthetic-owner,synthetic-renter',
  SIT_STAGING_PUBLIC_LISTING_IDS: 'synthetic-fixture', SIT_STAGING_PUBLIC_UPLOAD_NAMES: 'synthetic.jpg',
  PUBLIC_BASE_URL: 'https://shareittoo.com/api/v1',
  PRIVATE_PILOT_V4_ENABLED: 'true', PRIVATE_PILOT_ALLOWED_REGIONS: 'heilbronn',
  PAYMENT_TRANSPORT: 'memory', STRIPE_LIVEMODE: 'false',
  SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: 'true' };
Object.assign(process.env, env);
// This Node test file runs in its own process; configure before runtime imports.
const { pool } = await import('../src/db.js');
const { createApp, buildCatalogSearch } = await import('../src/app.js');
const { signAccessToken } = await import('../src/security.js');
const { quoteBooking, createBooking } = await import('../src/booking_workflow.js');
const { requestBookingGroup } = await import('../src/booking_group_workflow.js');
const { putRentalCartItem, recheckRentalCart } = await import('../src/rental_cart_workflow.js');
const lane = readSyntheticCatalogConfiguration(env);
test('default off and explicit false preserve ordinary projection; forged payload cannot opt in', () => {
  assert.equal(readSyntheticCatalogConfiguration({}).enabled, false);
  assert.equal(readSyntheticCatalogConfiguration({ DEPLOYMENT_ENVIRONMENT: 'production' }).enabled, false);
  assert.deepEqual(syntheticCatalogProjection({ id: 'normal', title: 'Normal' }, lane), { id: 'normal', title: 'Normal' });
  assert.deepEqual(syntheticCatalogProjection({ id: 'normal', bookingAllowed: false,
    paymentAllowed: false, realOffer: false, ownerDeclaration: false,
    catalogClass: 'synthetic_noncontractual_catalog_only', syntheticNotice: 'forged' }, lane), { id: 'normal' });
});
for (const [key, value] of Object.entries({ DEPLOYMENT_ENVIRONMENT: 'production',
  SIT_STAGING_ACCESS_GATE_ENABLED: 'false', SIT_STAGING_ALLOWED_USER_IDS: '',
  SIT_STAGING_PUBLIC_LISTING_IDS: 'one,two', SIT_STAGING_PUBLIC_UPLOAD_NAMES: '',
  PRIVATE_PILOT_V4_ENABLED: 'false', PRIVATE_PILOT_ALLOWED_REGIONS: 'berlin',
  SIT_STAGING_SYNTHETIC_CATALOG_ENABLED: 'yes' })) test(`rejects unsafe activation ${key}`, () => {
  assert.throws(() => readSyntheticCatalogConfiguration({ ...env, [key]: value }));
});
for (const [key, values] of Object.entries({ PAYMENT_TRANSPORT: [undefined, '', 'stripe', 'MEMORY'],
  STRIPE_LIVEMODE: [undefined, '', 'true', 'False'] })) {
  for (const value of values) test(`rejects payment activation ${key}=${String(value)}`, () => {
    const candidate = { ...env, [key]: value };
    if (value === undefined) delete candidate[key];
    assert.throws(() => readSyntheticCatalogConfiguration(candidate),
      { message: 'synthetic_catalog_scope_invalid' });
  });
}
test('test and staging bind the sole existing guest ID; response cannot claim owner confirmation', () => {
  assert.equal(readSyntheticCatalogConfiguration({ ...env, DEPLOYMENT_ENVIRONMENT: 'staging' }).listingId, lane.listingId);
  const view = syntheticCatalogProjection({ id: lane.listingId, privateStatusConfirmed: true,
    realOffer: true, ownerDeclaration: true, bookingAllowed: true, paymentAllowed: true }, lane);
  assert.equal(view.realOffer, false); assert.equal(view.ownerDeclaration, false);
  assert.equal(view.bookingAllowed, false); assert.equal(view.paymentAllowed, false);
  assert.equal(view.privateStatusConfirmed, false); assert.equal(view.syntheticNotice, syntheticCatalogNotice);
});

test('workflow quote/create/group/cart block before the first query', async () => {
  const before = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  let calls = 0; const client = { query: async () => { calls += 1; throw Error('unexpected_query'); } };
  try {
    const raw = { listingId: lane.listingId, listingIds: ['normal', lane.listingId] };
    for (const operation of [
      () => quoteBooking(client, { raw }),
      () => createBooking(client, { raw }),
      () => requestBookingGroup(client, { raw, idempotencyKey: 'synthetic-command-key', actor: { id: 'synthetic-renter' } }),
      () => putRentalCartItem(client, { raw, clientItemId: 'cart-item' }),
    ]) await assert.rejects(operation(), (error) => error.code === syntheticCatalogError);
    assert.equal(calls, 0);
    const reads = [];
    client.query = async (sql) => { reads.push(sql); return { rows: sql.includes('FROM rental_carts')
      ? [{ id: 'cart' }] : [{ listing_id: lane.listingId }] }; };
    await assert.rejects(recheckRentalCart(client, { actorId: 'synthetic-renter' }),
      (error) => error.code === syntheticCatalogError);
    assert.ok(reads.every((sql) => sql.trim().startsWith('SELECT')));
  } finally { for (const [key, value] of Object.entries(before)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  } }
});

test('global middleware has no DB/auth, bounded inspection and unknown-route parity', async () => {
  let queries = 0;
  const guard = syntheticCatalogMutationGuard({ configuration: lane,
    query: async () => { queries += 1; assert.fail('global DB read'); } });
  let body = {}; for (let i = 0; i < 10000; i += 1) body = { nested: body };
  let next = false;
  await guard({ method: 'POST', path: '/v1/bookings/private-booking/payment/checkout', body }, {},
    () => { next = true; });
  assert.equal(next, true);
  assert.equal(queries, 0);
  next = false;
  await guard({ method: 'POST', path: '/v1/does-not-exist', body: { listingId: lane.listingId } }, {},
    () => { next = true; });
  assert.equal(next, true);
});

test('actual API direct endpoints and guest/authenticated projection enforce exact class', async () => {
  const savedQuery = pool.query;
  const ordinaryPhoto = 'https://shareittoo.com/api/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp';
  const syntheticPhoto = `https://shareittoo.com/api/v1/uploads/${lane.uploadName}`;
  assert.equal(storageNameFromListingPhoto(syntheticPhoto, env.PUBLIC_BASE_URL), null);
  assert.equal(storageNameFromListingPhoto(ordinaryPhoto, env.PUBLIC_BASE_URL),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp');
  let catalogRows = [{ catalog_listing_id: lane.listingId,
    payload: { photos: ['https://attacker.invalid/forged.webp'],
      city: 'Heilbronn', country: 'Deutschland', catalogClass: 'ordinary',
      realOffer: true, ownerDeclaration: true, bookingAllowed: true, paymentAllowed: true,
      syntheticNotice: 'forged' }, storage_names: [lane.uploadName] }];
  let queries = [];
  pool.query = async (sql, values) => {
    queries.push({ sql, values });
    if (sql.includes('FROM listings AS listing')) return { rows: catalogRows };
    throw Error('unexpected_query');
  };
  const server = http.createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const token = signAccessToken({ id: 'synthetic-renter', email: 'synthetic@example.invalid' },
    { sessionId: '11111111-1111-4111-8111-111111111111' });
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  try {
    for (const auth of [{}, headers]) {
      const r = await fetch(`${base}/v1/listings`, { headers: auth });
      assert.equal(r.status, 200); const body = await r.json();
      assert.equal(body.listings.length, 1);
      assert.equal(body.listings[0].id, lane.listingId);
      assert.equal(body.listings[0].catalogClass, 'synthetic_noncontractual_catalog_only');
      assert.equal(body.listings[0].realOffer, false);
      assert.equal(body.listings[0].ownerDeclaration, false);
      assert.equal(body.listings[0].bookingAllowed, false);
      assert.equal(body.listings[0].paymentAllowed, false);
      assert.equal(body.listings[0].syntheticNotice, syntheticCatalogNotice);
      assert.deepEqual(body.listings[0].photos, [syntheticPhoto]);
    }
    for (const payloadId of [undefined, 'forged-payload-id']) {
      catalogRows = [{ catalog_listing_id: 'ordinary', payload: {
        ...(payloadId === undefined ? {} : { id: payloadId }), title: 'Ordinary',
        photos: [ordinaryPhoto, 'https://attacker.invalid/forged.webp'], city: 'Berlin', country: 'Deutschland',
        realOffer: false, ownerDeclaration: false, bookingAllowed: false, paymentAllowed: false,
        catalogClass: 'synthetic_noncontractual_catalog_only', syntheticNotice: 'forged' },
      storage_names: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa-full.webp', lane.uploadName] }];
      const ordinaryResponse = await fetch(`${base}/v1/listings`);
      assert.equal(ordinaryResponse.status, 200); const ordinary = (await ordinaryResponse.json()).listings[0];
      assert.equal(ordinary.id, 'ordinary'); assert.equal(ordinary.title, 'Ordinary');
      assert.deepEqual(ordinary.photos, [ordinaryPhoto]);
      for (const key of ['catalogClass', 'realOffer', 'ownerDeclaration', 'bookingAllowed',
        'paymentAllowed', 'syntheticNotice']) assert.equal(Object.hasOwn(ordinary, key), false, key);
    }
    catalogRows = [{ catalog_listing_id: lane.listingId,
      payload: { id: 'forged-payload-id', photos: [syntheticPhoto],
        city: 'Heilbronn', country: 'Deutschland' }, storage_names: [lane.uploadName] }];
    const forgedSyntheticResponse = await fetch(`${base}/v1/listings`);
    assert.equal(forgedSyntheticResponse.status, 200);
    const forgedSynthetic = (await forgedSyntheticResponse.json()).listings[0];
    assert.equal(forgedSynthetic.id, lane.listingId);
    assert.equal(forgedSynthetic.catalogClass, 'synthetic_noncontractual_catalog_only');
    assert.equal(forgedSynthetic.realOffer, false);
    assert.equal(forgedSynthetic.ownerDeclaration, false);
    assert.equal(forgedSynthetic.bookingAllowed, false);
    assert.equal(forgedSynthetic.paymentAllowed, false);
    assert.equal(forgedSynthetic.syntheticNotice, syntheticCatalogNotice);
    assert.deepEqual(forgedSynthetic.photos, [syntheticPhoto]);
    catalogRows = [{ catalog_listing_id: lane.listingId,
      payload: { id: lane.listingId, photos: [syntheticPhoto], city: 'Heilbronn', country: 'Deutschland' },
      storage_names: ['not-the-configured-synthetic-upload.webp'] }];
    const unbound = await fetch(`${base}/v1/listings`);
    assert.equal(unbound.status, 200);
    assert.deepEqual((await unbound.json()).listings[0].photos, []);
    catalogRows = [];
    queries = [];
    for (const [method, path, body] of [
      ['POST', '/bookings/quote', { listingId: lane.listingId }],
      ['POST', '/bookings', { itemId: lane.listingId }],
      ['POST', '/booking-groups', { listingIds: ['normal', lane.listingId] }],
      ['PUT', '/rental-cart/items/item', { listingId: lane.listingId }],
      ['PUT', '/rental-requests/sync', { requests: [{ itemId: lane.listingId }] }],
      ['POST', `/listings/${lane.listingId}/availability/check`, {}],
      ['PUT', `/listings/${lane.listingId}`, {}],
    ]) {
      const r = await fetch(`${base}/v1${path}`, { method, headers, body: JSON.stringify(body) });
      assert.equal(r.status, 409, path); assert.equal((await r.json()).error, syntheticCatalogError);
    }
    assert.deepEqual(queries, []);
    for (const suffix of ['supply-enrichment', 'supply-enrichment/suggestion/outcome']) {
      const response = await fetch(`${base}/v1/listings/${lane.listingId}/${suffix}`,
        { method: 'POST', headers, body: '{}' });
      assert.equal(response.status, 409, suffix);
      assert.equal((await response.json()).error, syntheticCatalogError);
      assert.deepEqual(queries, []);
      for (const id of [lane.listingId, 'ordinary']) {
        const anonymous = await fetch(`${base}/v1/listings/${id}/${suffix}`, { method: 'POST' });
        assert.equal(anonymous.status, 401);
        assert.deepEqual(queries, []);
      }
    }
    const unauthenticated = await fetch(`${base}/v1/bookings/foreign/payment/checkout`, { method: 'POST' });
    assert.equal(unauthenticated.status, 401); assert.deepEqual(queries, []);
    const query = buildCatalogSearch(parseCatalogQuery({}));
    assert.match(query.text, /upload.owner_id = listing.owner_id/u);
    assert.match(query.text, /upload\.storage_name = \$\d+/u);
    assert.ok(query.values.includes(lane.uploadName));
    assert.match(query.text, /fixture_owner.profile->>'syntheticOnly' = 'true'/u);
    assert.match(query.text, /listing.moderation_status = 'active'/u);
    assert.match(query.text, /lower\(btrim\(listing.city\)\) = 'heilbronn'/u);
    assert.match(query.text, /listing.id <> \$\d+ OR \(\s*lower\(btrim\(listing.city\)\) = 'heilbronn'/u);
    const normal = buildCatalogSearch(parseCatalogQuery({}), { syntheticCatalog: { enabled: false, listingId: null } });
    assert.ok(!normal.text.includes('fixture_owner'));
    assert.match(normal.text, /listing.private_status_confirmed_at IS NOT NULL/u);
    assert.ok(!normal.values.includes(lane.listingId));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    pool.query = savedQuery;
  }
});
test('every direct-path HTTP proof names a real registered app route', () => {
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  for (const [method, path] of [['post', '/v1/bookings/quote'], ['post', '/v1/bookings'],
    ['post', '/v1/booking-groups'], ['put', '/v1/rental-cart/items/:id'],
    ['put', '/v1/rental-requests/sync'], ['post', '/v1/listings/:id/availability/check'],
    ['put', '/v1/listings/:id'], ['post', '/v1/listings/:id/supply-enrichment'],
    ['post', '/v1/listings/:id/supply-enrichment/:suggestionId/outcome']]) {
    assert.ok(source.includes(`app.${method}('${path}'`));
  }
});
test('notice is shared with the ops preflight and Flutter model', () => {
  for (const file of ['../ops/staging_web_fixture_preflight.mjs', '../../lib/models/item.dart']) {
    assert.ok(readFileSync(new URL(file, import.meta.url), 'utf8').includes(syntheticCatalogNotice));
  }
});
