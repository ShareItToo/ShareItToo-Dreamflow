import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('SUP-046 through SUP-048 use one server-authoritative audited reveal path', () => {
  const app = read('backend/src/app.js');
  const domain = read('backend/src/booking_address_reveal_domain.js');
  const workflow = read('backend/src/booking_address_reveal_workflow.js');
  const migration = read('backend/sql/migrations/061_booking_exact_address_reveal_guard.up.sql');
  const rollback = read('backend/sql/migrations/061_booking_exact_address_reveal_guard.down.sql');
  const repository = read('lib/services/backend_repository.dart');
  const dataService = read('lib/services/data_service.dart');
  const bookingsScreen = read('lib/screens/bookings_screen.dart');
  const bookingDetail = read('lib/screens/booking_detail_screen.dart');
  const messageThread = read('lib/screens/message_thread_screen.dart');

  assert.match(app, /\/v1\/bookings\/:id\/address-reveal/u);
  assert.match(app, /Cache-Control', 'private, no-store'/u);
  assert.match(domain, /6 \* 60 \* 60 \* 1000/u);
  assert.match(domain, /appointment_not_counterparty_confirmed/u);
  assert.match(domain, /safety_review_required/u);
  assert.match(workflow, /support_case\.safety_flag/u);
  assert.match(workflow, /booking\.exact_address_access_denied/u);
  assert.doesNotMatch(workflow, /metadata:[\s\S]{0,120}exactAddress/u);
  assert.match(migration, /audit_log_booking_address_access_guard/u);
  assert.match(migration, /NEW\.created_at < appointment_at - INTERVAL '6 hours'/u);
  assert.match(migration, /address.*locationText.*latitude.*longitude/su);
  assert.match(rollback, /cannot roll back booking address reveal guard while audit evidence exists/u);
  assert.match(repository, /getBookingAddressReveal/u);
  assert.match(dataService, /server_authority_unavailable/u);
  assert.match(dataService, /local_demo_or_qa_only/u);
  assert.match(bookingsScreen, /exactAddressRevealed/u);
  assert.match(bookingsScreen, /segment: addressSegment/u);
  assert.match(read('lib/screens/ongoing_owner_detail_screen.dart'), /segment: 'return'/u);
  assert.doesNotMatch(bookingDetail, /AddressPrivacy\.shouldRevealExactAddress/u);
  assert.match(messageThread, /Standortfreigabe noch gesperrt/u);
  assert.match(
    messageThread,
    /if \(visibility\['result'\] != 'revealed'\)[\s\S]*await AppPopup\.info\([\s\S]*Standortfreigabe noch gesperrt/u,
  );
  assert.doesNotMatch(
    messageThread,
    /if \(visibility\['result'\] != 'revealed'\)[\s\S]{0,240}AppPopup\.toast/u,
  );
  assert.match(
    messageThread,
    /final selection = await _showLocationFlowSheet<String>[\s\S]*pop\('share-only'\)[\s\S]*if \(!mounted \|\| selection == null\) return;[\s\S]*selection == 'share-only'[\s\S]*await _sharePreparedLocation\(data\)/u,
  );
  assert.doesNotMatch(
    messageThread,
    /onPressed: \(\) async \{\s*Navigator\.of\(sheetContext\)\.pop\(\);\s*await _sharePreparedLocation/u,
  );
});
