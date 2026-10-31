import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';

import sharp from 'sharp';

import {
  cleanupSupportEvidenceFiles,
  createSupportEvidence,
  normalizeSupportEvidenceMetadata,
  persistSupportEvidenceFiles,
  prepareSupportEvidenceFile,
} from '../src/support_evidence_workflow.js';

test('support evidence keeps immutable original identity and creates a separate safe preview', async () => {
  const original = await sharp({
    create: {
      width: 96,
      height: 72,
      channels: 3,
      background: { r: 30, g: 90, b: 180 },
    },
  }).jpeg({ quality: 95 }).toBuffer();

  const prepared = await prepareSupportEvidenceFile(original, {
    claimedMimeType: 'image/jpeg',
  });

  assert.equal(prepared.detectedMimeType, 'image/jpeg');
  assert.equal(prepared.extension, 'jpg');
  assert.equal(prepared.originalByteSize, original.length);
  assert.match(prepared.originalSha256, /^[0-9a-f]{64}$/u);
  assert.equal(prepared.scanStatus, 'pending');
  assert.equal(prepared.scanEngine, 'none');
  assert.equal(prepared.externalAiUsed, false);
  assert.equal(prepared.preview.mimeType, 'image/webp');
  assert.match(prepared.preview.sha256, /^[0-9a-f]{64}$/u);
  assert.notEqual(prepared.preview.sha256, prepared.originalSha256);
  assert.notDeepEqual(prepared.preview.bytes, original);
});

test('SUP-099 blocks executable bytes and claimed MIME mismatch', async () => {
  const executable = Buffer.alloc(512);
  executable.write('MZ', 0, 'ascii');
  executable.write('This program cannot be run in DOS mode', 78, 'ascii');
  await assert.rejects(
    () => prepareSupportEvidenceFile(executable, { claimedMimeType: 'image/jpeg' }),
    (error) => error.code === 'support_evidence_mime_not_allowed',
  );

  const png = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  }).png().toBuffer();
  await assert.rejects(
    () => prepareSupportEvidenceFile(png, { claimedMimeType: 'image/jpeg' }),
    (error) => error.code === 'support_evidence_mime_mismatch',
  );
});

test('SUP-100 deterministic malware fixture is quarantined without a preview', async () => {
  const fixture = Buffer.from([
    'X5O!P%@AP',
    '[4\\PZX54(P^)7CC)7}$',
    'EICAR-STANDARD-ANTIVIRUS-TEST-FILE',
  ].join('-'), 'ascii');
  const prepared = await prepareSupportEvidenceFile(fixture, {
    claimedMimeType: 'image/jpeg',
  });

  assert.equal(prepared.scanStatus, 'quarantined');
  assert.equal(prepared.scanEngine, 'deterministic_signature');
  assert.equal(prepared.quarantineReasonCode, 'malware_signature_detected');
  assert.equal(prepared.preview, null);
  assert.equal(prepared.externalAiUsed, false);
});

test('SUP-101 rejects HTML-like stored descriptions and unsafe control characters', () => {
  assert.throws(
    () => normalizeSupportEvidenceMetadata({
      description: '<img src=x onerror=alert(1)>',
      purpose: 'Dokumentation des gemeldeten Zustands.',
      thirdPartyData: false,
      specialCategoryClassification: 'not_indicated',
    }),
    (error) => error.code === 'support_evidence_description_invalid',
  );
  assert.throws(
    () => normalizeSupportEvidenceMetadata({
      description: 'Nachweis\u0000 mit Steuerzeichen',
      purpose: 'Dokumentation des gemeldeten Zustands.',
      thirdPartyData: false,
      specialCategoryClassification: 'not_indicated',
    }),
    (error) => error.code === 'support_evidence_description_invalid',
  );
});

test('WP160 requires attachment classification and rejects health mismatch', () => {
  assert.throws(
    () => normalizeSupportEvidenceMetadata({
      description: 'Dokumentation des gemeldeten Zustands.',
      purpose: 'Dokumentation des gemeldeten Zustands.',
      thirdPartyData: false,
    }),
    /support_evidence_special_category_classification_required/u,
  );
  assert.throws(
    () => normalizeSupportEvidenceMetadata({
      description: 'Medizinischer Befund als Nachweis.',
      purpose: 'Nur für die konkrete Fallprüfung.',
      thirdPartyData: false,
      specialCategoryClassification: 'not_indicated',
    }),
    /support_evidence_special_category_classification_mismatch/u,
  );
  const normalized = normalizeSupportEvidenceMetadata({
    description: 'Medizinischer Befund als Nachweis.',
    purpose: 'Nur für die konkrete Fallprüfung.',
    thirdPartyData: false,
    specialCategoryClassification: 'possible_special_category',
  });
  assert.equal(normalized.specialCategoryClassification, 'possible_special_category');
  assert.equal(normalized.specialCategoryDetection.detectionVersion,
    'sit_special_category_detection_v1');
});

test('SUP-102 through SUP-105 are bound by database, config and route guards', () => {
  const up = fs.readFileSync(
    new URL('../sql/migrations/051_support_evidence_security.up.sql', import.meta.url),
    'utf8',
  );
  const down = fs.readFileSync(
    new URL('../sql/migrations/051_support_evidence_security.down.sql', import.meta.url),
    'utf8',
  );
  const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
  const workflow = fs.readFileSync(
    new URL('../src/support_evidence_workflow.js', import.meta.url),
    'utf8',
  );

  assert.match(up, /support_evidence_access_grants/u);
  assert.match(up, /subject_user_id/u);
  assert.match(up, /session_id/u);
  assert.match(up, /expires_at > created_at/u);
  assert.match(up, /support evidence source and preview are immutable/u);
  assert.match(up, /external_ai_used BOOLEAN NOT NULL DEFAULT false CHECK \(external_ai_used = false\)/u);
  assert.match(down, /rollback would lose retained evidence/u);
  assert.match(config, /SUPPORT_EVIDENCE_INTAKE_ENABLED/u);
  assert.match(config, /deploymentEnvironment === 'production'/u);
  assert.match(config, /scannerTransport: 'none'/u);
  assert.match(config, /externalAiAllowed: false/u);
  assert.match(config, /originalPublicAccessAllowed: false/u);
  assert.match(app, /X-Support-Evidence-Grant/u);
  assert.match(app, /support_evidence_preview_integrity_mismatch/u);
  const evidenceRouteStart = app.indexOf("app.post(\n    '/v1/support/cases/:id/evidence'");
  const evidenceRouteEnd = app.indexOf("app.post('/v1/support/evidence/:id/access-grants'");
  assert.ok(evidenceRouteStart >= 0 && evidenceRouteEnd > evidenceRouteStart);
  const evidenceRoute = app.slice(evidenceRouteStart, evidenceRouteEnd);
  assert.ok(evidenceRoute.indexOf('result = await inTransaction')
    < evidenceRoute.indexOf('persistFiles: async'));
  assert.match(evidenceRoute, /persistSupportEvidenceFiles/u);
  assert.match(evidenceRoute, /cleanupSupportEvidenceFiles/u);
  assert.match(workflow, /access_grant\.subject_user_id = \$3/u);
  assert.match(workflow, /access_grant\.session_id = \$4/u);
  assert.match(workflow, /access_grant\.expires_at > \$5/u);
  assert.match(workflow, /evidence_file\.scan_status = 'clean'/u);
  assert.doesNotMatch(workflow, /fetch\s*\(/u);
});

class EvidenceScriptedClient {
  constructor(steps) {
    this.steps = [...steps];
    this.calls = [];
  }

  async query(sql, params = []) {
    this.calls.push({ sql, params });
    const step = this.steps.shift();
    assert.ok(step, `unexpected query: ${sql}`);
    assert.match(sql, step.match);
    return typeof step.result === 'function'
      ? step.result({ sql, params })
      : (step.result ?? { rowCount: 0, rows: [] });
  }
}

const preparedFixture = Object.freeze({
  detectedMimeType: 'image/jpeg',
  extension: 'jpg',
  originalByteSize: 32,
  originalSha256: 'a'.repeat(64),
  preview: Object.freeze({
    bytes: Buffer.from('preview'),
    mimeType: 'image/webp',
    byteSize: 7,
    sha256: 'b'.repeat(64),
    width: 1,
    height: 1,
  }),
  scanStatus: 'pending',
  scanEngine: 'none',
  quarantineReasonCode: null,
  scannedAt: null,
});

const evidenceArguments = Object.freeze({
  actor: { id: 'user-1', role: 'user' },
  caseId: 'case-1',
  rawMetadata: {
    description: 'Dokumentation des gemeldeten Zustands.',
    purpose: 'Dokumentation für den konkreten Supportfall.',
    thirdPartyData: false,
    specialCategoryClassification: 'not_indicated',
  },
  preparedFile: preparedFixture,
  evidenceId: '11111111-1111-4111-8111-111111111111',
  fileId: '22222222-2222-4222-8222-222222222222',
  originalStorageName: 'support-evidence-22222222-2222-4222-8222-222222222222-original.jpg',
  previewStorageName: 'support-evidence-22222222-2222-4222-8222-222222222222-preview.webp',
  idempotencyKey: 'support-evidence-test-001',
});

function requestHash(argumentsValue) {
  const metadata = argumentsValue.rawMetadata;
  return crypto.createHash('sha256').update(JSON.stringify({
    caseId: argumentsValue.caseId,
    description: metadata.description,
    purpose: metadata.purpose,
    claimedEventTime: null,
    thirdPartyData: metadata.thirdPartyData,
    specialCategoryClassification: metadata.specialCategoryClassification,
    originalSha256: argumentsValue.preparedFile.originalSha256,
  })).digest('hex');
}

function caseLookupSteps(
  intakeScopeEvidence = {},
  caseType = null,
  caseSubtype = null,
) {
  return [
    { match: /pg_advisory_xact_lock/u },
    { match: /SELECT evidence\.id AS evidence_id/u, result: { rowCount: 0, rows: [] } },
    {
      match: /SELECT id, human_readable_case_number/u,
      result: {
        rowCount: 1,
        rows: [{
          id: 'case-1',
          human_readable_case_number: 'SIT-ABCDEFGHJKLM',
          reporter_user_id: 'user-1',
          affected_user_ids: [],
          linked_booking_id: null,
          linked_listing_id: null,
          status: 'received',
          case_type: caseType,
          case_subtype: caseSubtype,
          intake_scope_evidence: intakeScopeEvidence,
        }],
      },
    },
  ];
}

test('evidence persistence starts only after case and classification gates', async () => {
  let fileWrites = 0;
  const missingClassification = new EvidenceScriptedClient([]);
  await assert.rejects(
    () => createSupportEvidence(missingClassification, {
      ...evidenceArguments,
      rawMetadata: {
        ...evidenceArguments.rawMetadata,
        specialCategoryClassification: undefined,
      },
      persistFiles: async () => { fileWrites += 1; },
    }),
    /support_evidence_special_category_classification_required/u,
  );
  assert.equal(fileWrites, 0);
  assert.equal(missingClassification.calls.length, 0);

  const unboundSpecial = new EvidenceScriptedClient(caseLookupSteps());
  await assert.rejects(
    () => createSupportEvidence(unboundSpecial, {
      ...evidenceArguments,
      rawMetadata: {
        ...evidenceArguments.rawMetadata,
        description: 'Medizinischer Befund als Nachweis.',
        purpose: 'Nur für die konkrete Fallprüfung.',
        specialCategoryClassification: 'possible_special_category',
      },
      persistFiles: async () => { fileWrites += 1; },
    }),
    /support_evidence_article9_server_authorization_required/u,
  );
  assert.equal(fileWrites, 0);
  assert.equal(unboundSpecial.calls.some(({ sql }) => /INSERT INTO/u.test(sql)), false);

  const historicalProductSafety = new EvidenceScriptedClient(caseLookupSteps(
    { specialCategoryHandling: { legacy: true } },
    'trust_safety',
    'dangerous_item_or_injury',
  ));
  await assert.rejects(
    () => createSupportEvidence(historicalProductSafety, {
      ...evidenceArguments,
      rawMetadata: {
        ...evidenceArguments.rawMetadata,
        description: 'Beschädigte Verpackung ohne Verletzung.',
        purpose: 'Nachweis des Produktzustands.',
        specialCategoryClassification: 'not_indicated',
      },
      persistFiles: async () => { fileWrites += 1; },
    }),
    /support_evidence_article9_server_authorization_required/u,
  );
  assert.equal(fileWrites, 0);
  assert.equal(
    historicalProductSafety.calls.some(({ sql }) => /INSERT INTO/u.test(sql)),
    false,
  );
});

test('evidence bytes are persisted after validation and before database inserts', async () => {
  const client = new EvidenceScriptedClient([
    ...caseLookupSteps(),
    { match: /INSERT INTO support_evidence \(/u },
    {
      match: /INSERT INTO support_evidence_files/u,
      result: {
        rowCount: 1,
        rows: [{
          file_id: evidenceArguments.fileId,
          evidence_id: evidenceArguments.evidenceId,
          scan_status: 'pending',
          detected_mime_type: 'image/jpeg',
          original_byte_size: 32,
          original_sha256: 'a'.repeat(64),
          preview_storage_name: evidenceArguments.previewStorageName,
        }],
      },
    },
    { match: /INSERT INTO support_case_events/u },
    { match: /INSERT INTO audit_log/u },
  ]);
  const events = [];
  const result = await createSupportEvidence(client, {
    ...evidenceArguments,
    persistFiles: async () => events.push(`persist-before-${client.calls.length}`),
  });
  assert.equal(result.replayed, false);
  assert.deepEqual(events, ['persist-before-3']);
  assert.equal(client.calls.findIndex(({ sql }) => /INSERT INTO support_evidence \(/u.test(sql)), 3);
});

test('idempotent evidence replay performs no file persistence or inserts', async () => {
  let persistCalls = 0;
  const client = new EvidenceScriptedClient([
    { match: /pg_advisory_xact_lock/u },
    {
      match: /SELECT evidence\.id AS evidence_id/u,
      result: {
        rowCount: 1,
        rows: [{
          evidence_id: evidenceArguments.evidenceId,
          file_id: evidenceArguments.fileId,
          case_id: evidenceArguments.caseId,
          description: evidenceArguments.rawMetadata.description,
          purpose: evidenceArguments.rawMetadata.purpose,
          claimed_event_time: null,
          received_at: new Date('2026-08-21T10:00:00.000Z'),
          third_party_data_flag: false,
          scan_status: 'pending',
          detected_mime_type: 'image/jpeg',
          original_byte_size: evidenceArguments.preparedFile.originalByteSize,
          original_sha256: evidenceArguments.preparedFile.originalSha256,
          preview_storage_name: evidenceArguments.previewStorageName,
          request_sha256: requestHash(evidenceArguments),
          special_category_classification: 'not_indicated',
        }],
      },
    },
  ]);
  const result = await createSupportEvidence(client, {
    ...evidenceArguments,
    persistFiles: async () => { persistCalls += 1; },
  });
  assert.equal(result.replayed, true);
  assert.equal(persistCalls, 0);
  assert.equal(client.calls.some(({ sql }) => /INSERT INTO/u.test(sql)), false);
});

test('evidence write failure occurs before inserts and can be cleaned by the caller', async () => {
  const client = new EvidenceScriptedClient(caseLookupSteps());
  let cleanupRequired = false;
  await assert.rejects(
    () => createSupportEvidence(client, {
      ...evidenceArguments,
      persistFiles: async () => {
        cleanupRequired = true;
        throw new Error('synthetic_write_failure');
      },
    }),
    /synthetic_write_failure/u,
  );
  assert.equal(cleanupRequired, true);
  assert.equal(client.calls.some(({ sql }) => /INSERT INTO/u.test(sql)), false);
});

test('evidence storage cleanup removes only files written by this request', async () => {
  const calls = [];
  const fakeFs = {
    async mkdir(...args) { calls.push(['mkdir', ...args]); },
    async writeFile(filePath, bytes, options) {
      calls.push(['write', filePath, bytes, options]);
      if (filePath.endsWith('original.jpg')) {
        const error = new Error('synthetic_eexist');
        error.code = 'EEXIST';
        throw error;
      }
    },
    async unlink(filePath) { calls.push(['unlink', filePath]); },
  };
  await assert.rejects(
    () => persistSupportEvidenceFiles({
      fsApi: fakeFs,
      uploadDir: '/tmp/sit-evidence-test',
      originalStorageName: 'support-evidence-1-original.jpg',
      originalBytes: Buffer.from('original'),
      previewStorageName: 'support-evidence-1-preview.webp',
      previewBytes: Buffer.from('preview'),
    }),
    /synthetic_eexist/u,
  );
  assert.equal(calls.some(([kind]) => kind === 'unlink'), false);

  calls.length = 0;
  const previewFailFs = {
    ...fakeFs,
    async writeFile(filePath, bytes, options) {
      calls.push(['write', filePath, bytes, options]);
      if (filePath.endsWith('preview.webp')) throw new Error('synthetic_preview_failure');
    },
  };
  await assert.rejects(
    () => persistSupportEvidenceFiles({
      fsApi: previewFailFs,
      uploadDir: '/tmp/sit-evidence-test',
      originalStorageName: 'support-evidence-2-original.jpg',
      originalBytes: Buffer.from('original'),
      previewStorageName: 'support-evidence-2-preview.webp',
      previewBytes: Buffer.from('preview'),
    }),
    /synthetic_preview_failure/u,
  );
  assert.deepEqual(
    calls.filter(([kind]) => kind === 'unlink').map(([, filePath]) => filePath),
    ['/tmp/sit-evidence-test/support-evidence-2-original.jpg'],
  );

  await cleanupSupportEvidenceFiles({
    fsApi: fakeFs,
    paths: {
      originalPath: '/tmp/sit-evidence-test/original.jpg',
      previewPath: '/tmp/sit-evidence-test/preview.webp',
    },
    written: { original: false, preview: true },
  });
  assert.deepEqual(
    calls.filter(([kind]) => kind === 'unlink').map(([, filePath]) => filePath),
    [
      '/tmp/sit-evidence-test/support-evidence-2-original.jpg',
      '/tmp/sit-evidence-test/preview.webp',
    ],
  );
});
