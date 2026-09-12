import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const developerPreview = readFileSync(
  new URL('../../lib/screens/developer_preview_screen.dart', import.meta.url),
  'utf8',
);
const platformWithdrawal = readFileSync(
  new URL('../../lib/screens/platform_withdrawal_screen.dart', import.meta.url),
  'utf8',
);

test('developer preview owns user-state selection through RadioGroup', () => {
  assert.match(
    developerPreview,
    /RadioGroup<DeveloperUserState>\([\s\S]*?groupValue: ctrl\.state,[\s\S]*?onChanged: \(v\) async/,
  );
  assert.doesNotMatch(
    developerPreview,
    /RadioListTile<DeveloperUserState>\([\s\S]{0,180}?groupValue:/,
  );
});

test('platform withdrawal owns booking selection through RadioGroup', () => {
  assert.match(
    platformWithdrawal,
    /RadioGroup<RentalRequest>\([\s\S]*?groupValue: _selected,[\s\S]*?onChanged: \(value\) => setState\(\(\) => _selected = value\)/,
  );
  assert.doesNotMatch(
    platformWithdrawal,
    /RadioListTile<RentalRequest>\([\s\S]{0,180}?groupValue:/,
  );
});
