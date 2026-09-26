import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const repository = readFileSync('lib/services/backend_repository.dart', 'utf8');
const regression = readFileSync('scripts/technical_regression_check.sh', 'utf8');

test('authenticated support detail preserves the final-decision contract', () => {
  const start = repository.indexOf(
    'static Future<Map<String, dynamic>> getSupportCase(',
  );
  const end = repository.indexOf(
    'static Future<Map<String, dynamic>> createBookingReview',
    start,
  );
  assert.ok(start >= 0 && end > start, 'support detail repository method');
  const method = repository.slice(start, end);
  assert.match(method, /getSupportCase\(\s*String caseId,\s*\{\s*required AuthSessionOwner owner/u);
  assert.match(method, /_authorizedForOwner\(\s*owner: owner/u);
  assert.match(method, /final finalDecision = response\['finalDecision'\]/u);
  assert.match(method, /finalDecision != null && finalDecision is! Map/u);
  assert.match(method, /'finalDecision': finalDecision == null/u);
  assert.match(method, /Map<String, dynamic>\.from\(finalDecision\)/u);
});

test('technical regression permanently checks support final-decision wiring', () => {
  assert.match(
    regression,
    /node --test test\/tool\/support_final_decision_wiring\.test\.mjs/u,
  );
});
