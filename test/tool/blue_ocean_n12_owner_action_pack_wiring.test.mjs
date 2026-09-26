import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), 'utf8');
}

const pack = read('docs/operations/BLUE_OCEAN_OWNER_ACTION_PACK.md');
const evidence = JSON.parse(read(
  'docs/evidence/blue-ocean/n12-owner-action-pack-20260824.json',
));

test('N12 owner pack has exactly six ordered action sections', () => {
  let previous = -1;
  for (const section of evidence.sections) {
    const index = pack.indexOf(`## ${section}`);
    assert.ok(index > previous, `missing or unordered section: ${section}`);
    previous = index;
  }
  assert.equal(evidence.sections.length, 6);
});

test('N12 covers private operator values without storing their values', () => {
  assert.match(pack, /SIT_OPERATOR_LEGAL_NAME/u);
  assert.match(pack, /SIT_OPERATOR_POSTAL_ADDRESS/u);
  assert.match(pack, /SIT_OPERATOR_CONTACT_EMAIL/u);
  assert.match(pack, /never their values/u);
});

test('N12 keeps OpenAI key and billing behind owner and budget gates', () => {
  assert.match(pack, /OpenAI API project\/key\/billing/u);
  assert.match(pack, /backend-\n  only key/u);
  assert.match(pack, /no project, key, billing or provider call was created/u);
});

test('N12 binds exactly the six authoritative top-level reply tokens', () => {
  const expected = [
    'AI_LISTING_PILOT_BUDGET_5_EUR_GO',
    'AI_LISTING_PROVIDER_HOLD',
    'GOOGLE_PLAY_INTERNAL_UPLOAD_GO',
    'GOOGLE_PLAY_INTERNAL_HOLD',
    'HEILBRONN_WAVE0_ACTIVATION_GO',
    'HEILBRONN_WAVE0_HOLD',
  ];
  assert.deepEqual(evidence.preparedReplyTokens, expected);
  for (const token of expected) assert.match(pack, new RegExp(token, 'u'));
});

test('N12 covers Play owner login, tester emails and physical Pixel work', () => {
  assert.match(pack, /Google Play Console with passkey\/2FA/u);
  assert.match(pack, /Tester Google emails/u);
  assert.match(pack, /Pixel 7 Pro/u);
  assert.match(pack, /no new mobile-data requirement/iu);
});

test('N12 defers Firebase, roles, Apple, scanner and PSP truthfully', () => {
  for (const marker of [
    'Firebase/Google Cloud owner checks',
    'Real roles and delegates',
    'DEFERRED_NOT_REQUIRED_FOR_STAGE_A',
    'Support scanner/upload: OFF',
    'PSP/KYC/real money: OFF',
  ]) assert.match(pack, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
});

test('N12 keeps authentic economics later and current profitability undetermined', () => {
  assert.match(pack, /Configured zero and synthetic pilot output never count/u);
  assert.match(pack, /Current profitability remains undetermined/u);
});

test('N12 contains no real email, home path or secret-shaped value', () => {
  const serialized = `${pack}\n${JSON.stringify(evidence)}`;
  assert.doesNotMatch(serialized, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/u);
  assert.doesNotMatch(serialized, /\/Users\//u);
  assert.doesNotMatch(serialized, /\bsk-[A-Za-z0-9]/u);
});
