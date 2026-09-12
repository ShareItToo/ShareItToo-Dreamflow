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
  .replace(/\/$/, '');
const runId = `b9-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
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
  const responseText = await response.text();
  let value = responseText;
  try {
    value = responseText ? JSON.parse(responseText) : null;
  } catch {
    // Binary evidence and HTML responses remain text for assertions below.
  }
  assert.ok(
    expected.includes(response.status),
    `${method} ${path}: expected ${expected.join('/')} but received ${response.status}: ${responseText.slice(0, 500)}`,
  );
  return { response, value, text: responseText };
}

async function stepUp(user) {
  const result = await api('/admin/step-up', {
    method: 'POST',
    token: user.token,
    body: { currentPassword: password },
  });
  return { 'X-Admin-Step-Up': result.value.elevation.token };
}

async function main() {
  await assertClosedPilotLegalReadiness(pool);
  const passwordHash = await hashPassword(password);
  const users = {
    owner: { role: 'user', displayName: 'B9 Staging Owner' },
    renter: { role: 'user', displayName: 'B9 Staging Renter' },
    outsider: { role: 'user', displayName: 'B9 Staging Outsider' },
    support: { role: 'support', displayName: 'B9 Staging Support' },
    admin: { role: 'admin', displayName: 'B9 Staging Admin' },
  };

  for (const [key, user] of Object.entries(users)) {
    user.id = `${runId}-${key}`;
    user.email = `${runId}-${key}@example.invalid`;
    user.sessionId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (
         id, email, password_hash, profile, role, account_status,
         email_verified_at, terms_accepted_at, privacy_accepted_at,
         minimum_age_confirmed_at, private_use_confirmed_at
       ) VALUES ($1, $2, $3, $4::jsonb, $5, 'active', now(), now(), now(), now(), now())`,
      [
        user.id,
        user.email,
        passwordHash,
        JSON.stringify({
          displayName: user.displayName,
          emailVerified: true,
          phoneVerified: false,
          isVerified: true,
          isBanned: false,
          role: user.role,
        }),
        user.role,
      ],
    );
    await pool.query(
      `INSERT INTO auth_sessions (id, user_id, device_label)
       VALUES ($1, $2, 'B9 staging acceptance')`,
      [user.sessionId, user.id],
    );
    user.token = signAccessToken(
      { id: user.id, email: user.email },
      { sessionId: user.sessionId },
    );
  }

  const supportStepUp = await stepUp(users.support);
  const adminStepUp = await stepUp(users.admin);
  const supportUsers = await api('/admin/users', {
    token: users.support.token,
    headers: supportStepUp,
  });
  assert.ok(supportUsers.value.users.every((user) => !Object.hasOwn(user, 'email')));
  const adminUsers = await api('/admin/users', {
    token: users.admin.token,
    headers: adminStepUp,
  });
  assert.ok(adminUsers.value.users.some((user) => user.id === users.owner.id && user.email));

  const listingImage = await sharp({
    create: {
      width: 960,
      height: 640,
      channels: 3,
      background: { r: 35, g: 82, b: 150 },
    },
  }).jpeg({ quality: 92 }).toBuffer();
  const listingForm = new FormData();
  listingForm.append('purpose', 'listing_image');
  listingForm.append('file', new Blob([listingImage], { type: 'image/jpeg' }), 'b9-camera.jpg');
  const listingUpload = (await api('/uploads', {
    method: 'POST',
    token: users.owner.token,
    body: listingForm,
    expected: [201],
  })).value;

  const listingId = `${runId}-listing`;
  await api('/listings', {
    method: 'POST',
    token: users.owner.token,
    body: {
      id: listingId,
      title: `B9 Vertrauens-Testkamera ${runId}`,
      description: 'Isoliertes Staging-Inserat für Moderation, Sperren, Rollen und Bewertungen.',
      ...closedPilotListingCategory,
      tags: ['b9', 'moderation'],
      pricePerDay: 20,
      priceRaw: 20,
      priceUnit: 'day',
      currency: 'EUR',
      deposit: null,
      photos: [listingUpload.url],
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
    expected: [201],
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

  const bookingId = `${runId}-booking`;
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
    body: closedPilotBookingBody({
      id: bookingId,
      ...bookingDates,
      quote: bookingQuote,
    }),
    expected: [201],
  });
  await api(`/bookings/${bookingId}/transitions`, {
    method: 'POST',
    token: users.owner.token,
    headers: { 'Idempotency-Key': `${runId}-booking-accept` },
    body: closedPilotOwnerAcceptanceBody(),
  });
  await api(`/bookings/${bookingId}/transitions`, {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': `${runId}-booking-active` },
    body: { status: 'running' },
  });
  const completed = await api(`/bookings/${bookingId}/transitions`, {
    method: 'POST',
    token: users.owner.token,
    headers: { 'Idempotency-Key': `${runId}-booking-complete` },
    body: { status: 'completed' },
  });
  assert.equal(completed.value.booking.workflowStatus, 'completed');

  const evidenceForm = new FormData();
  evidenceForm.append('purpose', 'report_evidence');
  evidenceForm.append('file', new Blob([listingImage], { type: 'image/jpeg' }), 'b9-evidence.jpg');
  const reportEvidence = (await api('/uploads', {
    method: 'POST',
    token: users.renter.token,
    body: evidenceForm,
    expected: [201],
  })).value;
  const createReport = () => api('/reports', {
    method: 'POST',
    token: users.renter.token,
    headers: { 'Idempotency-Key': `${runId}-listing-report` },
    body: {
      targetType: 'listing',
      targetId: listingId,
      reasonCode: 'controlled_misrepresentation_probe',
      priority: 'high',
      details: 'Kontrollierte B9-Staging-Evidenz',
      evidenceUploadIds: [reportEvidence.id],
    },
    expected: [200, 201],
  });
  const createdReport = await createReport();
  assert.equal(createdReport.response.status, 201);
  const reportId = createdReport.value.report.id;
  const replayedReport = await createReport();
  assert.equal(replayedReport.response.status, 200);
  assert.equal(replayedReport.value.replayed, true);

  const supportTriage = await api(`/admin/reports/${reportId}`, {
    method: 'PATCH',
    token: users.support.token,
    headers: { ...supportStepUp, 'Idempotency-Key': `${runId}-support-triage` },
    body: {
      status: 'triaged',
      assignedTo: users.support.id,
      reasonCode: 'controlled_triage',
      note: 'Support prüft nur und verhängt keine Maßnahme.',
    },
  });
  assert.equal(supportTriage.value.report.status, 'triaged');
  const supportCannotAction = await api(`/admin/reports/${reportId}`, {
    method: 'PATCH',
    token: users.support.token,
    headers: { ...supportStepUp, 'Idempotency-Key': `${runId}-support-action-denied` },
    body: {
      status: 'actioned',
      resolution: { outcome: 'not_permitted_for_support' },
    },
    expected: [409],
  });
  assert.equal(supportCannotAction.value.error, 'invalid_report_transition');
  await api(`/admin/reports/${reportId}`, {
    method: 'PATCH',
    token: users.admin.token,
    headers: { ...adminStepUp, 'Idempotency-Key': `${runId}-admin-investigate` },
    body: {
      status: 'investigating',
      assignedTo: users.admin.id,
      reasonCode: 'controlled_investigation',
      note: 'Admin übernimmt den kontrollierten Fall.',
    },
  });
  const actioned = await api(`/admin/reports/${reportId}`, {
    method: 'PATCH',
    token: users.admin.token,
    headers: { ...adminStepUp, 'Idempotency-Key': `${runId}-admin-action` },
    body: {
      status: 'actioned',
      reasonCode: 'documented_policy_violation',
      resolution: { outcome: 'listing_temporarily_hidden' },
    },
  });
  assert.equal(actioned.value.report.status, 'actioned');

  const reportDetails = await api(`/admin/reports/${reportId}`, {
    token: users.admin.token,
    headers: adminStepUp,
  });
  assert.equal(reportDetails.value.report.evidence.length, 1);
  assert.ok(reportDetails.value.report.events.length >= 4);
  const evidenceAccess = await api(`/admin/evidence/${reportEvidence.id}`, {
    token: users.admin.token,
    headers: adminStepUp,
  });
  assert.equal(evidenceAccess.response.headers.get('cache-control'), 'private, no-store');
  assert.ok(Number(evidenceAccess.response.headers.get('content-length')) > 0);

  await api(`/admin/listings/${listingId}/moderation`, {
    method: 'PATCH',
    token: users.admin.token,
    headers: { ...adminStepUp, 'Idempotency-Key': `${runId}-listing-hide` },
    body: {
      status: 'hidden',
      reportId,
      reasonCode: 'documented_policy_violation',
      note: 'Reversible kontrollierte Maßnahme.',
    },
  });
  const hiddenSearch = await api(`/listings?q=${encodeURIComponent(runId)}`);
  assert.deepEqual(hiddenSearch.value.listings, []);
  await api(`/admin/listings/${listingId}/moderation`, {
    method: 'PATCH',
    token: users.admin.token,
    headers: { ...adminStepUp, 'Idempotency-Key': `${runId}-listing-restore` },
    body: {
      status: 'active',
      reportId,
      reasonCode: 'verification_completed',
      note: 'Kontrollierte Maßnahme vollständig zurückgenommen.',
    },
  });
  const restoredSearch = await api(`/listings?q=${encodeURIComponent(runId)}`);
  assert.equal(restoredSearch.value.listings.length, 1);

  const outsiderReport = await api('/reports', {
    method: 'POST',
    token: users.owner.token,
    headers: { 'Idempotency-Key': `${runId}-outsider-report` },
    body: {
      targetType: 'user',
      targetId: users.outsider.id,
      reasonCode: 'controlled_scope_probe',
    },
    expected: [201],
  });
  const outsiderReportId = outsiderReport.value.report.id;
  const suspensionResult = await api(`/admin/users/${users.outsider.id}/suspensions`, {
    method: 'POST',
    token: users.admin.token,
    headers: { ...adminStepUp, 'Idempotency-Key': `${runId}-booking-suspension` },
    body: {
      scope: 'booking',
      reportId: outsiderReportId,
      reasonCode: 'controlled_scope_probe',
      note: 'Reversible B9-Staging-Sperre.',
    },
    expected: [201],
  });
  const suspensionId = suspensionResult.value.suspension.id;
  const quoteBody = closedPilotQuoteBody({
    itemId: listingId,
    startDate: dateOnly(80),
    endDate: dateOnly(82),
  });
  const suspendedQuote = await api('/bookings/quote', {
    method: 'POST',
    token: users.outsider.token,
    body: quoteBody,
    expected: [403],
  });
  assert.equal(suspendedQuote.value.error, 'action_blocked_by_moderation');
  await api(`/admin/suspensions/${suspensionId}/lift`, {
    method: 'POST',
    token: users.admin.token,
    headers: { ...adminStepUp, 'Idempotency-Key': `${runId}-booking-suspension-lift` },
    body: { reasonCode: 'verification_completed', note: 'Sperre zurückgenommen.' },
  });
  await api('/bookings/quote', {
    method: 'POST',
    token: users.outsider.token,
    body: quoteBody,
  });

  await api(`/user-blocks/${users.owner.id}`, {
    method: 'PUT',
    token: users.outsider.token,
    body: { reasonCode: 'controlled_block_probe' },
    expected: [204],
  });
  const blockedQuote = await api('/bookings/quote', {
    method: 'POST',
    token: users.outsider.token,
    body: { ...quoteBody, startDate: dateOnly(90), endDate: dateOnly(92) },
    expected: [409],
  });
  assert.equal(blockedQuote.value.error, 'booking_blocked_by_user_block');
  await api(`/user-blocks/${users.owner.id}`, {
    method: 'DELETE',
    token: users.outsider.token,
    expected: [204],
  });

  const renterReviewRequest = () => api(`/bookings/${bookingId}/reviews`, {
    method: 'POST',
    token: users.renter.token,
    body: {
      direction: 'renter_to_owner',
      criteria: [
        { key: 'communication', stars: 5, note: 'Klar' },
        { key: 'reliability', stars: 4 },
        { key: 'article_as_described', stars: 5 },
        { key: 'handover_return', stars: 4 },
      ],
    },
    expected: [200, 201],
  });
  const renterReview = await renterReviewRequest();
  assert.equal(renterReview.response.status, 201);
  assert.equal(renterReview.value.review.rating, 4.5);
  const renterReviewReplay = await renterReviewRequest();
  assert.equal(renterReviewReplay.response.status, 200);
  assert.equal(renterReviewReplay.value.replayed, true);
  const ownerReview = await api(`/bookings/${bookingId}/reviews`, {
    method: 'POST',
    token: users.owner.token,
    body: {
      direction: 'owner_to_renter',
      criteria: [
        { key: 'communication', stars: 4 },
        { key: 'reliability', stars: 5 },
        { key: 'article_as_described', stars: 4 },
        { key: 'handover_return', stars: 5 },
      ],
    },
    expected: [201],
  });
  assert.equal(ownerReview.value.review.rating, 4.5);
  const publicReviews = await api(`/listings/${listingId}/reviews`);
  assert.equal(publicReviews.value.reviews.length, 2);

  const staffChecks = {};
  for (const resource of ['overview', 'reports', 'users', 'listings', 'bookings', 'payments', 'audit']) {
    const result = await api(`/admin/${resource}`, {
      token: users.admin.token,
      headers: adminStepUp,
    });
    staffChecks[resource] = result.response.status;
  }
  const audit = await api('/admin/audit?limit=200', {
    token: users.admin.token,
    headers: adminStepUp,
  });
  assert.ok(audit.value.audit.some((entry) => entry.action === 'moderation.evidence_viewed'));
  await assert.rejects(
    pool.query(
      `UPDATE moderation_case_events SET note = 'tamper probe' WHERE report_id = $1`,
      [reportId],
    ),
    (error) => error?.code === '55000',
  );
  await assert.rejects(
    pool.query(
      `DELETE FROM moderation_actions WHERE report_id = $1`,
      [reportId],
    ),
    (error) => error?.code === '55000',
  );

  await api(`/admin/reports/${reportId}`, {
    method: 'PATCH',
    token: users.admin.token,
    headers: { ...adminStepUp, 'Idempotency-Key': `${runId}-listing-report-close` },
    body: {
      status: 'closed',
      reasonCode: 'acceptance_completed',
      resolution: { outcome: 'controlled_test_complete' },
      note: 'B9-Staging-Abnahme abgeschlossen.',
    },
  });
  await api(`/admin/reports/${outsiderReportId}`, {
    method: 'PATCH',
    token: users.admin.token,
    headers: { ...adminStepUp, 'Idempotency-Key': `${runId}-outsider-report-close` },
    body: {
      status: 'closed',
      reasonCode: 'acceptance_completed',
      resolution: { outcome: 'controlled_test_complete' },
      note: 'Reversible Sperrprobe abgeschlossen.',
    },
  });

  await api(`/listings/${listingId}`, {
    method: 'DELETE',
    token: users.owner.token,
    expected: [204],
  });
  for (const [index, user] of Object.values(users).entries()) {
    const preflight = await api('/account/deletion-preflight', { token: user.token });
    assert.equal(preflight.value.canDelete, true, `${user.id} must be deletable after B9 cleanup`);
    await api('/account/deletion', {
      method: 'POST',
      token: user.token,
      headers: { 'X-Forwarded-For': `203.0.113.${40 + index}` },
      body: { currentPassword: password },
    });
  }

  const cleanup = await pool.query(
    `SELECT
       count(*) FILTER (WHERE account_status = 'closed')::int AS closed_users,
       count(*) FILTER (WHERE account_status = 'active')::int AS active_users
     FROM users WHERE id = ANY($1::text[])`,
    [Object.values(users).map((user) => user.id)],
  );
  assert.deepEqual(cleanup.rows[0], { closed_users: 5, active_users: 0 });
  const activeSuspensions = await pool.query(
    `SELECT count(*)::int AS count FROM user_suspensions
     WHERE user_id = ANY($1::text[])
       AND lifted_at IS NULL AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`,
    [Object.values(users).map((user) => user.id)],
  );
  assert.equal(activeSuspensions.rows[0].count, 0);
  const activeReports = await pool.query(
    `SELECT count(*)::int AS count FROM reports
     WHERE reporter_id = ANY($1::text[])
       AND status IN ('open', 'triaged', 'investigating', 'actioned')`,
    [Object.values(users).map((user) => user.id)],
  );
  assert.equal(activeReports.rows[0].count, 0);
  assert.deepEqual((await api(`/listings?q=${encodeURIComponent(runId)}`)).value.listings, []);

  const versionResponse = await fetch(`${baseUrl.replace(/\/v1$/, '')}/version`);
  assert.equal(versionResponse.status, 200);
  const version = await versionResponse.json();
  const evidence = {
    status: 'passed',
    block: 'B9',
    runId,
    verifiedAt: new Date().toISOString(),
    releaseCommit: version.commit ?? process.env.APP_COMMIT ?? null,
    reportId,
    reportReplay: replayedReport.value.replayed,
    evidenceAccess: 'audited_private_no_store',
    supportCannotAction: supportCannotAction.value.error,
    listingHideRestore: 'passed',
    suspensionLift: 'passed',
    blockUnblock: 'passed',
    reviews: {
      published: publicReviews.value.reviews.length,
      duplicateSuppressed: renterReviewReplay.value.replayed,
    },
    appendOnly: {
      caseEvents: true,
      moderationActions: true,
    },
    staffViews: staffChecks,
    cleanup: {
      ...cleanup.rows[0],
      activeSuspensions: activeSuspensions.rows[0].count,
      activeReports: activeReports.rows[0].count,
    },
  };
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

try {
  await main();
} finally {
  await pool.end();
}
