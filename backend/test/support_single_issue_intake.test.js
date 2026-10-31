import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('single-issue intake migration requires new evidence and preserves recorded truth', async () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const up = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/040_support_single_issue_intake.up.sql'),
    'utf8',
  );
  const down = await fs.readFile(
    path.resolve(currentDir, '../sql/migrations/040_support_single_issue_intake.down.sql'),
    'utf8',
  );

  assert.match(up, /ADD COLUMN intake_scope_evidence JSONB/u);
  assert.match(up, /sit_support_single_issue_scope_v1/u);
  assert.match(up, /NEW\.intake_scope_evidence IS NULL/u);
  assert.match(up, /support_issue_scope_required/u);
  assert.match(up, /support_issue_scope_immutable/u);
  assert.match(up, /BEFORE INSERT OR UPDATE ON support_cases/u);
  assert.match(
    down,
    /Cannot roll back support single-issue intake while evidence exists/u,
  );
});
