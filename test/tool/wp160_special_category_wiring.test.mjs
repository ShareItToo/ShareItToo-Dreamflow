import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(path, 'utf8');

test('WP160 keeps special-category handling technical, bounded and fail closed', () => {
  const guard = read('backend/src/special_category_data_guard.js');
  const support = read('backend/src/support_case_domain.js');
  const evidence = read('backend/src/support_evidence_workflow.js');
  const messages = read('backend/src/support_message_domain.js');
  const moderation = read('backend/src/moderation_domain.js');
  const migration = read('backend/sql/migrations/079_special_category_intake_minimization.up.sql');
  const exportSource = read('backend/src/privacy_export.js');
  const ui = read('lib/screens/support_flow_screen.dart');

  assert.match(guard, /special_category_handling_required/u);
  assert.match(guard, /no_unrestricted_replication/u);
  assert.match(support, /normalizeSpecialCategoryHandling/u);
  assert.match(support, /requiredCode:\s*'special_category_handling_required'/u);
  assert.match(evidence, /specialCategoryClassification/u);
  assert.match(evidence, /support_evidence_special_category_case_binding_required/u);
  assert.match(messages, /special_category/u);
  assert.match(moderation, /moderation_special_category_content_blocked/u);
  assert.match(migration, /specialCategoryHandling/u);
  assert.match(migration, /support_cases_intake_scope_evidence_shape_check/u);
  assert.match(exportSource, /special_category_handling/u);
  assert.match(exportSource, /special_category_classification/u);
  assert.match(ui, /Ist eine Person tatsächlich verletzt worden/u);
  assert.match(ui, /_productSafetyInjuryOccurred == true/u);
  assert.doesNotMatch(ui, /injuryOccurred:\s*_selectedSubCategory\s*==/u);
  const currentPackage = read('docs/current_work_package.md');
  assert.match(currentPackage, /empty `items`/u);
  assert.match(currentPackage, /latestAssistantMessageId/u);
  assert.match(currentPackage, /exact task-completion event/u);
});
