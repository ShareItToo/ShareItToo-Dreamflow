import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function section(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing section start: ${start}`);
  assert.notEqual(endIndex, -1, `missing section end: ${end}`);
  return source.slice(startIndex, endIndex);
}

const source = readFileSync(
  new URL('../../lib/services/data_service.dart', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('DataService cannot regain unreachable demo seed paths', () => {
  for (const name of [
    '_ensureDemoNotificationsForUserOnce',
    '_demoNotifSeedFlagPrefix',
    '_ensureDemoRentalRequests',
    '_buildDemoMessageThreadsForUser',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`, 'u'));
  }
  assert.doesNotMatch(source, /Category cat\(String id\)/u);
});

test('debug-only QA fixtures remain explicit and current-user bound', () => {
  assert.match(source, /static const bool _launchQaSeedingEnabled = true;/u);
  assert.match(source, /_qaMessagesAndNotifsSeedFlagPrefix/u);
  assert.match(
    source,
    /if \(userId\.isEmpty \|\| !kDebugMode \|\| !_launchQaSeedingEnabled\) return;/u,
  );
  assert.match(source, /if \(me == null \|\| me\.id != userId\) return;/u);
  assert.match(source, /applyQaFixturesForScreenAudit/u);
});

test('showcase reset retains category initialization without dead lookup', () => {
  const reset = section(
    source,
    'static Future<void> resetItemsAndSeedFive',
    'static Future<List<User>> getUsers()',
  );
  assert.match(reset, /if \(!_allowDemoSeedDataInRuntime\)/u);
  assert.match(reset, /await getCategories\(\);/u);
  assert.match(reset, /final users = await getUsers\(\);/u);
  assert.match(reset, /final five = _buildFiveShowcaseItems\(users\);/u);
});

test('real requests, express timeout and support paths remain intact', () => {
  assert.match(source, /static Future<List<RentalRequest>> _getAllRentalRequests\(\)/u);
  assert.match(source, /static Future<void> _sweepExpressTimeouts\(\)/u);
  assert.match(source, /static Future<void> _saveAllRentalRequests\(/u);
  assert.match(source, /static Future<String\?> _readMessageThreads\(/u);
  assert.match(source, /static Future<MessageThread\?> createSupportThread\(/u);
  assert.match(source, /canonical receipt required/u);
});

test('DataService ratchet is permanent and adds no analyzer accommodation', () => {
  assert.doesNotMatch(source, /ignore:\s*unused_(?:element|element_parameter|field)/u);
  assert.match(
    regression,
    /node --test test\/tool\/data_service_dead_demo_code_ratchet_wiring\.test\.mjs/u,
  );
});
