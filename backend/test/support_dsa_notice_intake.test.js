import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

test('DSA notice migration binds exact evidence to the illegal-content route', async () => {
  const [up, down, privacyExport] = await Promise.all([
    readFile(path.resolve(
      currentDir,
      '../sql/migrations/042_support_dsa_notice_intake.up.sql',
    ), 'utf8'),
    readFile(path.resolve(
      currentDir,
      '../sql/migrations/042_support_dsa_notice_intake.down.sql',
    ), 'utf8'),
    readFile(path.resolve(currentDir, '../src/privacy_export.js'), 'utf8'),
  ]);

  assert.match(up, /ADD COLUMN dsa_notice_number TEXT/u);
  assert.match(up, /ADD COLUMN dsa_notice_evidence JSONB/u);
  assert.match(up, /sit_dsa_notice_intake_v1/u);
  assert.match(up, /illegal_content_notice/u);
  assert.match(up, /goodFaithConfirmed/u);
  assert.match(up, /reporterName/u);
  assert.match(up, /reporterEmail/u);
  assert.match(up, /support_dsa_notice_required/u);
  assert.match(up, /support_dsa_notice_immutable/u);
  assert.match(up, /BEFORE INSERT OR UPDATE ON support_cases/u);
  assert.match(
    down,
    /Cannot roll back DSA notice intake while evidence exists/u,
  );
  assert.match(privacyExport, /support_case\.dsa_notice_number/u);
  assert.match(privacyExport, /support_case\.dsa_notice_evidence/u);
  assert.match(
    privacyExport,
    /CASE WHEN support_case\.reporter_user_id = \$1[\s\S]*THEN support_case\.dsa_notice_evidence ELSE NULL/u,
  );
});
