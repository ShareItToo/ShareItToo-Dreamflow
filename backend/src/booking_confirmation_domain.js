import crypto from 'node:crypto';

export const bookingConfirmationSegments = Object.freeze(['pickup', 'return']);
export const bookingConfirmationRoles = Object.freeze(['owner', 'renter']);
export const bookingConfirmationChallengeTtlMinutes = 10;

export class BookingConfirmationError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.name = 'BookingConfirmationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function exact(value, allowed, code) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!allowed.includes(candidate)) throw new BookingConfirmationError(400, code);
  return candidate;
}

export function confirmationSegment(value) {
  return exact(value, bookingConfirmationSegments, 'invalid_confirmation_segment');
}

export function confirmationRole(value) {
  return exact(value, bookingConfirmationRoles, 'invalid_confirmation_role');
}

export function confirmationActorRole({ actorId, ownerId, renterId }) {
  if (actorId === ownerId) return 'owner';
  if (actorId === renterId) return 'renter';
  throw new BookingConfirmationError(403, 'booking_confirmation_forbidden');
}

export function counterpartRole(role) {
  return confirmationRole(role) === 'owner' ? 'renter' : 'owner';
}

export function presenterRoleForSegment(segment) {
  return confirmationSegment(segment) === 'pickup' ? 'owner' : 'renter';
}

export function assertConfirmationPresenter({ segment, presenterRole }) {
  const expected = presenterRoleForSegment(segment);
  if (confirmationRole(presenterRole) !== expected) {
    throw new BookingConfirmationError(403, 'confirmation_presenter_role_invalid');
  }
  return expected;
}

export function confirmationCode(randomInt = crypto.randomInt) {
  return String(randomInt(100000, 1000000)).padStart(6, '0');
}

export function confirmationDigest({
  secret,
  challengeId,
  bookingId,
  segment,
  presenterRole,
  code,
}) {
  const key = typeof secret === 'string' ? secret : '';
  if (key.length < 32) throw new BookingConfirmationError(500, 'confirmation_secret_invalid');
  const normalizedCode = typeof code === 'string' ? code.trim() : '';
  if (!/^\d{6}$/.test(normalizedCode)) {
    throw new BookingConfirmationError(400, 'invalid_confirmation_code');
  }
  const material = [
    'shareittoo-confirmation-v3',
    String(challengeId),
    String(bookingId),
    confirmationSegment(segment),
    confirmationRole(presenterRole),
    normalizedCode,
  ].join('|');
  return crypto.createHmac('sha256', key).update(material).digest('hex');
}

export function confirmationDigestMatches(expected, candidate) {
  if (!/^[0-9a-f]{64}$/i.test(expected ?? '') || !/^[0-9a-f]{64}$/i.test(candidate ?? '')) {
    return false;
  }
  const left = Buffer.from(expected, 'hex');
  const right = Buffer.from(candidate, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function confirmationQrPayload({ challengeId, bookingId, segment, presenterRole, code }) {
  const id = String(challengeId).trim();
  const booking = String(bookingId).trim();
  const normalizedCode = String(code).trim();
  if (!/^[0-9a-f-]{36}$/i.test(id) || !booking || booking.includes(':') || !/^\d{6}$/.test(normalizedCode)) {
    throw new BookingConfirmationError(400, 'invalid_confirmation_payload');
  }
  return [
    'shareittoo',
    'v3',
    confirmationSegment(segment),
    confirmationRole(presenterRole),
    id,
    normalizedCode,
    booking,
  ].join(':');
}

export function parseConfirmationQrPayload(value) {
  const parts = typeof value === 'string' ? value.trim().split(':') : [];
  if (parts.length !== 7 || parts[0] !== 'shareittoo' || parts[1] !== 'v3') {
    throw new BookingConfirmationError(400, 'invalid_confirmation_payload');
  }
  const [,, segment, presenterRole, challengeId, code, bookingId] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(challengeId) || !/^\d{6}$/.test(code) || !bookingId) {
    throw new BookingConfirmationError(400, 'invalid_confirmation_payload');
  }
  return Object.freeze({
    segment: confirmationSegment(segment),
    presenterRole: confirmationRole(presenterRole),
    challengeId,
    code,
    bookingId,
  });
}

export function assertConfirmationWorkflowState({ segment, workflowStatus }) {
  const normalizedSegment = confirmationSegment(segment);
  const allowed = normalizedSegment === 'pickup'
    ? ['accepted', 'confirmed']
    : ['active', 'returned'];
  if (!allowed.includes(workflowStatus)) {
    throw new BookingConfirmationError(409, 'confirmation_not_available', {
      segment: normalizedSegment,
      workflowStatus,
    });
  }
  return true;
}
