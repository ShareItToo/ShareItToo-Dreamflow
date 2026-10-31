import assert from 'node:assert/strict';
import test from 'node:test';

import sharp from 'sharp';

import {
  ListingAiImagePipelineError,
  evaluateListingAiSensitiveContent,
  listingAiImageDisclosureText,
  listingAiImageDisclosureVersion,
  runListingAiImagePrivacyPipeline,
} from '../src/listing_ai_image_pipeline.js';

const safeConsent = Object.freeze({
  explicitlyInitiated: true,
  accepted: true,
  disclosureVersion: listingAiImageDisclosureVersion,
  disclosureText: listingAiImageDisclosureText,
});
const safeScreening = Object.freeze({
  localOcrText: '',
  visualScanCompleted: true,
  visualSignals: Object.freeze([]),
});
const ids = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
];

async function sourceImage({ metadata = false, width = 2400, height = 1600 } = {}) {
  let image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 100, b: 200 },
    },
  });
  if (metadata) {
    image = image.withExif({
      IFD0: { ImageDescription: 'Synthetic GPS-like private metadata' },
    });
  }
  return image.jpeg({ quality: 94 }).toBuffer();
}

function input(bytes, overrides = {}) {
  return {
    imageReference: 'upload_reference_12345678',
    originalFilename: 'private-address-and-owner-name.jpg',
    bytes,
    localScreening: safeScreening,
    ...overrides,
  };
}

function randomIdSequence(values = ids) {
  let index = 0;
  return () => values[index++];
}

test('analysis derivatives strip EXIF/GPS, resize, compress and use opaque safe names', async () => {
  const bytes = await sourceImage({ metadata: true });
  const originalCopy = Buffer.from(bytes);
  assert.ok((await sharp(bytes).metadata()).exif);
  let derivativeCopy = null;
  let derivativeReference = null;
  let liveBytes = null;
  const auditEvents = [];
  const result = await runListingAiImagePrivacyPipeline({
    images: [input(bytes)],
    consent: safeConsent,
    randomId: randomIdSequence(),
    auditSink: (event) => auditEvents.push(event),
    consumeDerivatives: async ([derivative]) => {
      derivativeCopy = Buffer.from(derivative.bytes);
      liveBytes = derivative.bytes;
      derivativeReference = derivative.storageReference;
      return { accepted: true };
    },
  });

  assert.equal(result.status, 'consumed');
  assert.equal(result.providerCallPerformed, false);
  assert.equal(derivativeReference, `analysis-${ids[0]}.webp`);
  assert.ok(!derivativeReference.includes('private-address'));
  assert.deepEqual(bytes, originalCopy);
  assert.ok(liveBytes.every((byte) => byte === 0));
  const metadata = await sharp(derivativeCopy).metadata();
  assert.equal(metadata.format, 'webp');
  assert.ok(metadata.width <= 1280);
  assert.ok(metadata.height <= 1280);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.gps, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
  assert.equal(auditEvents.at(-1).cleanupCompleted, true);
});

test('exact disclosure, consent and explicit user initiation are mandatory', async () => {
  const bytes = await sourceImage();
  for (const consent of [
    { ...safeConsent, explicitlyInitiated: false },
    { ...safeConsent, accepted: false },
    { ...safeConsent, disclosureText: 'shortened' },
    { ...safeConsent, disclosureVersion: 'stale' },
  ]) {
    await assert.rejects(
      runListingAiImagePrivacyPipeline({ images: [input(bytes)], consent }),
      (error) => error instanceof ListingAiImagePipelineError
        && /listing_ai_image_(?:action_not_explicit|consent_required)/u.test(error.code),
    );
  }
});

test('local OCR blocks addresses, financial data, credentials and documents', () => {
  const cases = [
    ['Musterstraße 12', 'address_text_detected'],
    ['DE89 3704 0044 0532 0130 00', 'iban_detected'],
    ['Passwort: very-secret-value', 'credential_text_detected'],
    ['Personalausweis Vorderseite', 'identity_or_health_document_text_detected'],
  ];
  for (const [localOcrText, code] of cases) {
    const result = evaluateListingAiSensitiveContent({
      localOcrText,
      visualScanCompleted: true,
      visualSignals: [],
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.providerEligible, false);
    assert.ok(result.reasonCodes.includes(code));
    assert.equal(JSON.stringify(result).includes(localOcrText), false);
  }
});

test('high-confidence local visual signals block every sensitive class', () => {
  for (const type of [
    'face',
    'document',
    'address',
    'financial_data',
    'credentials',
    'unrelated_sensitive_material',
  ]) {
    const result = evaluateListingAiSensitiveContent({
      localOcrText: '',
      visualScanCompleted: true,
      visualSignals: [{ type, confidence: 'HIGH' }],
    });
    assert.equal(result.status, 'blocked');
    assert.equal(result.userAction, 'replace_image');
  }
});

test('incomplete or uncertain local visual screening asks for crop or replacement', () => {
  const incomplete = evaluateListingAiSensitiveContent({
    localOcrText: '',
    visualScanCompleted: false,
    visualSignals: [],
  });
  assert.equal(incomplete.status, 'review_required');
  assert.deepEqual(incomplete.reasonCodes, ['local_visual_screen_incomplete']);
  assert.equal(incomplete.userAction, 'crop_or_replace_image');

  const uncertain = evaluateListingAiSensitiveContent({
    localOcrText: '',
    visualScanCompleted: true,
    visualSignals: [{ type: 'face', confidence: 'MEDIUM' }],
  });
  assert.equal(uncertain.status, 'review_required');
  assert.deepEqual(uncertain.reasonCodes, ['face_medium']);
});

test('unsafe preflight never invokes the consumer and always cleans derivatives', async () => {
  const bytes = await sourceImage();
  let consumerCalls = 0;
  const auditEvents = [];
  const result = await runListingAiImagePrivacyPipeline({
    images: [input(bytes, {
      localScreening: {
        localOcrText: '',
        visualScanCompleted: true,
        visualSignals: [{ type: 'document', confidence: 'HIGH' }],
      },
    })],
    consent: safeConsent,
    randomId: randomIdSequence(),
    auditSink: (event) => auditEvents.push(event),
    consumeDerivatives: async () => {
      consumerCalls += 1;
    },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.providerEligible, false);
  assert.equal(consumerCalls, 0);
  assert.equal(auditEvents.at(-1).cleanupCompleted, true);
});

test('optional derivative screening sees only stripped WebP and can complete preflight', async () => {
  const bytes = await sourceImage({ metadata: true });
  let screenedBytes = null;
  let screenedMetadata = null;
  const result = await runListingAiImagePrivacyPipeline({
    images: [input(bytes, {
      localScreening: {
        localOcrText: '',
        visualScanCompleted: false,
        visualSignals: [],
      },
    })],
    consent: safeConsent,
    randomId: randomIdSequence(),
    screenDerivative: async (derivative) => {
      screenedBytes = derivative.bytes;
      screenedMetadata = await sharp(Buffer.from(derivative.bytes)).metadata();
      return {
        visualScanCompleted: true,
        visualSignals: [],
        usage: {
          inputUnits: 50,
          outputUnits: 10,
          estimatedCostCents: 1,
          billedCostCents: null,
        },
      };
    },
    consumeDerivatives: async () => ({ providerCallCount: 0 }),
  });
  assert.equal(result.status, 'consumed');
  assert.equal(result.providerEligible, true);
  assert.equal(result.providerCallPerformed, true);
  assert.equal(result.screeningProviderCallCount, 1);
  assert.equal(result.screeningEstimatedCostCents, 1);
  assert.equal(screenedMetadata.format, 'webp');
  assert.equal(screenedMetadata.exif, undefined);
  assert.ok(screenedBytes.every((byte) => byte === 0));
});

test('external derivative screening cannot be bypassed by client-supplied passed state', async () => {
  const bytes = await sourceImage();
  let screeningCalls = 0;
  let consumerCalls = 0;
  const result = await runListingAiImagePrivacyPipeline({
    images: [input(bytes)],
    consent: safeConsent,
    randomId: randomIdSequence(),
    screenDerivative: async () => {
      screeningCalls += 1;
      return {
        visualScanCompleted: true,
        visualSignals: [{ type: 'document', confidence: 'HIGH' }],
        usage: {
          inputUnits: 50,
          outputUnits: 10,
          estimatedCostCents: 1,
          billedCostCents: null,
        },
      };
    },
    consumeDerivatives: async () => { consumerCalls += 1; },
  });
  assert.equal(screeningCalls, 1);
  assert.equal(result.status, 'blocked');
  assert.equal(result.images[0].screening.reasonCodes.includes('document_high'), true);
  assert.equal(consumerCalls, 0);
});

test('external derivative screening has a hard aborting timeout', async () => {
  const bytes = await sourceImage();
  let signal = null;
  await assert.rejects(
    runListingAiImagePrivacyPipeline({
      images: [input(bytes)],
      consent: safeConsent,
      timeoutMs: 20,
      randomId: randomIdSequence(),
      screenDerivative: async (_derivative, options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    }),
    (error) => error instanceof ListingAiImagePipelineError
      && error.code === 'listing_ai_image_visual_screen_timeout'
      && error.details.providerCallCount === 1,
  );
  assert.equal(signal.aborted, true);
});

test('a later screening failure reports every attempted external call', async () => {
  const bytes = await sourceImage();
  let calls = 0;
  await assert.rejects(
    runListingAiImagePrivacyPipeline({
      images: [
        input(bytes, { imageReference: 'upload_reference_1_12345678' }),
        input(bytes, { imageReference: 'upload_reference_2_12345678' }),
      ],
      consent: safeConsent,
      randomId: randomIdSequence(),
      screenDerivative: async () => {
        calls += 1;
        if (calls === 2) throw new Error('private provider detail');
        return {
          visualScanCompleted: true,
          visualSignals: [],
          usage: {
            inputUnits: 50,
            outputUnits: 10,
            estimatedCostCents: 1,
            billedCostCents: null,
          },
        };
      },
    }),
    (error) => error instanceof ListingAiImagePipelineError
      && error.code === 'listing_ai_image_visual_screen_failed'
      && error.details.providerCallCount === 2,
  );
  assert.equal(calls, 2);
});

test('a local hard block prevents every external screening call', async () => {
  const bytes = await sourceImage();
  let calls = 0;
  const result = await runListingAiImagePrivacyPipeline({
    images: [
      input(bytes, {
        imageReference: 'upload_reference_1_12345678',
        localScreening: {
          localOcrText: 'IBAN DE00 0000 0000 0000 0000 00',
          visualScanCompleted: true,
          visualSignals: [],
        },
      }),
      input(bytes, { imageReference: 'upload_reference_2_12345678' }),
    ],
    consent: safeConsent,
    randomId: randomIdSequence(),
    screenDerivative: async () => { calls += 1; },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.providerCallPerformed, false);
  assert.equal(result.screeningProviderCallCount, 0);
  assert.equal(calls, 0);
});

test('derivative screening blocks sensitive signals before the consumer', async () => {
  const bytes = await sourceImage();
  let consumerCalls = 0;
  const result = await runListingAiImagePrivacyPipeline({
    images: [input(bytes, {
      localScreening: {
        localOcrText: '',
        visualScanCompleted: false,
        visualSignals: [],
      },
    })],
    consent: safeConsent,
    randomId: randomIdSequence(),
    screenDerivative: async () => ({
      visualScanCompleted: true,
      visualSignals: [{ type: 'face', confidence: 'HIGH' }],
      usage: {
        inputUnits: 50,
        outputUnits: 10,
        estimatedCostCents: 1,
        billedCostCents: null,
      },
    }),
    consumeDerivatives: async () => { consumerCalls += 1; },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.providerCallPerformed, true);
  assert.equal(result.images[0].screening.reasonCodes.includes('face_high'), true);
  assert.equal(consumerCalls, 0);
});

test('derivative screening failure is sanitized and purges its bytes', async () => {
  const bytes = await sourceImage();
  let screenedBytes = null;
  await assert.rejects(
    runListingAiImagePrivacyPipeline({
      images: [input(bytes, {
        localScreening: {
          localOcrText: '',
          visualScanCompleted: false,
          visualSignals: [],
        },
      })],
      consent: safeConsent,
      randomId: randomIdSequence(),
      screenDerivative: async (derivative) => {
        screenedBytes = derivative.bytes;
        throw new Error('private provider detail');
      },
    }),
    (error) => error instanceof ListingAiImagePipelineError
      && error.code === 'listing_ai_image_visual_screen_failed'
      && !error.message.includes('private provider detail'),
  );
  assert.ok(screenedBytes.every((byte) => byte === 0));
});

test('one to four distinct images are accepted and a duplicate or fifth image is rejected', async () => {
  const bytes = await sourceImage();
  const images = ids.map((_, index) => input(bytes, {
    imageReference: `upload_reference_${index + 1}_12345678`,
    originalFilename: `owner-private-${index}.jpg`,
  }));
  const result = await runListingAiImagePrivacyPipeline({
    images,
    consent: safeConsent,
    randomId: randomIdSequence(),
  });
  assert.equal(result.images.length, 4);

  await assert.rejects(
    runListingAiImagePrivacyPipeline({
      images: [...images, input(bytes, { imageReference: 'upload_reference_5_12345678' })],
      consent: safeConsent,
    }),
    (error) => error.code === 'listing_ai_image_count_invalid',
  );
  await assert.rejects(
    runListingAiImagePrivacyPipeline({
      images: [images[0], { ...images[1], imageReference: images[0].imageReference }],
      consent: safeConsent,
    }),
    (error) => error.code === 'listing_ai_image_reference_duplicate',
  );
});

test('consumer timeout aborts once and still zeroes every derivative buffer', async () => {
  const bytes = await sourceImage();
  let capturedBytes = null;
  let capturedSignal = null;
  const auditEvents = [];
  await assert.rejects(
    runListingAiImagePrivacyPipeline({
      images: [input(bytes)],
      consent: safeConsent,
      timeoutMs: 20,
      randomId: randomIdSequence(),
      auditSink: (event) => auditEvents.push(event),
      consumeDerivatives: async ([derivative], { signal }) => {
        capturedBytes = derivative.bytes;
        capturedSignal = signal;
        return new Promise(() => {});
      },
    }),
    (error) => error.code === 'listing_ai_image_consumer_timeout',
  );
  assert.equal(capturedSignal.aborted, true);
  assert.ok(capturedBytes.every((byte) => byte === 0));
  assert.equal(auditEvents.at(-1).failureCode, 'listing_ai_image_consumer_timeout');
  assert.equal(auditEvents.at(-1).cleanupCompleted, true);
});

test('consumer failure is reduced to a safe code and never leaks original or OCR content', async () => {
  const bytes = await sourceImage();
  const auditEvents = [];
  let capturedBytes = null;
  await assert.rejects(
    runListingAiImagePrivacyPipeline({
      images: [input(bytes, {
        originalFilename: 'walid-private-home-address.jpg',
        localScreening: {
          ...safeScreening,
          localOcrText: 'ordinary product label',
        },
      })],
      consent: safeConsent,
      randomId: randomIdSequence(),
      auditSink: (event) => auditEvents.push(event),
      consumeDerivatives: async ([derivative]) => {
        capturedBytes = derivative.bytes;
        throw new Error('provider output with private content');
      },
    }),
    (error) => error.code === 'listing_ai_image_consumer_failed'
      && error.message === 'listing_ai_image_consumer_failed',
  );
  assert.ok(capturedBytes.every((byte) => byte === 0));
  const audit = JSON.stringify(auditEvents);
  assert.doesNotMatch(audit, /walid|home-address|ordinary product label|provider output/u);
  assert.match(audit, /listing_ai_image_consumer_failed/u);
});

test('analysis result and audit remain non-publishing and provider-free', async () => {
  const bytes = await sourceImage();
  const auditEvents = [];
  const result = await runListingAiImagePrivacyPipeline({
    images: [input(bytes)],
    consent: safeConsent,
    randomId: randomIdSequence(),
    auditSink: (event) => auditEvents.push(event),
  });
  assert.equal(result.consumerResult.status, 'prepared_only');
  assert.equal(result.providerCallPerformed, false);
  assert.equal(result.disclosureVersion, listingAiImageDisclosureVersion);
  const serialized = JSON.stringify({ result, auditEvents });
  assert.doesNotMatch(serialized, /autoPublish|private-address|"bytes"/iu);
});
