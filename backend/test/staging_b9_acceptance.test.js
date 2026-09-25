import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('B9 acceptance binds every consequential and reversal mutation to a human decision', async () => {
  const source = await fs.readFile(path.join(backendRoot, 'ops/staging_b9_acceptance.mjs'), 'utf8');

  assert.match(source, /function humanModerationDecision\(\{ facts, basis, reasoning, durationType \}\)/u);
  assert.match(source, /detectionMethod: 'human'/u);
  assert.match(source, /decisionGround: 'terms_violation'/u);
  assert.match(source, /decisionOrigin: 'notice'/u);
  assert.match(source, /territorialScope: syntheticModerationTerritorialScope/u);
  assert.match(source, /automationRole: 'none'/u);
  assert.equal((source.match(/decision: humanModerationDecision\(\{/gu) ?? []).length, 7);
  assert.equal((source.match(/durationType: 'until_reversed'/gu) ?? []).length, 2);
  assert.equal((source.match(/durationType: 'not_applicable'/gu) ?? []).length, 5);

for (const route of [
  "api(`/admin/reports/${reportId}`",
  "api(`/admin/listings/${listingId}/moderation`",
  "api(`/admin/users/${users.outsider.id}/suspensions`",
  "api(`/admin/suspensions/${suspensionId}/lift`",
  "api(`/admin/reports/${outsiderReportId}`",
]) {
  assert.ok(source.includes(route), `missing expected API call: ${route}`);
}
  assert.doesNotMatch(source, /UPDATE\s+(reports|listings|user_suspensions)\s+SET/iu);
});
