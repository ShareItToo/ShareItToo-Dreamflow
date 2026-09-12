import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/widgets/item_details_overlay.dart', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);
const sheetState = source.match(
  /class _ItemDetailsSheetState[\s\S]*?\nclass _/u,
)?.[0];
const pageOverflow = source.match(
  /onPressed: \(\) async \{\s+final scope = widget.savedCartScope;[\s\S]*?await showSITOverflowMenu<String>[\s\S]*?(?=\n      body: SafeArea)/u,
)?.[0];
const pageState = source.slice(source.indexOf('class _ItemDetailsPageState'));
const pageShare = pageState.match(/Future<void> _share\(\) async \{[\s\S]*?(?=\n  Widget _availabilityLabel)/u)?.[0];
const pageNotice = pageState.match(/Future<void> _savedNotice\([\s\S]*?(?=\n  Future<void> _toggleWishlistFromMenu)/u)?.[0];
const countdown = source.match(
  /void _onTick\(Duration elapsed\) async \{[\s\S]*?\n  \}/u,
)?.[0];
const fallbackState = source.match(
  /class _ExpressFallbackSheetState[\s\S]*?\nextension on /u,
)?.[0];
const fallbackAction = fallbackState?.match(
  /onPressed: \(\) async \{[\s\S]*?\n\s+\},/u,
)?.[0];

assert.ok(sheetState, 'expected item-details sheet State');
assert.ok(pageOverflow, 'expected item-details overflow action');
assert.ok(pageShare, 'expected owner-bound share helper');
assert.ok(pageNotice, 'expected owner-bound notice helper');
assert.ok(countdown, 'expected express countdown callback');
assert.ok(fallbackAction, 'expected express fallback action');

test('sheet share and range selection recheck their owning State', () => {
  assert.match(
    sheetState,
    /catch \(e\) \{\s+f\.debugPrint\('\[share\] failed: \$e'\);\s+if \(!mounted\) return;\s+await AppPopup\.toast\(context,/u,
  );
  assert.match(
    sheetState,
    /getUnavailableRangesForItem\(widget\.item\.id\);\s+if \(!mounted\) return;[\s\S]*?final picked = await Navigator\.of\(context\)\.push<DateTimeRange>[\s\S]*?\);\s+if \(!mounted\) return;\s+if \(picked != null\)/u,
  );
});

test('sheet wishlist management proves lifecycle after every dialog and write', () => {
  assert.match(
    sheetState,
    /showManageOptions\(context\);\s+if \(!mounted\) return;\s+if \(choice == 'move'\)[\s\S]*?showMove\(context,[\s\S]*?\);\s+if \(!mounted\) return;/u,
  );
  assert.match(
    sheetState,
    /setItemWishlist\(widget\.item\.id, sel\);\s+if \(!mounted\) return;\s+setState\(\(\) => _wishlistId = sel\)/u,
  );
  assert.match(
    sheetState,
    /removeItemFromWishlist\(widget\.item\.id\);\s+if \(!mounted\) return;\s+setState\(\(\) => _wishlistId = null\)/u,
  );
});

test('listing overflow proves its exact build context in every async branch', () => {
  assert.match(
    pageOverflow,
    /if \(!await _stillCurrent\(scope\) \|\|\s*!context\.mounted \|\|\s*choice == null\) \{\s*return;\s*\}\s+switch \(choice\)/u,
  );
  assert.match(
    pageOverflow,
    /case 'share':\s*await _share\(\);\s*break;/u,
  );
  assert.match(
    pageOverflow,
    /getCurrentUser\(\);\s+if \(current == null \|\| !context\.mounted\) break;[\s\S]*?if \(result == null \|\| !context\.mounted\) break;[\s\S]*?addSystemMessageToThread[\s\S]*?if \(!context\.mounted\) break;\s+await Navigator\.of\(context\)\.push/u,
  );
});

function assertOwnedShare(share, notice) {
  assert.match(share, /final scope = widget.savedCartScope;\s*try \{\s*if \(!await _stillCurrent\(scope\)\) return;\s*await Clipboard.setData/u);
  assert.match(share, /await Clipboard.setData\([\s\S]*?await _savedNotice\(scope,[\s\S]*?title: 'Link kopiert'/u);
  assert.match(share, /catch \(e\)[\s\S]*?await _savedNotice\(scope,[\s\S]*?title: 'Teilen fehlgeschlagen'/u);
  assert.match(notice, /if \(!await _stillCurrent\(scope\) \|\| !mounted\) return;/u);
  assert.match(notice, /if \(scope != null\) \{\s*await scope.notice\(context/u);
}

test('shared clipboard helper preserves owner checks and rejects missing links', () => {
  assertOwnedShare(pageShare, pageNotice);
  for (const [before, after, target] of [
    ['final scope = widget.savedCartScope;', 'final scope = null;', 'share'],
    ['if (!await _stillCurrent(scope)) return;', '', 'share'],
    ['await Clipboard.setData', 'Clipboard.setData', 'share'],
    ['await _savedNotice(scope,', 'await AppPopup.toast(context,', 'share'],
    ['if (!await _stillCurrent(scope) || !mounted) return;', '', 'notice'],
    ['await scope.notice(context', 'await AppPopup.toast(context', 'notice'],
  ]) {
    const original = target === 'share' ? pageShare : pageNotice;
    assert.ok(original.includes(before));
    const changed = original.replaceAll(before, after);
    assert.throws(() => assertOwnedShare(target === 'share' ? changed : pageShare, target === 'notice' ? changed : pageNotice));
  }
});

test('express feedback proves its owning or exact callback context', () => {
  assert.match(
    countdown,
    /await AppPopup\.toast\(context,[\s\S]*?if \(!mounted\) return;\s+Navigator\.of\(context\)\.maybePop\(\);/u,
  );
  assert.match(
    fallbackAction,
    /if \(context\.mounted\) \{\s+Navigator\.of\(context\)\.maybePop\(\);\s+\}/u,
  );
});

test('secondary context fixes are permanent and add no accommodation', () => {
  assert.match(
    regression,
    /node --test test\/tool\/item_details_secondary_async_context_wiring\.test\.mjs/u,
  );
  for (const value of [sheetState, pageOverflow, pageShare, pageNotice, countdown, fallbackAction]) {
    assert.doesNotMatch(value, /ignore:\s*use_build_context_synchronously/u);
    assert.doesNotMatch(value, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
  }
});
