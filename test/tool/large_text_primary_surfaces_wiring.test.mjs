import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const wishlists = await readFile('lib/screens/wishlists_screen.dart', 'utf8');
const mosaic = await readFile('lib/widgets/wishlist_mosaic_card.dart', 'utf8');
const profile = await readFile('lib/widgets/profile_header_card.dart', 'utf8');

test('wishlist grid switches to one column for large text', () => {
  assert.match(wishlists, /textScale >= 1\.6 \? 1 : 2/u);
  assert.match(wishlists, /crossAxisCount: columnCount/u);
  assert.match(
    wishlists,
    /_mosaicChildAspectRatio\(context, columnCount: columnCount\)/u,
  );
});

test('wishlist card grants a second title line for large text', () => {
  assert.match(mosaic, /final largeText = MediaQuery\.textScalerOf\(context\)\.scale\(1\) >= 1\.6/u);
  assert.match(mosaic, /maxLines: largeText \? 2 : 1/u);
});

test('profile header stacks identity and metrics for large text', () => {
  assert.match(profile, /final largeText = MediaQuery\.textScalerOf\(context\)\.scale\(1\) >= 1\.6/u);
  assert.match(profile, /child: largeText\s+\? Column/u);
  assert.match(profile, /class _IdentitySummary extends StatelessWidget/u);
  assert.match(profile, /class _ProfileMetrics extends StatelessWidget/u);
});

test('large profile metric values are not ellipsized', () => {
  const branch = profile.slice(
    profile.indexOf('if (largeText) {', profile.indexOf('class _MetricLine')),
    profile.indexOf('// Keep the value close', profile.indexOf('class _MetricLine')),
  );
  assert.match(branch, /Text\(label, style: labelStyle\)/u);
  assert.match(branch, /Text\(value, style: valueStyle\)/u);
  assert.doesNotMatch(branch, /TextOverflow\.ellipsis/u);
});
