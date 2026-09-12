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

function constructorBlocks(text, token) {
  const blocks = [];
  let searchFrom = 0;
  while (true) {
    const tokenStart = text.indexOf(token, searchFrom);
    if (tokenStart < 0) return blocks;
    const open = text.indexOf('(', tokenStart + token.length);
    assert.notEqual(open, -1, `expected opening parenthesis after ${token}`);
    let depth = 0;
    let quote = null;
    let escaped = false;
    let close = -1;
    for (let index = open; index < text.length; index += 1) {
      const character = text[index];
      if (quote !== null) {
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
      } else if (character === '(') {
        depth += 1;
      } else if (character === ')') {
        depth -= 1;
        if (depth === 0) {
          close = index;
          break;
        }
      }
    }
    assert.notEqual(close, -1, `expected closing parenthesis after ${token}`);
    blocks.push(text.slice(tokenStart, close + 1));
    searchFrom = close + 1;
  }
}

const radioTiles = constructorBlocks(source, 'RadioListTile<');
const dropoffGroups = constructorBlocks(source, 'RadioGroup<_DropoffOption>');
const returnGroups = constructorBlocks(source, 'RadioGroup<_ReturnOption>');
const fallbackState = source.match(
  /class _ExpressFallbackSheetState[\s\S]*?\nextension on /u,
)?.[0];

assert.ok(fallbackState, 'expected express fallback State');

test('every item-details radio tile delegates ownership to RadioGroup', () => {
  assert.equal(radioTiles.length, 18);
  for (const tile of radioTiles) {
    assert.doesNotMatch(tile, /\bgroupValue\s*:/u);
    assert.doesNotMatch(tile, /\bonChanged\s*:/u);
  }
  assert.equal(dropoffGroups.length, 3);
  assert.equal(returnGroups.length, 3);
  assert.equal(source.match(/RadioGroup<bool>\(/gu)?.length, 1);
});

test('delivery groups retain selection persistence in both layouts', () => {
  const deliveryGroups = [...dropoffGroups, ...returnGroups]
    .filter((group) => group.includes('_persistDeliverySelection();'));
  assert.equal(deliveryGroups.length, 4);
  for (const group of deliveryGroups) {
    assert.match(group, /if \(value == null\) return;/u);
    assert.match(group, /setState\(\(\) => _(?:dropoff|returning) = value\);/u);
  }
});

test('unavailable landlord delivery choices stay explicitly disabled', () => {
  const disabledTiles = radioTiles.filter((tile) => /enabled:\s*false/u.test(tile));
  assert.equal(disabledTiles.length, 4);
  for (const tile of disabledTiles) {
    assert.match(tile, /value:\s*_(?:Dropoff|Return)Option\.landlord/u);
    assert.match(tile, /secondary:\s*Icon\(Icons\.lock_outline/u);
  }
});

test('fallback owns rebook, dropoff and return selection independently', () => {
  assert.match(
    fallbackState,
    /groupValue:\s*_rebook,[\s\S]*?onChanged:\s*\(value\)[\s\S]*?setState\(\(\) => _rebook = value\)/u,
  );
  assert.match(fallbackState, /RadioListTile<bool>\([\s\S]*?value:\s*true/u);
  assert.match(fallbackState, /RadioListTile<bool>\([\s\S]*?value:\s*false/u);
  assert.match(fallbackState, /RadioGroup<_DropoffOption>\([\s\S]*?groupValue:\s*_drop/u);
  assert.match(fallbackState, /RadioGroup<_ReturnOption>\([\s\S]*?groupValue:\s*_ret/u);
});

test('radio migration is permanent and adds no analyzer accommodation', () => {
  assert.match(
    regression,
    /node --test test\/tool\/item_details_radio_group_migration_wiring\.test\.mjs/u,
  );
  assert.doesNotMatch(source, /ignore:\s*deprecated_member_use/u);
});
