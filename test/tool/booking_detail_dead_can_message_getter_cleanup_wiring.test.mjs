import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const bookingDetail = readFileSync(
  new URL('../../lib/screens/booking_detail_screen.dart', import.meta.url),
  'utf8',
);

function sectionBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const buildSection = sectionBetween(
  bookingDetail,
  'Widget build(BuildContext context) {',
  'Widget _buildOngoingBody(',
);
const ongoingBody = sectionBetween(
  bookingDetail,
  'Widget _buildOngoingBody(',
  'Widget _buildDefaultBody(',
);
const defaultBody = sectionBetween(
  bookingDetail,
  'Widget _buildDefaultBody(',
  'Color _statusColor(',
);

test('booking detail cannot regain the obsolete can-message getter', () => {
  assert.doesNotMatch(bookingDetail, /\b_canMessage\b/);
});

test('ongoing details keep their effective-state message gate and thread route', () => {
  const onMessage = sectionBetween(
    ongoingBody,
    'onMessage: (() {',
    '// Locations moved out of the info card in all sections',
  );
  assert.match(onMessage, /final eff = _effectiveCategory\(start: s, end: e\)/);
  assert.match(
    onMessage,
    /if \(eff == 'pending' \|\|\s+widget\.booking\['needsReview'\] == true \|\|\s+eff == 'completed'\) \{\s+return null;\s+\}/,
  );
  assert.match(onMessage, /builder: \(_\) => MessageThreadScreen\(/);
  assert.match(onMessage, /requestId: reqId\.isNotEmpty \? reqId : null/);
  assert.match(onMessage, /participantName: _listerName/);
});

test('default details keep their booking-state message gate and thread route', () => {
  const onMessage = sectionBetween(
    defaultBody,
    'onMessage: (isPending ||',
    '// Locations moved out of the info card for all sections',
  );
  assert.match(
    onMessage,
    /onMessage: \(isPending \|\|\s+widget\.booking\['needsReview'\] == true \|\|\s+_isCompletedState\)\s+\? null\s+: \(\) \{/,
  );
  assert.match(onMessage, /builder: \(_\) => MessageThreadScreen\(/);
  assert.match(onMessage, /requestId: reqId\.isNotEmpty \? reqId : null/);
  assert.match(onMessage, /participantName: _listerName/);
});

test('counterparty row keeps the nullable message action and chat button', () => {
  const modernDetails = sectionBetween(
    bookingDetail,
    'class _ModernDetailsCard extends StatelessWidget',
    'class _InfoRowModern extends StatelessWidget',
  );
  assert.match(modernDetails, /if \(counterpartyName\.isNotEmpty\)/);
  assert.equal(
    [...modernDetails.matchAll(/onMessage: onMessage/g)].length,
    2,
  );

  const counterparty = sectionBetween(
    bookingDetail,
    'class _CounterpartyInlineRow extends StatelessWidget',
    'class _AmountRow extends StatelessWidget',
  );
  assert.match(counterparty, /final VoidCallback\? onMessage/);
  assert.match(counterparty, /if \(onMessage != null\)/);
  assert.match(counterparty, /IconButton\(/);
  assert.match(counterparty, /tooltip: 'Nachricht schreiben'/);
  assert.match(counterparty, /onPressed: onMessage/);
  assert.match(counterparty, /Icons\.chat_bubble_outline/);
});

test('support menu issue action keeps the support flow and support thread route', () => {
  const menu = sectionBetween(
    buildSection,
    'final opts = <SitMenuOption<String>>[',
    'final picked = await showSITOverflowMenu<String>',
  );
  assert.match(menu, /label: 'Problem melden'/);
  assert.match(menu, /value: 'issue'/);

  const issueAction = sectionBetween(
    buildSection,
    "case 'issue':",
    "case 'payment':",
  );
  assert.match(issueAction, /await _openSupportFlow\(/);
  assert.match(issueAction, /requestId: requestId/);
  assert.match(issueAction, /itemTitle: title/);

  const supportFlow = sectionBetween(
    bookingDetail,
    'Future<void> _openSupportFlow(',
    'Future<void> _manageBookingTime(',
  );
  assert.match(supportFlow, /SupportFlowContext\.fromBookingDetail\(/);
  assert.match(supportFlow, /builder: \(_\) => SupportFlowScreen\(/);
  assert.match(supportFlow, /DataService\.createSupportThread\(/);
  assert.match(supportFlow, /DataService\.addSystemMessageToThread\(/);
  assert.match(supportFlow, /builder: \(_\) => MessageThreadScreen\(/);
  assert.match(supportFlow, /threadId: supportThread\.id/);
  assert.match(supportFlow, /participantName: 'SIT Support'/);
});

test('pickup and return CTAs keep their confirmed-time guards', () => {
  assert.match(
    defaultBody,
    /if \(!await _timeConfirmedForStart\(isReturn: false\)\) return;\s+await _startPickupFlow\(\);/,
  );
  assert.match(defaultBody, /label: const Text\('Übergabe starten'\)/);
  assert.match(
    ongoingBody,
    /if \(!await _timeConfirmedForStart\(isReturn: true\)\) return;\s+await _startOwnerReturnFlow\(\);/,
  );
  assert.match(
    ongoingBody,
    /isOverdue \? 'Rückgabe jetzt starten' : 'Rückgabe starten'/,
  );
});

test('upcoming cancellation remains renter-bound in its canonical action', () => {
  const menu = sectionBetween(
    buildSection,
    'final opts = <SitMenuOption<String>>[',
    'final picked = await showSITOverflowMenu<String>',
  );
  assert.match(
    menu,
    /if \(effective == 'upcoming'\)[\s\S]*?label: 'Stornieren'[\s\S]*?value: 'cancel'/,
  );
  const cancelCase = sectionBetween(
    buildSection,
    "case 'cancel':",
    "case 'withdraw':",
  );
  assert.match(cancelCase, /await _confirmCancelUpcoming\(\)/);

  const cancellation = sectionBetween(
    bookingDetail,
    'Future<void> _confirmCancelUpcoming() async',
    'Future<void> _confirmWithdrawPending() async',
  );
  assert.match(cancellation, /title: 'Buchung stornieren\?'/);
  assert.match(
    cancellation,
    /DataService\.updateRentalRequestStatusWithActor\(/,
  );
  assert.match(cancellation, /status: 'cancelled'/);
  assert.match(cancellation, /cancelledBy: 'renter'/);
  assert.match(cancellation, /title: 'Buchung storniert'/);
});

test('completed renter review keeps its eligibility guard and direction', () => {
  const bottomActions = sectionBetween(
    buildSection,
    '// Bottom actions',
    'body: SafeArea(',
  );
  assert.match(
    bottomActions,
    /final isTrulyCompleted = effective == 'completed' &&\s+!statusLc\.contains\('storniert'\) &&\s+!statusLc\.contains\('abgelehnt'\);/,
  );
  assert.match(
    bottomActions,
    /final isRenterView = !_isViewerOwnerSync\(\);/,
  );
  assert.match(
    bottomActions,
    /final isHeldForReview = widget\.booking\['needsReview'\] == true;/,
  );
  assert.match(
    bottomActions,
    /if \(isTrulyCompleted && isRenterView && !isHeldForReview\)/,
  );
  assert.match(bottomActions, /_reviewAlreadySubmitted\s+\? null/);
  assert.match(bottomActions, /ReviewPromptSheet\.show\(/);
  assert.match(bottomActions, /reviewerId: current\.id/);
  assert.match(bottomActions, /reviewedUserId: listerId/);
  assert.match(bottomActions, /direction: 'renter_to_owner'/);
  assert.match(
    bottomActions,
    /_reviewAlreadySubmitted \? 'Bewertung abgegeben' : 'Bewerten'/,
  );
});
