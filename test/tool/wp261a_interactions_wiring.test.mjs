import assert from 'node:assert/strict';
import fs from 'node:fs';

const overlay = fs.readFileSync('lib/widgets/item_details_overlay.dart', 'utf8');
const bookingDetail = fs.readFileSync('lib/screens/booking_detail_screen.dart', 'utf8');
const reviewSheet = fs.readFileSync('lib/widgets/review_prompt_sheet.dart', 'utf8');
const repository = fs.readFileSync('lib/services/backend_repository.dart', 'utf8');
const app = fs.readFileSync('backend/src/app.js', 'utf8');
const workflow = fs.readFileSync('backend/src/moderation_workflow.js', 'utf8');
const dataService = fs.readFileSync('lib/services/data_service.dart', 'utf8');

assert.match(overlay, /_loadEditingRequest\(\)/u);
assert.match(overlay, /DataService\.getRentalRequestById\(requestId\)/u);
assert.match(overlay, /DataService\.updateRentalRequestTimes\(/u);
assert.match(overlay, /final confirmed = await DataService\.getRentalRequestById\(editRequestId\)/u);
assert.match(overlay, /if \(isEditing\)[\s\S]*?Reservierung aktualisiert/u);
assert.match(bookingDetail, /editRequestId: editRequest && requestId\.isNotEmpty/u);
assert.match(bookingDetail, /value: 'amend'/u);
assert.match(bookingDetail, /_cancelBookingAndReadback\(/u);
assert.match(bookingDetail, /confirmed\.status != 'cancelled'/u);

assert.match(app, /createBookingReview\(client, \{[\s\S]*?idempotencyKey: req\.get\('Idempotency-Key'\)/u);
assert.match(workflow, /type: 'booking\.review'/u);
assert.match(workflow, /completeCommand\(client, commandKey, bookingId, response\)/u);
assert.match(workflow, /SELECT \* FROM reviews WHERE booking_id = \$1 AND reviewer_id = \$2/u);
assert.match(repository, /createBookingReview\([\s\S]*?required String idempotencyKey/u);
assert.match(repository, /additionalHeaders: \{'Idempotency-Key': idempotencyKey\}/u);
assert.match(reviewSheet, /late final String _idempotencyKey/u);
assert.match(reviewSheet, /idempotencyKey: _idempotencyKey/u);
assert.match(reviewSheet, /review\['id'\]/u);
assert.match(
  dataService,
  /if \(index < 0\) \{\s+throw StateError\(\s+'Die serverbestätigte Buchung wurde nicht gefunden; keine Statusänderung bestätigt\.'/u,
);
assert.match(
  dataService,
  /if \(index < 0\) \{\s+throw StateError\(\s+'Die serverbestätigte Buchung wurde nicht gefunden; keine Änderung bestätigt\.'/u,
);
assert.match(
  dataService,
  /if \(current\.status != 'pending'\) \{\s+throw StateError\(\s+'Die Buchung kann in ihrem aktuellen Status nicht geändert werden\.'/u,
);

console.log('WP261-A interaction wiring: PASS');
