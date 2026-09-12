import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const privacyExport = readFileSync(new URL('../src/privacy_export.js', import.meta.url), 'utf8');
const retention = readFileSync(new URL('../src/retention_inventory.js', import.meta.url), 'utf8');

test('C1H private and moderation state is included in the user export', () => {
  for (const marker of [
    'private_use_confirmed_at',
    'private_marketplace_review_status',
    'private_pilot_region_code',
    'privateMarketplaceReviewEvents',
    'accountSuspensionProposals',
    'moderationDecisions',
    'moderationReviewRequests',
    'WHERE decision.recipient_user_id = $1',
    'WHERE request.requester_id = $1',
  ]) assert.match(privacyExport, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
});

test('C1H moderation and professional-review evidence is retention-inventoried', () => {
  for (const dataset of [
    'private_marketplace_review_events',
    'moderation_decisions',
    'moderation_account_suspension_proposals',
    'moderation_review_requests',
    'moderation_review_events',
    'moderation_review_resolutions',
    'compliance_reserve_attestations',
    'compliance_professional_review_incidents',
  ]) assert.match(retention, new RegExp(`'${dataset}'`, 'u'));
  assert.match(retention, /retentionPeriodsApplied: false/u);
  assert.match(retention, /eligibleRowsCalculated: false/u);
});
