import { readStagingAccessConfiguration } from './staging_access_gate.js';

export const syntheticCatalogClass = 'synthetic_noncontractual_catalog_only';
export const syntheticCatalogNotice = 'Synthetische Katalogfixture – kein reales Angebot, kein Vertrag, keine Zahlung';
export const syntheticCatalogError = 'synthetic_catalog_booking_forbidden';
export class SyntheticCatalogError extends Error {
  constructor() { super(syntheticCatalogError); this.status = 409; this.code = syntheticCatalogError; }
}
export function readSyntheticCatalogConfiguration(environment = process.env, gate) {
  const flag = environment.SIT_STAGING_SYNTHETIC_CATALOG_ENABLED ?? 'false';
  if (!['true', 'false'].includes(flag)) throw Error('synthetic_catalog_flag_invalid');
  if (flag === 'false') return Object.freeze({ enabled: false, listingId: null });
  const access = gate ?? readStagingAccessConfiguration(environment);
  if (!['test', 'staging'].includes(environment.DEPLOYMENT_ENVIRONMENT ?? environment.NODE_ENV)
      || !access.enabled || !access.valid || !access.publicListingConfigurationValid
      || !access.publicUploadConfigurationValid || access.publicListingIds.length !== 1
      || access.publicUploadNames.length !== 1
      || environment.PAYMENT_TRANSPORT !== 'memory'
      || environment.STRIPE_LIVEMODE !== 'false'
      || environment.PRIVATE_PILOT_V4_ENABLED !== 'true'
      || environment.PRIVATE_PILOT_ALLOWED_REGIONS !== 'heilbronn') {
    throw Error('synthetic_catalog_scope_invalid');
  }
  return Object.freeze({ enabled: true, listingId: access.publicListingIds[0],
    uploadName: access.publicUploadNames[0] });
}
export function isSyntheticCatalogListing(id, configuration) {
  return configuration?.enabled === true && typeof id === 'string'
    && id.trim() === configuration.listingId;
}
export function assertNotSyntheticCatalogListing(id, configuration = readSyntheticCatalogConfiguration()) {
  if (isSyntheticCatalogListing(id, configuration)) {
    throw new SyntheticCatalogError();
  }
}
export function syntheticCatalogProjection(payload, configuration, id = payload.id) {
  // Client/persisted fields never grant or remove this server-owned class.
  const { catalogClass, bookingAllowed, paymentAllowed, syntheticNotice, ...ordinary } = payload;
  if (!isSyntheticCatalogListing(id, configuration)) return ordinary;
  return { ...ordinary, catalogClass: syntheticCatalogClass, bookingAllowed: false,
    paymentAllowed: false, syntheticNotice: syntheticCatalogNotice,
    privateStatusConfirmed: false, verificationStatus: 'unverified', timesLent: 0 };
}

export function syntheticCatalogMutationGuard({ configuration }) {
  return async (req, res, next) => {
    if (!configuration.enabled) return next();
    try {
      const check = (id) => assertNotSyntheticCatalogListing(id, configuration);
      const listingPath = /^\/v1\/listings\/([^/]+)(\/status|\/availability|\/availability\/check)?$/u.exec(req.path);
      if (listingPath) {
        const action = `${req.method} ${listingPath[2] ?? ''}`;
        if (['PUT ', 'DELETE ', 'PATCH /status', 'GET /availability', 'PUT /availability',
          'POST /availability/check'].includes(action)) check(decodeURIComponent(listingPath[1]));
      }
      const enrichmentPath = /^\/v1\/listings\/([^/]+)\/supply-enrichment(?:\/[^/]+\/outcome)?$/u.exec(req.path);
      if (req.method === 'POST' && enrichmentPath) check(decodeURIComponent(enrichmentPath[1]));
      // Route-shaped, bounded inspection: never recurse through attacker JSON.
      if ((req.method === 'POST' && ['/v1/bookings/quote', '/v1/bookings'].includes(req.path))
          || (req.method === 'PUT' && /^\/v1\/rental-cart\/items\/[^/]+$/u.test(req.path))) {
        check(req.body?.listingId); check(req.body?.itemId);
      }
      if (req.method === 'POST' && req.path === '/v1/booking-groups' && Array.isArray(req.body?.listingIds)) {
        req.body.listingIds.slice(0, 500).forEach(check);
      }
      if (req.method === 'PUT' && req.path === '/v1/rental-requests/sync' && Array.isArray(req.body?.requests)) {
        req.body.requests.slice(0, 500).forEach((row) => { check(row?.itemId); check(row?.listingId); });
      }
      return next();
    } catch (error) {
      if (error.code === syntheticCatalogError) return res.status(409).json({ error: syntheticCatalogError });
      return next(error);
    }
  };
}
