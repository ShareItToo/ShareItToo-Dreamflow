import crypto from 'node:crypto';

import {
  confirmationDigest,
  confirmationQrPayload,
  parseConfirmationQrPayload,
} from './booking_confirmation_domain.js';

export const SYNTHETIC_CLONE_ROUTE_PREFIX = '/v1/synthetic-clone';
export const SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX = `${SYNTHETIC_CLONE_ROUTE_PREFIX}/bookings`;

export const SYNTHETIC_CLONE_PRINCIPALS = Object.freeze({
  listingId: 'synthetic_clone_listing_wp255',
});

export const SYNTHETIC_CLONE_NON_BINDING_MARKER = Object.freeze({
  mode: 'synthetic_clone_only',
  binding: 'non-binding',
  uiLabel: 'SYNTHETIC CLONE — NON-BINDING',
  persistentNotice: 'Synthetischer Test – keine vertragliche oder finanzielle Wirkung',
  syntheticTestOnly: true,
  releaseEligible: false,
  contractEligible: false,
  monetaryEffectMinor: 0,
  externalSideEffects: false,
});

const PHOTO_SLOTS = Object.freeze(['overview', 'detail', 'accessories', 'critical']);
const PHOTO_SEGMENTS = Object.freeze(['pickup', 'return']);
const STATUSES = Object.freeze(['requested', 'accepted', 'active', 'returned']);
const DEFAULT_FALLBACK_CODE = '246810';

export class SyntheticCloneBookingLaneError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.name = 'SyntheticCloneBookingLaneError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function assertSyntheticCloneLoopbackBinding({ enabled, bindHost } = {}) {
  if (enabled !== true) return false;
  if (bindHost !== '127.0.0.1') fail(503, 'synthetic_clone_loopback_required');
  return true;
}

function fail(status, code, details) {
  throw new SyntheticCloneBookingLaneError(status, code, details);
}

function text(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function assertObject(value, code = 'invalid_synthetic_clone_payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, code);
  return value;
}

function assertUuid(value, code = 'synthetic_clone_booking_invalid') {
  if (!/^[0-9a-f-]{36}$/iu.test(value ?? '')) fail(400, code);
  return value;
}

function clone(value) {
  return structuredClone(value);
}

function nowIso(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) fail(500, 'synthetic_clone_clock_invalid');
  return date.toISOString();
}

function routeActor(req) {
  const actorId = text(req.auth?.userId ?? req.actor?.id, 160);
  if (!actorId) fail(401, 'synthetic_clone_auth_required');
  return actorId;
}

function participantRoleForRoute(lane, actorId) {
  if (!lane?.principals || ![lane.principals.ownerId, lane.principals.renterId].includes(actorId)) {
    fail(403, 'synthetic_clone_principal_not_allowlisted');
  }
  return true;
}

function errorJson(res, error) {
  return res.status(error.status ?? 500).json({ error: error.code ?? 'internal_error' });
}

function participantRole(actorId, principals) {
  if (actorId === principals.ownerId) return 'owner';
  if (actorId === principals.renterId) return 'renter';
  fail(403, 'synthetic_clone_principal_not_allowlisted');
}

function presenterRole(segment) {
  return segment === 'pickup' ? 'owner' : 'renter';
}

function verifierRole(segment) {
  return segment === 'pickup' ? 'renter' : 'owner';
}

function requiredStatusForPhotos(segment) {
  return segment === 'pickup' ? 'accepted' : 'active';
}

function requiredStatusForChallenge(segment) {
  return segment === 'pickup' ? 'accepted' : 'active';
}

function publicPhoto(photo) {
  return {
    id: photo.id,
    segment: photo.segment,
    slot: photo.slot,
    source: photo.source,
    syntheticTestOnly: true,
    nonAuthentic: true,
    purpose: photo.segment === 'pickup' ? 'handover_evidence' : 'return_evidence',
    observedAt: photo.observedAt,
  };
}

function publicChallenge(challenge, { includeCode = false } = {}) {
  return {
    id: challenge.id,
    bookingId: challenge.bookingId,
    segment: challenge.segment,
    presenterRole: challenge.presenterRole,
    version: 3,
    issuedAt: challenge.issuedAt,
    expiresAt: challenge.expiresAt,
    consumedAt: challenge.consumedAt,
    ...(includeCode ? { fallbackCode: challenge.code, qrPayload: challenge.qrPayload } : {}),
  };
}

function publicBooking(booking, { includeAudit = false } = {}) {
  return {
    id: booking.id,
    listingId: booking.listingId,
    ownerId: booking.ownerId,
    renterId: booking.renterId,
    status: booking.status,
    workflowStatus: booking.status,
    marker: SYNTHETIC_CLONE_NON_BINDING_MARKER,
    listing: clone(booking.listing),
    photos: {
      pickup: booking.photos.pickup.map(publicPhoto),
      return: booking.photos.return.map(publicPhoto),
    },
    confirmations: clone(booking.confirmations),
    returnCompletedAt: booking.returnCompletedAt,
    ...(includeAudit ? { audit: clone(booking.audit) } : {}),
  };
}

function validateCloneIdentity({
  enabled,
  deploymentEnvironment,
  targetKind,
  datasetId,
  runId,
  ownerId,
  renterId,
  listingId,
} = {}) {
  if (enabled !== true) fail(503, 'synthetic_clone_lane_disabled');
  if (!['test', 'clone'].includes(String(deploymentEnvironment ?? '').toLowerCase())) {
    fail(503, 'synthetic_clone_test_environment_required');
  }
  if (targetKind !== 'clone') fail(503, 'synthetic_clone_target_required');
  if (!/^wp255-green-clone-[a-z0-9-]+$/u.test(datasetId ?? '')) {
    fail(503, 'synthetic_clone_dataset_invalid');
  }
  if (!/^wp255-[0-9]{14}-[0-9a-f]{8}$/u.test(runId ?? '')) {
    fail(503, 'synthetic_clone_run_id_invalid');
  }
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  if (!uuid.test(ownerId ?? '') || !uuid.test(renterId ?? '')
      || listingId !== SYNTHETIC_CLONE_PRINCIPALS.listingId
      || ownerId === renterId) {
    fail(503, 'synthetic_clone_principals_invalid');
  }
}

function validateSegment(value) {
  const segment = text(value, 16).toLowerCase();
  if (!PHOTO_SEGMENTS.includes(segment)) fail(400, 'synthetic_clone_segment_invalid');
  return segment;
}

function validateSlot(value) {
  const slot = text(value, 32).toLowerCase();
  if (!PHOTO_SLOTS.includes(slot)) fail(400, 'synthetic_clone_photo_slot_invalid');
  return slot;
}

function verifyInput(raw, bookingId) {
  const payload = assertObject(raw, 'synthetic_clone_confirmation_payload_invalid');
  if (typeof payload.qrPayload === 'string' && payload.qrPayload.trim()) {
    let parsed;
    try {
      parsed = parseConfirmationQrPayload(payload.qrPayload);
    } catch {
      fail(400, 'synthetic_clone_confirmation_payload_invalid');
    }
    if (parsed.bookingId !== bookingId) fail(400, 'synthetic_clone_confirmation_booking_mismatch');
    return parsed;
  }
  const challengeId = text(payload.challengeId, 80);
  const code = text(payload.code, 16);
  if (!/^[0-9a-f-]{36}$/iu.test(challengeId) || !/^\d{6}$/u.test(code)) {
    fail(400, 'synthetic_clone_confirmation_payload_invalid');
  }
  return {
    challengeId,
    bookingId,
    segment: validateSegment(payload.segment),
    presenterRole: text(payload.presenterRole, 16),
    code,
  };
}

export function createSyntheticCloneBookingLane({
  enabled = false,
  deploymentEnvironment = 'test',
  targetKind = 'clone',
  datasetId,
  runId,
  ownerId,
  renterId,
  listingId = SYNTHETIC_CLONE_PRINCIPALS.listingId,
  secret,
  clock = () => new Date(),
  fallbackCode = DEFAULT_FALLBACK_CODE,
} = {}) {
  validateCloneIdentity({
    enabled,
    deploymentEnvironment,
    targetKind,
    datasetId,
    runId,
    ownerId,
    renterId,
    listingId,
  });
  if (typeof secret !== 'string' || secret.length < 32) fail(503, 'synthetic_clone_secret_invalid');
  if (!/^\d{6}$/u.test(fallbackCode)) fail(503, 'synthetic_clone_fallback_code_invalid');

  const principals = Object.freeze({ ownerId, renterId, listingId });
  const bookings = new Map();
  const audit = [];
  let cleaned = false;

  function timestamp() {
    return nowIso(clock());
  }

  function record(action, { actorId = null, bookingId = null, metadata = {} } = {}) {
    audit.push(Object.freeze({
      id: crypto.randomUUID(),
      action,
      actorId,
      bookingId,
      metadata: Object.freeze({ ...metadata, marker: SYNTHETIC_CLONE_NON_BINDING_MARKER.mode }),
      at: timestamp(),
    }));
  }

  function bookingFor(actorId, bookingId) {
    participantRole(actorId, principals);
    assertUuid(bookingId);
    const booking = bookings.get(bookingId);
    if (!booking) fail(404, 'synthetic_clone_booking_not_found');
    if (![booking.ownerId, booking.renterId].includes(actorId)) fail(403, 'synthetic_clone_booking_forbidden');
    return booking;
  }

  function createBooking({ actorId, listingId: requestedListingId = principals.listingId } = {}) {
    if (cleaned) fail(409, 'synthetic_clone_lane_cleaned');
    if (actorId !== principals.renterId) {
      participantRole(actorId, principals);
      fail(403, 'synthetic_clone_renter_required');
    }
    if (requestedListingId !== principals.listingId) fail(404, 'synthetic_clone_listing_not_found');
    const id = crypto.randomUUID();
    const createdAt = timestamp();
    const booking = {
      id,
      listingId: principals.listingId,
      ownerId: principals.ownerId,
      renterId: principals.renterId,
      status: 'requested',
      listing: {
        id: principals.listingId,
        ownerId: principals.ownerId,
        title: 'SYNTHETIC TEST LISTING — NOT FOR RENTAL',
        status: 'active',
        isActive: true,
        marker: SYNTHETIC_CLONE_NON_BINDING_MARKER,
      },
      photos: { pickup: [], return: [] },
      challenges: new Map(),
      confirmations: { pickup: null, return: null },
      returnCompletedAt: null,
      audit: [],
      createdAt,
    };
    bookings.set(id, booking);
    record('synthetic_clone.booking_created', {
      actorId,
      bookingId: id,
      metadata: { listingId: principals.listingId, ownerId: principals.ownerId, renterId: principals.renterId },
    });
    booking.audit.push(audit[audit.length - 1]);
    return publicBooking(booking);
  }

  function acceptBooking({ actorId, bookingId } = {}) {
    const booking = bookingFor(actorId, bookingId);
    if (actorId !== principals.ownerId) fail(403, 'synthetic_clone_owner_required');
    if (booking.status !== 'requested') fail(409, 'synthetic_clone_booking_not_requested');
    booking.status = 'accepted';
    record('synthetic_clone.booking_accepted', { actorId, bookingId });
    booking.audit.push(audit[audit.length - 1]);
    return publicBooking(booking);
  }

  function addPhoto({ actorId, bookingId, segment: rawSegment, slot: rawSlot, source = 'synthetic_fixture' } = {}) {
    const booking = bookingFor(actorId, bookingId);
    const segment = validateSegment(rawSegment);
    const slot = validateSlot(rawSlot);
    const expectedPresenter = presenterRole(segment);
    if (participantRole(actorId, principals) !== expectedPresenter) fail(403, 'synthetic_clone_presenter_required');
    if (booking.status !== requiredStatusForPhotos(segment)) fail(409, 'synthetic_clone_photo_wrong_booking_state');
    if (typeof source !== 'string' || !['synthetic_fixture', 'camera', 'gallery'].includes(source)) {
      fail(400, 'synthetic_clone_photo_source_invalid');
    }
    if (booking.photos[segment].some((photo) => photo.slot === slot)) {
      fail(409, 'synthetic_clone_photo_slot_duplicate');
    }
    const photo = {
      id: crypto.randomUUID(),
      segment,
      slot,
      source,
      observedAt: timestamp(),
      syntheticTestOnly: true,
      nonAuthentic: true,
    };
    booking.photos[segment].push(photo);
    record('synthetic_clone.condition_photo_added', {
      actorId,
      bookingId,
      metadata: { segment, slot, source, count: booking.photos[segment].length },
    });
    booking.audit.push(audit[audit.length - 1]);
    return publicBooking(booking);
  }

  function issueChallenge({ actorId, bookingId, segment: rawSegment } = {}) {
    const booking = bookingFor(actorId, bookingId);
    const segment = validateSegment(rawSegment);
    if (participantRole(actorId, principals) !== presenterRole(segment)) fail(403, 'synthetic_clone_presenter_required');
    if (booking.status !== requiredStatusForChallenge(segment)) fail(409, 'synthetic_clone_challenge_wrong_booking_state');
    if (booking.photos[segment].length !== PHOTO_SLOTS.length) fail(409, 'synthetic_clone_photo_set_incomplete');
    const challengeId = crypto.randomUUID();
    const issuedAt = timestamp();
    const expiresAt = new Date(new Date(issuedAt).getTime() + 10 * 60_000).toISOString();
    const code = fallbackCode;
    const presenter = presenterRole(segment);
    const challenge = {
      id: challengeId,
      bookingId,
      segment,
      presenterRole: presenter,
      code,
      issuedAt,
      expiresAt,
      consumedAt: null,
      qrPayload: confirmationQrPayload({
        challengeId,
        bookingId,
        segment,
        presenterRole: presenter,
        code,
      }),
      digest: confirmationDigest({
        secret,
        challengeId,
        bookingId,
        segment,
        presenterRole: presenter,
        code,
      }),
    };
    booking.challenges.set(challengeId, challenge);
    record('synthetic_clone.confirmation_challenge_issued', {
      actorId,
      bookingId,
      metadata: { segment, version: 3, fallbackCodeConfigured: true },
    });
    booking.audit.push(audit[audit.length - 1]);
    return publicChallenge(challenge, { includeCode: true });
  }

  function verifyChallenge({ actorId, bookingId, raw } = {}) {
    const booking = bookingFor(actorId, bookingId);
    const input = verifyInput(raw, booking.id);
    const challenge = booking.challenges.get(input.challengeId);
    if (!challenge || challenge.segment !== input.segment || challenge.presenterRole !== input.presenterRole
        || challenge.consumedAt || new Date(challenge.expiresAt) <= new Date(timestamp())) {
      fail(400, 'synthetic_clone_confirmation_invalid');
    }
    if (participantRole(actorId, principals) !== verifierRole(input.segment)) {
      fail(403, 'synthetic_clone_verifier_required');
    }
    if (input.presenterRole !== presenterRole(input.segment)) fail(400, 'synthetic_clone_presenter_role_invalid');
    if (booking.photos[input.segment].length !== PHOTO_SLOTS.length) fail(409, 'synthetic_clone_photo_set_incomplete');
    const digest = confirmationDigest({
      secret,
      challengeId: challenge.id,
      bookingId: booking.id,
      segment: challenge.segment,
      presenterRole: challenge.presenterRole,
      code: input.code,
    });
    if (digest !== challenge.digest) fail(400, 'synthetic_clone_confirmation_invalid');
    challenge.consumedAt = timestamp();
    booking.confirmations[input.segment] = {
      segment: input.segment,
      version: 3,
      method: typeof raw?.qrPayload === 'string' && raw.qrPayload.trim() ? 'qr-v3' : 'six_digit_fallback',
      challengeId: challenge.id,
      presenterRole: challenge.presenterRole,
      verifierRole: verifierRole(input.segment),
      confirmedAt: challenge.consumedAt,
      nonBinding: true,
      marker: SYNTHETIC_CLONE_NON_BINDING_MARKER,
    };
    if (input.segment === 'pickup') booking.status = 'active';
    if (input.segment === 'return') {
      booking.status = 'returned';
      booking.returnCompletedAt = challenge.consumedAt;
    }
    record(`synthetic_clone.${input.segment}_confirmation_verified`, {
      actorId,
      bookingId,
      metadata: { method: booking.confirmations[input.segment].method, version: 3 },
    });
    booking.audit.push(audit[audit.length - 1]);
    return {
      booking: publicBooking(booking),
      challenge: publicChallenge(challenge),
      confirmation: clone(booking.confirmations[input.segment]),
    };
  }

  function getBooking({ actorId, bookingId, includeAudit = false } = {}) {
    return publicBooking(bookingFor(actorId, bookingId), { includeAudit });
  }

  function getListing({ actorId, requestedListingId = principals.listingId } = {}) {
    participantRole(actorId, principals);
    if (requestedListingId !== principals.listingId) fail(404, 'synthetic_clone_listing_not_found');
    return {
      ...clone({
        id: principals.listingId,
        ownerId: principals.ownerId,
        title: 'SYNTHETIC TEST LISTING — NOT FOR RENTAL',
        status: 'active',
        isActive: true,
      }),
      marker: SYNTHETIC_CLONE_NON_BINDING_MARKER,
    };
  }

  function getAudit({ actorId, bookingId } = {}) {
    const booking = bookingFor(actorId, bookingId);
    return clone(booking.audit);
  }

  function cleanup({ actorId } = {}) {
    participantRole(actorId, principals);
    const before = { bookings: bookings.size, auditEvents: audit.length };
    for (const booking of bookings.values()) {
      record('synthetic_clone.booking_cleaned', {
        actorId,
        bookingId: booking.id,
        metadata: { status: booking.status },
      });
      booking.audit.push(audit[audit.length - 1]);
    }
    bookings.clear();
    cleaned = true;
    const after = { bookings: bookings.size, listings: 0, photos: 0, challenges: 0 };
    record('synthetic_clone.cleanup_verified', { actorId, metadata: { before, after } });
    return {
      marker: SYNTHETIC_CLONE_NON_BINDING_MARKER,
      cleanupVerified: true,
      remainingResources: after,
      auditRetained: true,
      auditEventCount: audit.length,
      audit: clone(audit),
    };
  }

  function getAuditLog({ actorId } = {}) {
    participantRole(actorId, principals);
    return clone(audit);
  }

  function status() {
    return {
      marker: SYNTHETIC_CLONE_NON_BINDING_MARKER,
      datasetId,
      runId,
      principals: clone(principals),
      bookings: bookings.size,
      auditEventCount: audit.length,
      cleaned,
      sideEffects: {
        platformContract: false,
        c2cContract: false,
        payment: false,
        payout: false,
        stripe: false,
        review: false,
        ranking: false,
        notification: false,
      },
    };
  }

  return Object.freeze({
    principals,
    createBooking,
    acceptBooking,
    addPhoto,
    issueChallenge,
    verifyChallenge,
    getBooking,
    getListing,
    getAudit,
    getAuditLog,
    cleanup,
    status,
  });
}

export function registerSyntheticCloneBookingLaneRoutes(app, {
  lane,
  requireAuth,
  requireActiveAccount,
  asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next),
} = {}) {
  if (!app || !lane || typeof lane.createBooking !== 'function') {
    throw new TypeError('synthetic_clone_route_dependencies_invalid');
  }
  const auth = [requireAuth, requireActiveAccount].filter(Boolean);
  const route = (handler) => asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-SIT-Non-Binding', 'synthetic-clone-only');
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof SyntheticCloneBookingLaneError) return errorJson(res, error);
      throw error;
    }
  });
  const actor = routeActor;
  app.post(`${SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX}`, ...auth, route(async (req, res) => {
    res.status(201).json(lane.createBooking({ actorId: actor(req), listingId: req.body?.listingId }));
  }));
  app.get(`${SYNTHETIC_CLONE_ROUTE_PREFIX}/listings/:id`, ...auth, route(async (req, res) => {
    res.json(lane.getListing({ actorId: actor(req), requestedListingId: req.params.id }));
  }));
  app.get(`${SYNTHETIC_CLONE_ROUTE_PREFIX}/status`, ...auth, route(async (req, res) => {
    participantRoleForRoute(lane, actor(req));
    res.json(lane.status());
  }));
  app.post(`${SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX}/:id/accept`, ...auth, route(async (req, res) => {
    res.json(lane.acceptBooking({ actorId: actor(req), bookingId: req.params.id }));
  }));
  app.get(`${SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX}/audit`, ...auth, route(async (req, res) => {
    res.json({ marker: SYNTHETIC_CLONE_NON_BINDING_MARKER, audit: lane.getAuditLog({ actorId: actor(req) }) });
  }));
  app.get(`${SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX}/:id`, ...auth, route(async (req, res) => {
    res.json(lane.getBooking({ actorId: actor(req), bookingId: req.params.id }));
  }));
  app.get(`${SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX}/:id/audit`, ...auth, route(async (req, res) => {
    res.json({ marker: SYNTHETIC_CLONE_NON_BINDING_MARKER, audit: lane.getAudit({ actorId: actor(req), bookingId: req.params.id }) });
  }));
  app.post(`${SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX}/:id/photos`, ...auth, route(async (req, res) => {
    res.status(201).json(lane.addPhoto({
      actorId: actor(req),
      bookingId: req.params.id,
      segment: req.body?.segment,
      slot: req.body?.slot,
      source: req.body?.source,
    }));
  }));
  app.post(`${SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX}/:id/challenges`, ...auth, route(async (req, res) => {
    res.status(201).json(lane.issueChallenge({ actorId: actor(req), bookingId: req.params.id, segment: req.body?.segment }));
  }));
  app.post(`${SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX}/:id/challenges/verify`, ...auth, route(async (req, res) => {
    res.json(lane.verifyChallenge({ actorId: actor(req), bookingId: req.params.id, raw: req.body }));
  }));
  app.delete(`${SYNTHETIC_CLONE_BOOKING_ROUTE_PREFIX}`, ...auth, route(async (req, res) => {
    res.json(lane.cleanup({ actorId: actor(req) }));
  }));
  return app;
}

export const syntheticClonePhotoSlots = PHOTO_SLOTS;
export const syntheticCloneBookingStatuses = STATUSES;
