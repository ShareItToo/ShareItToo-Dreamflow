import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync('backend/src/app.js', 'utf8');
const domain = readFileSync('backend/src/support_message_domain.js', 'utf8');
const workflow = readFileSync('backend/src/support_message_workflow.js', 'utf8');
const supportCaseWorkflow = readFileSync('backend/src/support_case_workflow.js', 'utf8');
const privacyExport = readFileSync('backend/src/privacy_export.js', 'utf8');
const flutter = readFileSync('lib/screens/support_cases_screen.dart', 'utf8');
const migration = readFileSync(
  'backend/sql/migrations/038_support_message_template_guard.up.sql',
  'utf8',
);
const rollback = readFileSync(
  'backend/sql/migrations/038_support_message_template_guard.down.sql',
  'utf8',
);
const rawCatalog = readFileSync('backend/src/support_message_templates_v1.json', 'utf8');
const catalog = JSON.parse(rawCatalog);

test('Drive support packet catalog is exact, complete and fail closed', () => {
  assert.equal(
    createHash('sha256').update(rawCatalog.trimEnd()).digest('hex'),
    '947f307e7919eed543c28e36af4d2b364d87dcde52025649d0d4620d64baaaa5',
  );
  assert.equal(catalog.packet_version, 'SIT_SUPPORT_PACKET_V1_2026-08-20');
  assert.equal(catalog.templates.length, 55);
  assert.equal(catalog.rules.unresolved_placeholders_block_send, true);
  assert.equal(catalog.rules.store_rendered_text_and_template_version, true);
  assert.equal(catalog.rules.no_sensitive_content_in_push, true);
  assert.equal(catalog.rules.red_templates_never_auto_send, true);
  assert.match(domain, /support_message_template_source_hash_mismatch/u);
  assert.match(domain, /support_message_placeholder_unresolved/u);
  assert.match(domain, /support_message_server_binding_mismatch/u);
  assert.match(domain, /timeZone: 'Europe\/Berlin'/u);
});

test('routes preserve role separation, bounded limits and authenticated in-app publication', () => {
  assert.match(
    app,
    /app\.post\('\/v1\/admin\/support\/cases\/:id\/messages', requireAuth, requireActiveAccount, requireStaffElevation, supportMessageDraftLimiter/u,
  );
  assert.match(
    app,
    /app\.post\('\/v1\/admin\/support\/cases\/:id\/messages\/:messageId\/review', requireAuth, requireActiveAccount, requireAdminRole, requireStaffElevation, supportMessageReviewLimiter/u,
  );
  assert.match(
    app,
    /app\.post\('\/v1\/admin\/support\/cases\/:id\/messages\/:messageId\/publication', requireAuth, requireActiveAccount, requireStaffElevation, supportMessagePublishLimiter/u,
  );
  assert.match(app, /const supportMessageDraftLimiter = rateLimit\([^;]+limit: 20/u);
  assert.match(app, /const supportMessageReviewLimiter = rateLimit\([^;]+limit: 20/u);
  assert.match(app, /const supportMessagePublishLimiter = rateLimit\([^;]+limit: 20/u);
  assert.match(workflow, /support_message_self_review_forbidden/u);
  assert.match(workflow, /support_message_live_delivery_forbidden/u);
  assert.match(workflow, /delivery_status = 'in_app_recorded'/u);
  assert.match(workflow, /externalMessageSent: false/u);
  assert.doesNotMatch(
    workflow,
    /sendEmail|sendPush|publishTo|paymentProvider|refundPayment|releasePayout|fetch\(/u,
  );
});

test('database binds immutable rendered truth, independent review and append-only corrections', () => {
  assert.match(migration, /rendered_content_sha256 <> encode\(digest\(NEW\.rendered_content, 'sha256'\), 'hex'\)/u);
  assert.match(migration, /Support message recipient is outside the case/u);
  assert.match(migration, /Support message review requires independent active admin/u);
  assert.match(migration, /approval_payload_sha256 = rendered_content_sha256/u);
  assert.match(migration, /CHECK \(notification_ids = '\{\}'\)/u);
  assert.match(migration, /Support message payload is immutable/u);
  assert.match(migration, /Support message history is append-only/u);
  assert.match(migration, /corrects_message_id UUID REFERENCES support_messages\(id\) ON DELETE RESTRICT/u);
  assert.match(rollback, /IF EXISTS \(SELECT 1 FROM support_messages\)/u);
});

test('user projection exposes only sent recipient messages and renders them fail closed', () => {
  assert.match(
    supportCaseWorkflow,
    /recipient_user_id = \$3 AND send_status = 'sent'/u,
  );
  assert.match(supportCaseWorkflow, /shapeSupportMessage\(row, \{ staff \}\)/u);
  assert.match(privacyExport, /message\.recipient_user_id = \$1 AND message\.send_status = 'sent'/u);
  assert.match(flutter, /class SupportMessageViewData/u);
  assert.match(flutter, /content\.contains\(RegExp\(r'\\\{\\\{\[a-z0-9_\]\+\\\}\\\}'\)\)/u);
  assert.match(flutter, /value\['externalMessageSent'\] != false/u);
  assert.match(flutter, /key: ValueKey\('support_message_\$\{message\.id\}'\)/u);
});
