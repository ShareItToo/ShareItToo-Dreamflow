import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import sharp from 'sharp';

import {
  assertClosedPilotLegalReadiness,
  closedPilotBookingBody,
  closedPilotListingCategory,
  closedPilotLocation,
  closedPilotOwnerAcceptanceBody,
  closedPilotQuoteBody,
} from './closed_pilot_acceptance.mjs';
import { createEphemeralAcceptancePassword } from './ephemeral_acceptance_password.mjs';

import { pool } from '../src/db.js';
import { hashPassword, signAccessToken } from '../src/security.js';

const baseUrl = (process.env.ACCEPTANCE_BASE_URL || 'http://127.0.0.1:8080/v1')
  .replace(/\/$/u, '');
const serviceUrl = baseUrl.replace(/\/v1$/u, '');
const runId = `b10-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
const password = createEphemeralAcceptancePassword();

function dateOnly(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10);
}

async function api(path, {
  method = 'GET',
  token = null,
  body = undefined,
  headers = {},
  expected = [200],
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...headers,
    },
    body: body === undefined || body instanceof FormData
      ? body
      : JSON.stringify(body),
  });
  const text = await response.text();
  let value = text;
  try {
    value = text ? JSON.parse(text) : null;
  } catch {
    // Binary and HTML responses are asserted through headers and status.
  }
  assert.ok(
    expected.includes(response.status),
    `${method} ${path}: expected ${expected.join('/')} but received ${response.status}: ${text.slice(0, 500)}`,
  );
  assert.match(response.headers.get('x-request-id') ?? '', /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u);
  return { response, value, text };
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)];
}

async function performanceProbe(name, count, thresholdMs, request) {
  const durations = await Promise.all(Array.from({ length: count }, async (_, index) => {
    const startedAt = performance.now();
    const response = await request(index);
    await response.arrayBuffer();
    assert.ok(response.status >= 200 && response.status < 500, `${name} returned ${response.status}`);
    assert.notEqual(response.status, 429, `${name} hit a rate limit`);
    assert.ok(response.headers.get('x-request-id'), `${name} missed X-Request-ID`);
    return performance.now() - startedAt;
  }));
  const p95Ms = percentile(durations, 0.95);
  assert.ok(p95Ms <= thresholdMs, `${name} p95 ${p95Ms.toFixed(1)}ms exceeds ${thresholdMs}ms`);
  return {
    requests: count,
    p50Ms: Number(percentile(durations, 0.5).toFixed(1)),
    p95Ms: Number(p95Ms.toFixed(1)),
    maximumMs: Number(Math.max(...durations).toFixed(1)),
    thresholdMs,
  };
}

async function main() {
  await assertClosedPilotLegalReadiness(pool);
  const users = {
    owner: { id: `${runId}-owner`, email: `${runId}-owner@example.invalid` },
    renter: { id: `${runId}-renter`, email: `${runId}-renter@example.invalid` },
  };
  const passwordHash = await hashPassword(password);
  let bookingId = null;
  let listingId = null;

  try {
    for (const [role, user] of Object.entries(users)) {
      user.sessionId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO users (
           id, email, password_hash, profile, role, account_status,
           email_verified_at, terms_accepted_at, privacy_accepted_at,
           minimum_age_confirmed_at, private_use_confirmed_at
         ) VALUES ($1, $2, $3, $4::jsonb, 'user', 'active', now(), now(), now(), now(), now())`,
        [
          user.id,
          user.email,
          passwordHash,
          JSON.stringify({
            displayName: `B10 Staging ${role}`,
            emailVerified: true,
            isVerified: true,
            isBanned: false,
            role: 'user',
          }),
        ],
      );
      await pool.query(
        `INSERT INTO auth_sessions (id, user_id, device_label)
         VALUES ($1, $2, 'B10 staging acceptance')`,
        [user.sessionId, user.id],
      );
      user.token = signAccessToken(
        { id: user.id, email: user.email },
        { sessionId: user.sessionId },
      );
    }

    const image = await sharp({
      create: {
        width: 960,
        height: 640,
        channels: 3,
        background: { r: 64, g: 96, b: 164 },
      },
    }).jpeg({ quality: 91 }).toBuffer();
    const imageForm = new FormData();
    imageForm.append('purpose', 'listing_image');
    imageForm.append('file', new Blob([image], { type: 'image/jpeg' }), 'b10-load-image.jpg');
    const upload = (await api('/uploads', {
      method: 'POST',
      token: users.owner.token,
      body: imageForm,
      expected: [201],
    })).value;

    listingId = `${runId}-listing`;
    await api('/listings', {
      method: 'POST',
      token: users.owner.token,
      expected: [201],
      body: {
        id: listingId,
        title: `B10 Lasttestkamera ${runId}`,
        description: 'Isoliertes Inserat für Sicherheit, Datenschutz und Lastprüfung.',
        ...closedPilotListingCategory,
        tags: ['b10', 'performance'],
        pricePerDay: 20,
        priceRaw: 20,
        priceUnit: 'day',
        currency: 'EUR',
        deposit: null,
        photos: [upload.url],
        ...closedPilotLocation,
        geohash: 'private',
        condition: 'good',
        minDays: 1,
        maxDays: 14,
        protectionModel: 'none',
        privateStatusConfirmed: true,
        status: 'active',
        isActive: true,
      },
    });
    await api(`/listings/${listingId}/availability`, {
      method: 'PUT',
      token: users.owner.token,
      body: {
        timezone: 'Europe/Berlin',
        minimumDays: 1,
        maximumDays: 14,
        noticeHours: 0,
        acceptanceWindowMinutes: 30,
        rules: Array.from({ length: 7 }, (_, weekday) => ({
          weekday,
          localStart: '00:00',
          localEnd: '23:59',
          isAvailable: true,
        })),
        blocks: [],
      },
    });

    bookingId = `${runId}-booking`;
    const bookingDates = {
      itemId: listingId,
      startDate: dateOnly(60),
      endDate: dateOnly(62),
    };
    const bookingQuote = (await api('/bookings/quote', {
      method: 'POST',
      token: users.renter.token,
      body: closedPilotQuoteBody(bookingDates),
    })).value;
    await api('/bookings', {
      method: 'POST',
      token: users.renter.token,
      headers: { 'Idempotency-Key': `${runId}-booking-create` },
      expected: [201],
      body: closedPilotBookingBody({
        id: bookingId,
        ...bookingDates,
        quote: bookingQuote,
      }),
    });
    await api(`/bookings/${bookingId}/transitions`, {
      method: 'POST',
      token: users.owner.token,
      headers: { 'Idempotency-Key': `${runId}-booking-accept` },
      body: closedPilotOwnerAcceptanceBody(),
    });
    const thread = (await api(`/message-threads/booking/${bookingId}`, {
      method: 'POST',
      token: users.renter.token,
      expected: [200, 201],
    })).value.thread;

    const version = await fetch(`${serviceUrl}/version`, {
      headers: { 'X-Request-ID': `${runId}-version` },
    });
    assert.equal(version.status, 200);
    assert.equal(version.headers.get('x-request-id'), `${runId}-version`);
    for (const header of [
      'content-security-policy',
      'cross-origin-opener-policy',
      'referrer-policy',
      'strict-transport-security',
      'x-content-type-options',
    ]) {
      assert.ok(version.headers.get(header), `missing security header ${header}`);
    }
    const versionData = await version.json();

    const deniedOrigin = await api('/listings', {
      headers: {
        Origin: 'https://untrusted.example.invalid',
        'X-Request-ID': `${runId}-cors-denied`,
      },
      expected: [403],
    });
    assert.equal(deniedOrigin.value.error, 'origin_not_allowed');
    assert.equal(deniedOrigin.value.requestId, `${runId}-cors-denied`);

    const accountExport = await api('/account/export', {
      token: users.owner.token,
      headers: { 'X-Request-ID': `${runId}-export` },
    });
    assert.match(accountExport.response.headers.get('cache-control') ?? '', /no-store/u);
    assert.match(accountExport.response.headers.get('content-disposition') ?? '', /shareittoo-data-export\.json/u);
    assert.equal(accountExport.value.accountId, users.owner.id);
    assert.equal(accountExport.value.data.account.email, users.owner.email);
    const serializedExport = JSON.stringify(accountExport.value);
    for (const forbidden of [
      'password_hash', 'token_hash', 'provider_payment_method_id',
      'provider_customer_id', 'staff_note', 'resolution',
    ]) {
      assert.equal(serializedExport.includes(forbidden), false, forbidden);
    }
    const exportAudit = await pool.query(
      `SELECT count(*)::int AS count FROM audit_log
       WHERE actor_id = $1 AND action = 'account.data_exported' AND request_id = $2`,
      [users.owner.id, `${runId}-export`],
    );
    assert.equal(exportAudit.rows[0].count, 1);

    const imageName = new URL(upload.url).pathname.split('/').at(-1);
    const authorization = { Authorization: `Bearer ${users.renter.token}` };
    const performance = {
      liveness: await performanceProbe('liveness', 25, 500, (index) => fetch(
        `${serviceUrl}/health/live`,
        { headers: { 'X-Request-ID': `${runId}-live-${index}` } },
      )),
      searchFeed: await performanceProbe('search-feed', 25, 750, (index) => fetch(
        `${baseUrl}/listings?q=${encodeURIComponent(runId)}`,
        { headers: { 'X-Request-ID': `${runId}-search-${index}` } },
      )),
      image: await performanceProbe('image', 25, 750, (index) => fetch(
        `${baseUrl}/uploads/${encodeURIComponent(imageName)}`,
        { headers: { 'X-Request-ID': `${runId}-image-${index}` } },
      )),
      chat: await performanceProbe('chat', 25, 750, (index) => fetch(
        `${baseUrl}/message-threads/${encodeURIComponent(thread.id)}/messages`,
        { headers: { ...authorization, 'X-Request-ID': `${runId}-chat-${index}` } },
      )),
      bookings: await performanceProbe('bookings', 25, 750, (index) => fetch(
        `${baseUrl}/rental-requests`,
        { headers: { ...authorization, 'X-Request-ID': `${runId}-booking-${index}` } },
      )),
      webhookRejection: await performanceProbe('webhook-rejection', 25, 1_000, (index) => fetch(
        `${baseUrl}/payments/webhook`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': 't=0,v1=invalid',
            'X-Request-ID': `${runId}-webhook-${index}`,
          },
          body: '{}',
        },
      )),
    };

    await api(`/bookings/${bookingId}/transitions`, {
      method: 'POST',
      token: users.renter.token,
      headers: { 'Idempotency-Key': `${runId}-booking-cancel` },
      body: { status: 'cancelled' },
    });
    await api(`/listings/${listingId}`, {
      method: 'DELETE',
      token: users.owner.token,
      expected: [204],
    });
    for (const [index, user] of Object.values(users).entries()) {
      const preflight = await api('/account/deletion-preflight', { token: user.token });
      assert.equal(preflight.value.canDelete, true);
      await api('/account/deletion', {
        method: 'POST',
        token: user.token,
        headers: { 'X-Forwarded-For': `203.0.113.${100 + index}` },
        body: { currentPassword: password },
      });
    }

    const cleanup = await pool.query(
      `SELECT count(*) FILTER (WHERE account_status = 'active')::int AS active_users
       FROM users WHERE id = ANY($1::text[])`,
      [Object.values(users).map((user) => user.id)],
    );
    assert.equal(cleanup.rows[0].active_users, 0);

    console.log(JSON.stringify({
      status: 'passed',
      block: 'B10',
      runId,
      verifiedAt: new Date().toISOString(),
      releaseCommit: versionData.commit ?? process.env.APP_COMMIT ?? null,
      securityHeaders: 'passed',
      corsBoundary: 'passed',
      requestCorrelation: 'passed',
      privacyExport: 'passed',
      performance,
      cleanup: { activeUsers: 0 },
    }, null, 2));
  } finally {
    if (bookingId) {
      await pool.query(
        `UPDATE bookings SET status = 'cancelled', updated_at = now()
         WHERE id = $1 AND status NOT IN ('cancelled', 'declined', 'completed')`,
        [bookingId],
      ).catch(() => {});
      await pool.query(
        `UPDATE rental_requests SET status = 'cancelled', updated_at = now()
         WHERE id = $1 AND status NOT IN ('cancelled', 'declined', 'completed')`,
        [bookingId],
      ).catch(() => {});
    }
    if (listingId) {
      await pool.query(
        `UPDATE listings SET is_active = false, status = 'ended', updated_at = now()
         WHERE id = $1`,
        [listingId],
      ).catch(() => {});
    }
    await pool.query(
      `UPDATE users
       SET account_status = 'closed', deactivated_at = COALESCE(deactivated_at, now())
       WHERE id = ANY($1::text[]) AND account_status = 'active'`,
      [Object.values(users).map((user) => user.id)],
    ).catch(() => {});
    await pool.end();
  }
}

await main();
