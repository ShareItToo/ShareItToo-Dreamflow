import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import sharp from 'sharp';

import {
  normalizeSupportEvidenceMetadata,
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
    }),
    (error) => error.code === 'support_evidence_description_invalid',
  );
  assert.throws(
    () => normalizeSupportEvidenceMetadata({
      description: 'Nachweis\u0000 mit Steuerzeichen',
      purpose: 'Dokumentation des gemeldeten Zustands.',
      thirdPartyData: false,
    }),
    (error) => error.code === 'support_evidence_description_invalid',
  );
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
  assert.match(workflow, /access_grant\.subject_user_id = \$3/u);
  assert.match(workflow, /access_grant\.session_id = \$4/u);
  assert.match(workflow, /access_grant\.expires_at > \$5/u);
  assert.match(workflow, /evidence_file\.scan_status = 'clean'/u);
  assert.doesNotMatch(workflow, /fetch\s*\(/u);
});
