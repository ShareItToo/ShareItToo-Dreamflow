import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const listing = readFileSync(
  new URL('../../lib/screens/create_listing_screen.dart', import.meta.url),
  'utf8',
);
const search = readFileSync(
  new URL('../../lib/widgets/search_overlay.dart', import.meta.url),
  'utf8',
);
const app = readFileSync(
  new URL('../../backend/src/app.js', import.meta.url),
  'utf8',
);

test('automatic listing paths stay local while price recalculation is explicit', () => {
  const schedule = listing.slice(
    listing.indexOf('void _schedulePriceRecalc'),
    listing.indexOf('Future<void> _calculatePriceSuggestion'),
  );
  assert.match(schedule, /_calculateLocalPriceOrientation\(\)/u);
  assert.doesNotMatch(schedule, /_calculatePriceSuggestion\(\)/u);
  assert.match(listing, /onRecalculate: _calculatePriceSuggestion/u);
  assert.match(listing, /busy: _priceSuggestionBusy/u);
  assert.match(listing, /label: Text\(busy \? 'Berechnung läuft…' : 'Neu berechnen'/u);
});

test('smart search parses only on explicit submit/button and uses a busy guard', () => {
  const input = search.slice(search.indexOf('TextField(\n                controller: _aiCtrl'));
  const end = input.indexOf('const SizedBox(height: 10)');
  const smartField = input.slice(0, end);
  const onChangedBlock = /onChanged:\s*\(v\)\s*\{[\s\S]*?\n\s*\},\s*\n\s*onSubmitted/u.exec(smartField)?.[0] ?? '';
  assert.doesNotMatch(onChangedBlock, /_parseAIPrompt/u);
  assert.match(smartField, /onSubmitted:[\s\S]*_parseAIPrompt/u);
  assert.match(smartField, /Suchen und übernehmen/u);
  assert.match(search, /_parsingSmartSearch\)/u);
});

test('server owner route is typed, authenticated and error-preserving', () => {
  assert.match(app, /app\.post\('\/v1\/listing-ai\/assist\/owner'/u);
  assert.match(app, /requireAuth, requireActiveAccount, requireUnsuspendedScope\('listing'\)/u);
  assert.match(app, /error instanceof ListingAiAssistError/u);
  assert.match(app, /Cache-Control', 'private, no-store'/u);
});
