import crypto from 'node:crypto';

import { releaseMetadata } from './release.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;
const OPERATIONAL_ERROR_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;

export function normalizeRequestId(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : crypto.randomUUID();
}

export function safeOperationalErrorCode(error, fallback = 'operation_failed') {
  const candidate = typeof error?.code === 'string' ? error.code.trim() : '';
  if (OPERATIONAL_ERROR_CODE_PATTERN.test(candidate)) return candidate;
  const safeFallback = typeof fallback === 'string' ? fallback.trim() : '';
  return OPERATIONAL_ERROR_CODE_PATTERN.test(safeFallback)
    ? safeFallback
    : 'operation_failed';
}

function routeTemplate(req) {
  const route = typeof req.route?.path === 'string' ? req.route.path : '';
  return route ? `${req.baseUrl ?? ''}${route}` : 'unmatched';
}

export function requestContext({ log = console.info } = {}) {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    req.requestId = normalizeRequestId(req.get('X-Request-ID'));
    res.set('X-Request-ID', req.requestId);

    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      log(JSON.stringify({
        type: 'http_request',
        requestId: req.requestId,
        method: req.method,
        route: routeTemplate(req),
        statusCode: res.statusCode,
        statusClass: `${Math.floor(res.statusCode / 100)}xx`,
        durationMs: Number(durationMs.toFixed(1)),
        releaseId: releaseMetadata.releaseId,
      }));
    });

    next();
  };
}

export function errorPayload(req, error, details = undefined) {
  return {
    error,
    requestId: req.requestId,
    ...(details ? { details } : {}),
  };
}

export function safeErrorLog(req, statusCode, errorCode, error) {
  return JSON.stringify({
    type: 'api_error',
    requestId: req.requestId,
    statusCode,
    error: errorCode,
    errorType: error?.constructor?.name ?? 'Error',
    releaseId: releaseMetadata.releaseId,
  });
}
