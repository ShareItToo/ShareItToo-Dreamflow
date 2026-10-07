import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

test('DSA locator completion is additive, append-only and privacy-exported', async () => {
  const [up, down, workflow, privacyExport] = await Promise.all([
    readFile(path.resolve(
      currentDir,
      '../sql/migrations/043_support_dsa_notice_locator_completion.up.sql',
    ), 'utf8'),
    readFile(path.resolve(
      currentDir,
      '../sql/migrations/043_support_dsa_notice_locator_completion.down.sql',
    ), 'utf8'),
    readFile(path.resolve(currentDir, '../src/support_case_workflow.js'), 'utf8'),
    readFile(path.resolve(currentDir, '../src/privacy_export.js'), 'utf8'),
  ]);

  assert.match(up, /dsa_notice_locator_status/u);
  assert.match(up, /needs_clarification/u);
  assert.match(up, /support_dsa_notice_locator_amendments/u);
  assert.match(up, /support_dsa_notice_locator_amendment_invalid/u);
  assert.match(up, /support_dsa_notice_locator_amendment_guard/u);
  assert.match(up, /sit_reject_support_audit_mutation/u);
  assert.match(up, /support_dsa_notice_locator_state_immutable/u);
  assert.match(down, /Cannot roll back DSA locator completion while evidence exists/u);
  assert.match(workflow, /support\.dsa_notice_locator_completed/u);
  assert.doesNotMatch(
    workflow,
    /structuredPayload:[\s\S]{0,300}contentLocator/u,
  );
  assert.match(privacyExport, /supportDsaNoticeLocatorAmendments/u);
  assert.match(privacyExport, /amendment\.reporter_user_id = \$1/u);
});
