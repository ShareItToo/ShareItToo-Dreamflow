import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/message_thread_screen.dart', import.meta.url),
  'utf8',
);

function section(start, end) {
  const value = source.match(new RegExp(`${start}[\\s\\S]*?${end}`, 'u'))?.[0];
  assert.ok(value, `expected message-thread section: ${start}`);
  return value;
}

const primaryAction = section('Future<void> _applyPrimaryAction', '\\n  Future<void> _applySecondaryAction');
const bookingNavigation = section('Future<void> _navigateToBookingDetail', '\\n  bool _isViewerOwnerFor');
const timeProposal = section('Future<void> _handleTimeProposal', '\\n  /// Übergabezeit vorschlagen');
const profileNavigation = section('Future<void> _viewProfile', '\\n  Future<void> _toggleMuteNotifications');

test('owner acceptance uses the owning State lifecycle after declarations', () => {
  assert.match(
    primaryAction,
    /final declarations = await showPrivatePilotOwnerAcceptanceDialog\([\s\S]*?if \(declarations == null\) return;\s+if \(!mounted\) return;\s+final accepted = await commitPrivatePilotOwnerAcceptance\(\s+context,/u,
  );
  assert.doesNotMatch(primaryAction, /if \(!context\.mounted\) return;/u);
});

test('booking hydration rechecks lifecycle before empty and owner destinations', () => {
  assert.match(
    bookingNavigation,
    /final owner =\s+req != null \? await DataService\.getUserById\(req\.ownerId\) : null;\s+if \(!mounted\) return;\s+final viewerIsOwner/u,
  );
  assert.match(
    bookingNavigation,
    /if \(resolvedReq == null\) \{\s+AppPopup\.toast\(\s+context,[\s\S]*?if \(viewerIsOwner\) \{\s+await Navigator\.of\(context\)\.push/u,
  );
});

test('renter booking navigation rechecks lifecycle after delivery lookup', () => {
  assert.match(
    bookingNavigation,
    /final deliverySel = item != null\s+\? await DataService\.getSavedDeliverySelection\(item\.id\)\s+: null;\s+if \(!mounted\) return;[\s\S]*?await Navigator\.of\(context\)\.push/u,
  );
});

test('time proposal rechecks lifecycle after flow-state lookup', () => {
  assert.match(
    timeProposal,
    /final state = await DataService\.getHandoverReturnState\(req\.id\);\s+if \(!mounted\) return;[\s\S]*?final picked = await SitGlassTimePicker\.show\(\s+context,/u,
  );
});

test('profile navigation rechecks lifecycle before both result branches', () => {
  assert.match(
    profileNavigation,
    /final otherId = await _resolveOtherPartyUserId\(\);\s+if \(!mounted\) return;\s+if \(otherId == null\) \{\s+AppPopup\.toast\(\s+context,[\s\S]*?Navigator\.of\(context\)\.push/u,
  );
});

test('message-thread lifecycle fix contains no timing or lint accommodation', () => {
  for (const value of [primaryAction, bookingNavigation, timeProposal, profileNavigation]) {
    assert.doesNotMatch(value, /ignore:\s*use_build_context_synchronously/u);
    assert.doesNotMatch(value, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
  }
});
