import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  privatePilotAllowedCategoryIds,
  privatePilotAllowedSubcategories,
} from '../../backend/src/private_pilot_domain.js';

const config = readFileSync(
  new URL('../../lib/config/private_pilot_config.dart', import.meta.url),
  'utf8',
);
const backendApp = readFileSync(
  new URL('../../backend/src/app.js', import.meta.url),
  'utf8',
);

function dartBlock(startMarker) {
  const start = config.indexOf(startMarker);
  assert.ok(start >= 0, `missing Dart contract ${startMarker}`);
  const end = config.indexOf('\n  };', start);
  assert.ok(end > start, `unterminated Dart contract ${startMarker}`);
  return config.slice(start, end);
}

function dartCategoryIds() {
  return [...dartBlock('static const Set<String> allowedCategoryIds = {')
    .matchAll(/'([^']+)'/gu)].map((match) => match[1]).sort();
}

function dartSubcategories() {
  const entries = [...dartBlock(
    'static const Map<String, Set<String>> allowedSubcategories = {',
  ).matchAll(/'([^']+)':\s*\{([^{}]*)\}/gsu)];
  return Object.fromEntries(entries.map(([, categoryId, body]) => [
    categoryId,
    [...body.matchAll(/'([^']+)'/gu)]
      .map((match) => match[1])
      .sort(),
  ]));
}

test('client and backend private-pilot category/subcategory allowlists match exactly', () => {
  const clientIds = dartCategoryIds();
  const serverIds = [...privatePilotAllowedCategoryIds].sort();
  assert.deepEqual(clientIds, serverIds);

  const client = dartSubcategories();
  const server = Object.fromEntries(Object.entries(privatePilotAllowedSubcategories)
    .map(([categoryId, subcategories]) => [categoryId, [...subcategories].sort()]));
  assert.deepEqual(client, server);
  assert.deepEqual(Object.keys(client).sort(), clientIds);

  for (const [categoryId, subcategories] of Object.entries(client)) {
    assert.equal(subcategories.filter((entry) => entry === 'Sonstiges').length, 1,
      `${categoryId} must expose exactly one Sonstiges value`);
  }
});

test('private-pilot backend search indexes and filters the persisted subcategory', () => {
  const searchFilterStart = backendApp.indexOf('if (search.q) {');
  const categoryFilterStart = backendApp.indexOf(
    "if (search.categories.length > 0)",
    searchFilterStart,
  );
  assert.ok(searchFilterStart >= 0 && categoryFilterStart > searchFilterStart);
  const searchFilter = backendApp.slice(searchFilterStart, categoryFilterStart);
  assert.match(searchFilter, /coalesce\(listing\.subcategory, ''\)/u);
  const pairFilterStart = backendApp.lastIndexOf(
    'concat(listing.category_id',
    searchFilterStart,
  );
  assert.ok(pairFilterStart >= 0 && pairFilterStart < searchFilterStart);
  assert.match(
    backendApp.slice(pairFilterStart, pairFilterStart + 300),
    /listing\.subcategory\)[\s\S]{0,120}privatePilotAllowedCatalogKeys/u,
    'private-pilot search results must remain limited to allowed exact pairs',
  );
});
