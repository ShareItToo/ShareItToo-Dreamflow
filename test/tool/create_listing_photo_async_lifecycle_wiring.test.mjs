import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../lib/screens/create_listing_screen.dart', import.meta.url),
  'utf8',
);
const pickedThumb = source.match(
  /class _PickedThumb[\s\S]*?\n\}\n\n\/\/ ---------- Simple Accordion/u,
)?.[0];
const cameraPicker = source.match(
  /Future<void> _pickFromCamera\(ListingMutationActionOwner owner\)[\s\S]*?(?=\n  Future<void> _pickFromGallery\()/u,
)?.[0];

assert.ok(pickedThumb, 'expected the picked-photo thumbnail widget');
assert.ok(cameraPicker, 'expected the camera picker method');

test('picked-photo preview rechecks its context after asynchronous file access', () => {
  assert.match(
    pickedThumb,
    /class _PickedThumb[\s\S]*?final bytes = await file\.readAsBytes\(\);\s+if \(!context\.mounted\) return;\s+showDialog\(\s+context: context,/u,
  );
});

test('photo-preview lifecycle fix contains no timing or lint accommodation', () => {
  assert.doesNotMatch(pickedThumb, /ignore:\s*use_build_context_synchronously/u);
  assert.doesNotMatch(pickedThumb, /Future(?:<void>)?\.delayed|Timer\s*\(/u);
});

test('camera and gallery failures stay visible without silently switching sources', () => {
  assert.match(
    source,
    /Future<void> _pickFromCamera\(ListingMutationActionOwner owner\)[\s\S]*_listingActions\.isCurrent[\s\S]*catch \(_\)[\s\S]*_photoAccessError =\s*'Die Kamera ist nicht verfügbar/u,
  );
  assert.match(
    source,
    /Future<void> _pickFromGallery\(ListingMutationActionOwner owner\)[\s\S]*_listingActions\.isCurrent[\s\S]*catch \(_\)[\s\S]*_photoAccessError =\s*'Auf Fotos kann gerade nicht zugegriffen werden/u,
  );
  assert.match(
    source,
    /if \(_photoAccessError case final error\?\)[\s\S]*Semantics\(\s*liveRegion: true,\s*label: error,/u,
  );
  assert.doesNotMatch(cameraPicker, /_pickFromGallery\(/u);
});
