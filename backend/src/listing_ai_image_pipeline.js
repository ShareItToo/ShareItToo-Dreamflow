import crypto from 'node:crypto';

import sharp from 'sharp';

import { transitionListingAiDerivative } from './listing_ai_draft_domain.js';

export const listingAiImagePipelineVersion = 'N4-2026-08-23.1';
export const listingAiImageDisclosureVersion = 'listing-ai-image-disclosure-v1';
export const listingAiImageDisclosureText = 'SIT analysiert deine ausgewählten Bilder mit einem externen KI-Dienst, um einen bearbeitbaren Anzeigenentwurf zu erstellen. Es wird nichts automatisch veröffentlicht.';
export const listingAiOnDeviceDisclosureVersion = 'listing-ai-on-device-disclosure-v1';
export const listingAiOnDeviceDisclosureText = 'SIT wertet deine ausgewählten Bilder direkt auf diesem Android-Gerät aus. Erkannte Objektbegriffe und Texte sowie die ausgewählten Anzeigenfotos werden an SIT übertragen, um einen bearbeitbaren Entwurf zu erstellen. ML Kit sendet Bildinhalte und Erkennungsergebnisse nicht an Google; technische ML-Kit-Nutzungs- und Diagnosedaten können an Google übertragen werden. Es wird nichts automatisch veröffentlicht.';

const maximumImageCount = 4;
const maximumInputBytes = 8 * 1024 * 1024;
const maximumInputPixels = 40_000_000;
const maximumDimension = 12_000;
const analysisMaximumDimension = 1280;
const analysisWebpQuality = 80;
const defaultCleanupTimeoutMs = 10_000;
const sensitiveSignalTypes = new Set([
  'face',
  'document',
  'address',
  'financial_data',
  'credentials',
  'unrelated_sensitive_material',
]);
const confidenceValues = new Set(['HIGH', 'MEDIUM', 'LOW']);

const sensitiveTextPatterns = Object.freeze([
  Object.freeze({
    code: 'address_text_detected',
    pattern: /\b[\p{L}][\p{L} .'-]{1,60}(?:straße|strasse|str\.|weg|allee|platz|gasse)\s+\d{1,4}[a-z]?\b/iu,
  }),
  Object.freeze({
    code: 'iban_detected',
    pattern: /\bDE\d{2}(?:\s?\d){18}\b/iu,
  }),
  Object.freeze({
    code: 'payment_card_number_detected',
    pattern: /\b(?:\d[ -]?){13,19}\b/u,
  }),
  Object.freeze({
    code: 'credential_text_detected',
    pattern: /\b(?:passwort|password|pin|otp|tan|recovery\s*code|wiederherstellungscode)\b\s*[:=-]?\s*[A-Za-z0-9._-]{3,}/iu,
  }),
  Object.freeze({
    code: 'identity_or_health_document_text_detected',
    pattern: /\b(?:personalausweis|reisepass|führerschein|geburtsurkunde|krankenakte|arztbrief|befund)\b/iu,
  }),
]);

export class ListingAiImagePipelineError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function fail(status, code) {
  throw new ListingAiImagePipelineError(status, code);
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length
      || actual.some((key, index) => key !== wanted[index])) {
    fail(400, code);
  }
}

function identifier(value, code) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (!/^[A-Za-z0-9_.:-]{8,160}$/u.test(candidate)
      || /[/\\]|https?:|file:|@/iu.test(candidate)) {
    fail(400, code);
  }
  return candidate;
}

function instant(value, code) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) fail(500, code);
  return parsed;
}

function safeRandomId(randomId) {
  const value = randomId();
  if (typeof value !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    fail(500, 'listing_ai_image_safe_name_generation_failed');
  }
  return value.toLowerCase();
}

function normalizeConsent(raw, {
  disclosureVersion = listingAiImageDisclosureVersion,
  disclosureText = listingAiImageDisclosureText,
} = {}) {
  exactKeys(raw, [
    'explicitlyInitiated',
    'accepted',
    'disclosureVersion',
    'disclosureText',
  ], 'listing_ai_image_consent_invalid');
  if (raw.explicitlyInitiated !== true) fail(409, 'listing_ai_image_action_not_explicit');
  if (raw.accepted !== true
      || raw.disclosureVersion !== disclosureVersion
      || raw.disclosureText !== disclosureText) {
    fail(409, 'listing_ai_image_consent_required');
  }
  return Object.freeze({
    disclosureVersion,
    accepted: true,
    explicitlyInitiated: true,
  });
}

function normalizeVisualSignals(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 12) {
    fail(400, 'listing_ai_image_visual_signals_invalid');
  }
  return raw.map((entry) => {
    exactKeys(entry, ['type', 'confidence'], 'listing_ai_image_visual_signal_invalid');
    if (!sensitiveSignalTypes.has(entry.type) || !confidenceValues.has(entry.confidence)) {
      fail(400, 'listing_ai_image_visual_signal_invalid');
    }
    return Object.freeze({ type: entry.type, confidence: entry.confidence });
  });
}

function normalizeScreeningUsage(raw) {
  exactKeys(
    raw,
    ['inputUnits', 'outputUnits', 'estimatedCostCents', 'billedCostCents'],
    'listing_ai_image_visual_screen_usage_invalid',
  );
  for (const key of ['inputUnits', 'outputUnits', 'estimatedCostCents']) {
    if (!Number.isSafeInteger(raw[key]) || raw[key] < 0) {
      fail(400, 'listing_ai_image_visual_screen_usage_invalid');
    }
  }
  if (raw.billedCostCents !== null
      && (!Number.isSafeInteger(raw.billedCostCents) || raw.billedCostCents < 0)) {
    fail(400, 'listing_ai_image_visual_screen_usage_invalid');
  }
  return Object.freeze({
    inputUnits: raw.inputUnits,
    outputUnits: raw.outputUnits,
    estimatedCostCents: raw.estimatedCostCents,
    billedCostCents: raw.billedCostCents,
  });
}

export function evaluateListingAiSensitiveContent(raw = {}) {
  exactKeys(raw, [
    'localOcrText',
    'visualScanCompleted',
    'visualSignals',
  ], 'listing_ai_image_screening_invalid');
  const localOcrText = typeof raw.localOcrText === 'string' ? raw.localOcrText.trim() : '';
  if (localOcrText.length > 2_000) fail(400, 'listing_ai_image_ocr_too_long');
  const visualSignals = normalizeVisualSignals(raw.visualSignals);
  const blockedReasonCodes = [];
  const reviewReasonCodes = [];

  for (const { code, pattern } of sensitiveTextPatterns) {
    if (pattern.test(localOcrText)) blockedReasonCodes.push(code);
  }
  for (const signal of visualSignals) {
    const code = `${signal.type}_${signal.confidence.toLowerCase()}`;
    if (signal.confidence === 'HIGH') blockedReasonCodes.push(code);
    else reviewReasonCodes.push(code);
  }
  if (raw.visualScanCompleted !== true) {
    reviewReasonCodes.push('local_visual_screen_incomplete');
  }

  const blocked = blockedReasonCodes.length > 0;
  const reviewRequired = !blocked && reviewReasonCodes.length > 0;
  return Object.freeze({
    status: blocked ? 'blocked' : (reviewRequired ? 'review_required' : 'passed'),
    providerEligible: !blocked && !reviewRequired,
    reasonCodes: Object.freeze([
      ...new Set(blocked ? blockedReasonCodes : reviewReasonCodes),
    ].sort()),
    userAction: blocked
      ? 'replace_image'
      : (reviewRequired ? 'crop_or_replace_image' : 'none'),
    originalTextRetained: false,
  });
}

async function createAnalysisDerivative(image, { now, randomId }) {
  exactKeys(image, [
    'imageReference',
    'originalFilename',
    'bytes',
    'localScreening',
  ], 'listing_ai_image_input_invalid');
  const imageReference = identifier(
    image.imageReference,
    'listing_ai_image_reference_invalid',
  );
  if (!Buffer.isBuffer(image.bytes)
      || image.bytes.length < 1
      || image.bytes.length > maximumInputBytes) {
    fail(400, 'listing_ai_image_bytes_invalid');
  }
  if (image.originalFilename != null
      && (typeof image.originalFilename !== 'string' || image.originalFilename.length > 255)) {
    fail(400, 'listing_ai_image_original_filename_invalid');
  }
  const screening = evaluateListingAiSensitiveContent(image.localScreening);
  let derivativeBytes = null;

  try {
    const source = sharp(image.bytes, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: maximumInputPixels,
    });
    const metadata = await source.metadata();
    if (!metadata.width || !metadata.height) fail(400, 'listing_ai_image_dimensions_invalid');
    if (metadata.width > maximumDimension
        || metadata.height > maximumDimension
        || (metadata.pages ?? 1) > 1) {
      fail(400, 'listing_ai_image_dimensions_unsupported');
    }

    const encoded = await sharp(image.bytes, {
      animated: false,
      failOn: 'warning',
      limitInputPixels: maximumInputPixels,
    })
      .rotate()
      .resize({
        width: analysisMaximumDimension,
        height: analysisMaximumDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: analysisWebpQuality, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    derivativeBytes = encoded.data;
    const outputMetadata = await sharp(encoded.data).metadata();
    if (outputMetadata.exif || outputMetadata.gps || outputMetadata.icc
        || outputMetadata.iptc || outputMetadata.xmp) {
      encoded.data.fill(0);
      fail(500, 'listing_ai_image_metadata_strip_failed');
    }

    const opaqueId = safeRandomId(randomId);
    const storageReference = `analysis-${opaqueId}.webp`;
    const createdAt = instant(now(), 'listing_ai_image_clock_invalid');
    const expiresAt = new Date(createdAt.getTime() + defaultCleanupTimeoutMs);
    const record = Object.freeze({
      id: `derivative_${opaqueId}`,
      draftId: null,
      state: 'prepared',
      imageReference,
      derivativeKind: 'resized_analysis_copy',
      storageReference,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      purgedAt: null,
    });
    return {
      imageReference,
      storageReference,
      bytes: encoded.data,
      mimeType: 'image/webp',
      width: encoded.info.width,
      height: encoded.info.height,
      byteSize: encoded.data.length,
      sha256: crypto.createHash('sha256').update(encoded.data).digest('hex'),
      screening,
      localScreening: image.localScreening,
      screeningUsage: null,
      record,
      originalFilenameRetained: false,
      originalMetadataRetained: false,
    };
  } catch (error) {
    derivativeBytes?.fill(0);
    if (error instanceof ListingAiImagePipelineError) throw error;
    fail(400, 'listing_ai_image_processing_failed');
  }
}

async function completeDerivativeScreening(screenDerivative, derivative, timeoutMs) {
  if (typeof screenDerivative !== 'function'
      || derivative.screening.status === 'blocked') {
    return;
  }
  const controller = new AbortController();
  let timer = null;
  let result;
  try {
    result = await Promise.race([
      screenDerivative(Object.freeze({
        imageReference: derivative.imageReference,
        storageReference: derivative.storageReference,
        mimeType: derivative.mimeType,
        width: derivative.width,
        height: derivative.height,
        byteSize: derivative.byteSize,
        sha256: derivative.sha256,
        bytes: derivative.bytes,
      }), { signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ListingAiImagePipelineError(
            504,
            'listing_ai_image_visual_screen_timeout',
            { providerCallCount: 1 },
          ));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof ListingAiImagePipelineError) throw error;
    throw new ListingAiImagePipelineError(
      502,
      'listing_ai_image_visual_screen_failed',
      {
        providerCallCount: Number.isSafeInteger(error?.details?.providerCallCount)
          ? Math.max(0, Math.min(1, error.details.providerCallCount))
          : 1,
      },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
  exactKeys(
    result,
    ['visualScanCompleted', 'visualSignals', 'usage'],
    'listing_ai_image_visual_screen_invalid',
  );
  derivative.screening = evaluateListingAiSensitiveContent({
    localOcrText: derivative.localScreening.localOcrText,
    visualScanCompleted: result.visualScanCompleted,
    visualSignals: result.visualSignals,
  });
  derivative.screeningUsage = normalizeScreeningUsage(result.usage);
}

function audit(auditSink, value) {
  if (typeof auditSink !== 'function') return;
  auditSink(Object.freeze(value));
}

function safeDerivativeView(derivative) {
  return Object.freeze({
    imageReference: derivative.imageReference,
    storageReference: derivative.storageReference,
    mimeType: derivative.mimeType,
    width: derivative.width,
    height: derivative.height,
    byteSize: derivative.byteSize,
    sha256: derivative.sha256,
    screening: derivative.screening,
    originalFilenameRetained: false,
    originalMetadataRetained: false,
  });
}

function transition(derivative, state, now) {
  derivative.record = transitionListingAiDerivative(derivative.record, state, {
    now: instant(now(), 'listing_ai_image_clock_invalid'),
  });
}

async function consumeWithTimeout(consumeDerivatives, derivatives, timeoutMs) {
  if (typeof consumeDerivatives !== 'function') {
    return Object.freeze({ status: 'prepared_only' });
  }
  let timer = null;
  const controller = new AbortController();
  try {
    return await Promise.race([
      Promise.resolve().then(() => consumeDerivatives(
        derivatives.map((entry) => Object.freeze({
          ...safeDerivativeView(entry),
          bytes: entry.bytes,
        })),
        { signal: controller.signal },
      )),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ListingAiImagePipelineError(504, 'listing_ai_image_consumer_timeout'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runListingAiImagePrivacyPipeline({
  images,
  consent,
  screenDerivative,
  consumeDerivatives,
  auditSink,
  timeoutMs = defaultCleanupTimeoutMs,
  now = () => new Date(),
  randomId = () => crypto.randomUUID(),
  disclosureVersion = listingAiImageDisclosureVersion,
  disclosureText = listingAiImageDisclosureText,
}) {
  normalizeConsent(consent, { disclosureVersion, disclosureText });
  if (!Array.isArray(images)
      || images.length < 1
      || images.length > maximumImageCount) {
    fail(400, 'listing_ai_image_count_invalid');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 10 || timeoutMs > defaultCleanupTimeoutMs) {
    fail(400, 'listing_ai_image_cleanup_timeout_invalid');
  }

  const references = images.map((image) => identifier(
    image?.imageReference,
    'listing_ai_image_reference_invalid',
  ));
  if (new Set(references).size !== references.length) {
    fail(400, 'listing_ai_image_reference_duplicate');
  }

  audit(auditSink, {
    event: 'listing_ai_image_preflight_started',
    pipelineVersion: listingAiImagePipelineVersion,
    imageCount: images.length,
    explicitUserAction: true,
  });
  const derivatives = [];
  let outcome = 'failed';
  let safeFailureCode = null;
  try {
    for (const image of images) {
      derivatives.push(await createAnalysisDerivative(image, { now, randomId }));
    }
    const locallyBlocked = derivatives.some((entry) => entry.screening.status === 'blocked');
    if (!locallyBlocked) {
      let completedScreeningCalls = 0;
      for (const derivative of derivatives) {
        try {
          await completeDerivativeScreening(screenDerivative, derivative, timeoutMs);
        } catch (error) {
          if (!(error instanceof ListingAiImagePipelineError)) throw error;
          const failedCallCount = Number.isSafeInteger(error.details?.providerCallCount)
            ? Math.max(0, Math.min(1, error.details.providerCallCount))
            : 1;
          throw new ListingAiImagePipelineError(
            error.status,
            error.code,
            {
              ...error.details,
              providerCallCount: completedScreeningCalls + failedCallCount,
            },
          );
        }
        if (derivative.screeningUsage != null) completedScreeningCalls += 1;
      }
    }
    const unsafe = derivatives.filter((entry) => !entry.screening.providerEligible);
    if (unsafe.length > 0) {
      outcome = unsafe.some((entry) => entry.screening.status === 'blocked')
        ? 'blocked'
        : 'review_required';
      return Object.freeze({
        status: outcome,
        providerEligible: false,
        providerCallPerformed: derivatives.some((entry) => entry.screeningUsage),
        screeningProviderCallCount: derivatives.filter((entry) => entry.screeningUsage).length,
        screeningEstimatedCostCents: derivatives.reduce(
          (total, entry) => total + (entry.screeningUsage?.estimatedCostCents ?? 0),
          0,
        ),
        disclosureVersion,
        images: Object.freeze(derivatives.map(safeDerivativeView)),
        consumerResult: null,
      });
    }

    for (const derivative of derivatives) transition(derivative, 'analysis_ready', now);
    const consumerResult = await consumeWithTimeout(
      consumeDerivatives,
      derivatives,
      timeoutMs,
    );
    for (const derivative of derivatives) transition(derivative, 'consumed', now);
    outcome = 'consumed';
    return Object.freeze({
      status: outcome,
      providerEligible: true,
      providerCallPerformed: derivatives.some((entry) => entry.screeningUsage)
        || (consumerResult?.providerCallCount ?? 0) > 0,
      screeningProviderCallCount: derivatives.filter((entry) => entry.screeningUsage).length,
      screeningEstimatedCostCents: derivatives.reduce(
        (total, entry) => total + (entry.screeningUsage?.estimatedCostCents ?? 0),
        0,
      ),
      disclosureVersion,
      images: Object.freeze(derivatives.map(safeDerivativeView)),
      consumerResult,
    });
  } catch (error) {
    safeFailureCode = error instanceof ListingAiImagePipelineError
      ? error.code
      : 'listing_ai_image_consumer_failed';
    throw error instanceof ListingAiImagePipelineError
      ? error
      : new ListingAiImagePipelineError(502, safeFailureCode);
  } finally {
    for (const derivative of derivatives) {
      derivative.bytes.fill(0);
      if (derivative.record.state !== 'purged') transition(derivative, 'purged', now);
    }
    audit(auditSink, {
      event: 'listing_ai_image_preflight_finished',
      pipelineVersion: listingAiImagePipelineVersion,
      imageCount: images.length,
      outcome,
      failureCode: safeFailureCode,
      cleanupCompleted: derivatives.every(
        (entry) => entry.record.state === 'purged' && entry.bytes.every((byte) => byte === 0),
      ),
    });
  }
}
