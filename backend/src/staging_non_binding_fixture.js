import crypto from 'node:crypto';
import { createInMemoryNonBindingLane } from './synthetic_clone_booking_lane.js';

export const STAGE_A_FIXTURE_PREFIX = '/v1/staging-non-binding';
export const STAGE_A_FIXTURE_ID_PREFIX = 'stage_a_sim_fixture_';
export const STAGE_A_FIXTURE_MARKER = Object.freeze({
  mode: 'staging_simulation_fixture_only', binding: 'non-binding',
  uiLabel: 'STAGE-A SIMULATION — KEIN ECHTES ANGEBOT',
  persistentNotice: 'Synthetische Testfixture – kein Angebot, Vertrag, Geld oder öffentliche Bewertung',
  syntheticTestOnly: true, photoTruth: 'synthetic_fixture', realOffer: false,
  bookingAllowed: false, publicationAllowed: false, catalogVisible: false,
  releaseEligible: false, contractEligible: false, monetaryEffectMinor: 0,
  externalSideEffects: false, availabilityEffect: false, canonicalStorage: false,
});

export class StageAFixtureError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const deny = (code = 'stage_a_fixture_scope_invalid', status = 503) => {
  throw new StageAFixtureError(status, code);
};
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u.test(value);

export function readStageAFixtureConfiguration(environment, application, now = new Date()) {
  const flag = environment.SIT_STAGE_A_FIXTURE_ENABLED ?? '0';
  if (flag === '0') return Object.freeze({ enabled: false });
  if (flag !== '1') deny('stage_a_fixture_flag_invalid');
  const ownerId = environment.SIT_STAGE_A_FIXTURE_OWNER_ID;
  const renterId = environment.SIT_STAGE_A_FIXTURE_RENTER_ID;
  const runId = environment.SIT_STAGE_A_FIXTURE_RUN_ID;
  const expiresAtUtc = environment.SIT_STAGE_A_FIXTURE_EXPIRES_AT;
  const expiry = Date.parse(expiresAtUtc);
  if (application.deploymentEnvironment !== 'test'
      || application.nonBindingSimulationEnabled !== true
      || application.stagingAccess?.enabled !== true || application.stagingAccess.valid !== true
      || application.payments?.transport !== 'memory' || application.payments.livemode !== false
      || application.listingAi?.externalProviderExecutionAllowed !== false
      || environment.SIT_STAGING_PILOT_ID !== 'heilbronn_wave0'
      || !id(ownerId) || !id(renterId) || ownerId === renterId
      || !Array.isArray(application.stagingAccess.allowedUserIds)
      || ![ownerId, renterId].every(value => application.stagingAccess.allowedUserIds.includes(value))
      || !/^stagea-sim-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$/u.test(runId ?? '')
      || !Number.isFinite(expiry) || new Date(expiry).toISOString() !== expiresAtUtc
      || !(now instanceof Date) || !Number.isFinite(now.getTime())
      || expiry <= now.getTime() || expiry - now.getTime() > 60 * 60 * 1000) deny();
  return Object.freeze({ enabled: true, ownerId, renterId, runId, expiresAtUtc,
    listingId: `${STAGE_A_FIXTURE_ID_PREFIX}${runId}` });
}

export function createStageAFixtureLane({ environment, application, clock = () => new Date() }) {
  const configuration = readStageAFixtureConfiguration(environment, application, clock());
  if (!configuration.enabled) return null;
  const engine = createInMemoryNonBindingLane({
    deploymentEnvironment: 'test', datasetId: configuration.runId,
    ...configuration, secret: crypto.randomBytes(32).toString('hex'), clock,
    marker: STAGE_A_FIXTURE_MARKER,
    listingProjection: { status: 'simulation_fixture', isActive: false, photos: [],
      photoTruthClassifications: ['synthetic_fixture'], bookingAllowed: false,
      publicationAllowed: false, catalogVisible: false },
  });
  let created = false;
  let cleanupResult = null;
  const bookingIds = new Set();
  const requests = new Map();
  function authorize(actorId, runId, { terminalRead = false } = {}) {
    if (![configuration.ownerId, configuration.renterId].includes(actorId)) {
      deny('stage_a_fixture_principal_forbidden', 403);
    }
    if (runId !== configuration.runId) deny('stage_a_fixture_run_mismatch', 404);
    if (!terminalRead && clock().getTime() >= Date.parse(configuration.expiresAtUtc)) {
      deny('stage_a_fixture_expired', 410);
    }
    if (!terminalRead && engine.status().cleaned) deny('stage_a_fixture_cleaned', 410);
    const count = requests.get(actorId) ?? 0;
    if (!terminalRead && count >= 200) deny('stage_a_fixture_rate_limit', 429);
    if (!terminalRead) requests.set(actorId, count + 1);
  }
  const invoke = (method, actorId, runId, args = {}) => {
    authorize(actorId, runId, { terminalRead: ['cleanup', 'getAuditLog', 'status'].includes(method) });
    if (method === 'createBooking') {
      if (created) deny('stage_a_fixture_one_booking_per_run', 409);
      const booking = engine.createBooking({ ...args, actorId });
      created = true;
      bookingIds.add(booking.id);
      return booking;
    }
    if (method === 'status') return { ...engine.status(), canonicalStorage: false,
      sideEffects: { ...engine.status().sideEffects, availability: false } };
    if (method === 'cleanup') {
      cleanupResult ??= engine.cleanup({ actorId });
      return structuredClone(cleanupResult);
    }
    if (!Object.hasOwn(engine, method) || typeof engine[method] !== 'function') deny();
    return engine[method]({ ...args, actorId });
  };
  return Object.freeze({ configuration, invoke,
    isSimulationBookingId: value => bookingIds.has(value) });
}

// Reserve these identities even when the optional lane is disabled. Caller
// JSON cannot turn the in-memory fixture into a canonical persisted listing.
export function stageAFixtureCanonicalGuard({ lane = null } = {}) {
  return (req, res, next) => {
  if (req.path.startsWith(`${STAGE_A_FIXTURE_PREFIX}/`)) return next();
  const reserved = value => typeof value === 'string'
    && (value.startsWith(STAGE_A_FIXTURE_ID_PREFIX) || lane?.isSimulationBookingId(value) === true);
  let segments;
  try { segments = req.path.split('/').map(decodeURIComponent); }
  catch { return res.status(400).json({ error: 'stage_a_fixture_path_invalid' }); }
  const body = req.body;
  const rows = [body, body?.listing,
    ...(Array.isArray(body?.listings) ? body.listings : []),
    ...(Array.isArray(body?.requests) ? body.requests : []),
    ...(Array.isArray(body?.items) ? body.items : [])];
  const ids = rows.flatMap(row => [row?.id, row?.listingId, row?.itemId, row?.bookingId,
    ...(Array.isArray(row?.listingIds) ? row.listingIds : [])]);
  if (segments.some(reserved) || ids.some(reserved)) {
    return res.status(409).json({ error: 'stage_a_fixture_canonical_forbidden' });
  }
  return next();
  };
}

export function registerStageAFixtureRoutes(app, { lane, requireAuth, requireActiveAccount, asyncRoute }) {
  if (!lane || ![requireAuth, requireActiveAccount, asyncRoute].every(x => typeof x === 'function')) {
    throw new TypeError('stage_a_fixture_route_dependencies_invalid');
  }
  const prefix = `${STAGE_A_FIXTURE_PREFIX}/:runId`;
  const route = (method, argument, { keys = [] } = {}) => asyncRoute(async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-SIT-Non-Binding', STAGE_A_FIXTURE_MARKER.mode);
    try {
      const body = req.body ?? {};
      if (req.method !== 'GET' && (Object.getPrototypeOf(body) !== Object.prototype
          || Object.keys(body).sort().join('|') !== [...keys].sort().join('|'))) {
        deny('stage_a_fixture_payload_invalid', 400);
      }
      const value = lane.invoke(method, req.auth?.userId, req.params.runId,
        argument ? argument(req) : {});
      res.json(value);
    } catch (error) {
      if (typeof error.code === 'string' && Number.isInteger(error.status)) {
        return res.status(error.status).json({ error: error.code });
      }
      throw error;
    }
  });
  const bind = (verb, suffix, method, argument, options) => app[verb](prefix + suffix,
    requireAuth, requireActiveAccount, route(method, argument, options));
  bind('get', '/fixture', 'getListing');
  bind('get', '/status', 'status');
  bind('get', '/audit', 'getAuditLog');
  bind('post', '/bookings', 'createBooking', req => ({ listingId: req.body.listingId }), { keys: ['listingId'] });
  bind('get', '/bookings/:id', 'getBooking', req => ({ bookingId: req.params.id }));
  bind('post', '/bookings/:id/accept', 'acceptBooking', req => ({ bookingId: req.params.id }));
  bind('post', '/bookings/:id/photos', 'addPhoto', req => ({ bookingId: req.params.id,
    segment: req.body.segment, slot: req.body.slot, source: 'synthetic_fixture' }), { keys: ['segment', 'slot'] });
  bind('post', '/bookings/:id/challenges', 'issueChallenge', req => ({ bookingId: req.params.id,
    segment: req.body.segment }), { keys: ['segment'] });
  bind('post', '/bookings/:id/verify', 'verifyChallenge', req => ({ bookingId: req.params.id,
    raw: { qrPayload: req.body.qrPayload } }), { keys: ['qrPayload'] });
  bind('post', '/bookings/:id/review-drafts', 'saveReviewDraft', req => ({ bookingId: req.params.id,
    rating: req.body.rating }), { keys: ['rating'] });
  bind('delete', '/fixture', 'cleanup');
}
