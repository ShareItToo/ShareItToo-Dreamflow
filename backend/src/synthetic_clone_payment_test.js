// No database, provider, credentials, network or normal payment workflow.
// Reuse only the pure amount, event-name and idempotency functions.
import { paymentAmounts, paymentIdempotencyKey, paymentStatusForProvider, requestHash } from './payment_domain.js';
import { platformFeeMinor } from './booking_domain.js';

export const SYNTHETIC_PAYMENT_NOTICE = 'Synthetischer Zahlungstest – kein echtes Geld/kein Vertrag/keine Auszahlung';
export class SyntheticPaymentTestError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new SyntheticPaymentTestError(status, code); };

export function assertSyntheticPaymentTestEnvelope({ requested = '0', cloneEnabled, localQa, deploymentEnvironment, bindHost, transport, livemode } = {}) {
  if (requested === '0' || requested === undefined) return false;
  if (requested !== '1') fail(503, 'synthetic_payment_flag_invalid');
  if (cloneEnabled !== true || localQa !== true || deploymentEnvironment !== 'test'
      || bindHost !== '127.0.0.1' || transport !== 'memory' || livemode !== false) {
    fail(503, 'synthetic_payment_local_qa_envelope_required');
  }
  return true;
}

export function createSyntheticClonePaymentTest({ envelope, runId, getBooking, renterId } = {}) {
  if (!assertSyntheticPaymentTestEnvelope(envelope)) fail(503, 'synthetic_payment_disabled');
  if (!/^wp255-[0-9]{14}-[0-9a-f]{8}$/u.test(runId ?? '') || typeof getBooking !== 'function' || !renterId) {
    fail(503, 'synthetic_payment_run_binding_required');
  }
  const states = new Map();
  const commands = new Map();
  const audit = [];
  let cleaned = false;
  const subtotal = 6000;
  const quote = paymentAmounts({ quoted_total_minor: subtotal + platformFeeMinor(subtotal), owner_payout_minor: subtotal, rental_subtotal_minor: subtotal, currency: 'EUR' });
  const marker = Object.freeze({ syntheticTestOnly: true, monetaryEffectMinor: 0, contractEligible: false, payoutEligible: false, persistentNotice: SYNTHETIC_PAYMENT_NOTICE });
  const clone = (value) => structuredClone(value);
  function binding({ actorId, bookingId, requestedRunId }) {
    if (cleaned) fail(409, 'synthetic_payment_cleaned');
    if (requestedRunId !== runId) fail(409, 'synthetic_payment_run_mismatch');
    getBooking({ actorId, bookingId }); // Existing clone owns exact participants and booking ID.
  }
  function read({ actorId, bookingId, requestedRunId }) {
    binding({ actorId, bookingId, requestedRunId });
    return clone({ runId, bookingId, marker, quote, payment: states.get(bookingId) ?? null,
      payout: null, audit: audit.filter((event) => event.bookingId === bookingId) });
  }
  function execute({ actorId, bookingId, body }) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'synthetic_payment_command_invalid');
    const fields = body.action === 'select' ? ['runId', 'key', 'action', 'method', 'scenario'] : ['runId', 'key', 'action'];
    if (Object.keys(body).length !== fields.length || fields.some((field) => !Object.hasOwn(body, field))) fail(400, 'synthetic_payment_command_invalid');
    binding({ actorId, bookingId, requestedRunId: body.runId });
    if (actorId !== renterId) fail(403, 'synthetic_payment_renter_required');
    let key;
    try { key = paymentIdempotencyKey(body.key, 'synthetic.payment'); }
    catch { fail(400, 'synthetic_payment_key_invalid'); }
    const fingerprint = requestHash({ actorId, bookingId, body });
    const prior = commands.get(key);
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail(409, 'synthetic_payment_idempotency_collision');
      return { ...clone(prior.result), replayed: true };
    }
    if (commands.size >= 200) fail(409, 'synthetic_payment_run_limit');
    const previous = states.get(bookingId);
    let next;
    if (body.action === 'select') {
      if (body.method !== 'synthetic' || !['challenge_then_capture', 'decline'].includes(body.scenario)) fail(400, 'synthetic_payment_selection_invalid');
      if (previous && !['failed', 'refunded'].includes(previous.status)) fail(409, 'synthetic_payment_attempt_active');
      next = { status: 'ready', scenario: body.scenario, method: body.method, capturedMinor: 0, refundedMinor: 0, livemode: false };
    } else if (body.action === 'submit' && previous?.status === 'ready') {
      next = { ...previous, status: paymentStatusForProvider(previous.scenario === 'decline' ? 'payment_intent.payment_failed' : 'payment_intent.requires_action') };
    } else if (body.action === 'confirm' && previous?.status === 'requires_action' && previous.scenario === 'challenge_then_capture') {
      next = { ...previous, status: paymentStatusForProvider('payment_intent.succeeded'), capturedMinor: quote.amountMinor };
    } else if (body.action === 'refund' && previous?.status === 'captured') {
      next = { ...previous, status: 'refunded', refundedMinor: previous.capturedMinor };
    } else {
      fail(409, 'synthetic_payment_transition_invalid');
    }
    states.set(bookingId, next);
    audit.push({ sequence: audit.length + 1, bookingId, action: body.action, status: next.status, monetaryEffectMinor: 0 });
    const result = { ...read({ actorId, bookingId, requestedRunId: runId }), replayed: false };
    commands.set(key, { fingerprint, result: clone(result) });
    return result;
  }
  function capability() {
    return { enabled: !cleaned, runId, marker, methods: ['synthetic'], scenarios: ['challenge_then_capture', 'decline'],
      states: states.size, commands: commands.size, auditEvents: audit.length };
  }
  function cleanup() {
    states.clear(); commands.clear(); audit.length = 0; cleaned = true;
    return capability();
  }
  return Object.freeze({ read, execute, capability, cleanup });
}
