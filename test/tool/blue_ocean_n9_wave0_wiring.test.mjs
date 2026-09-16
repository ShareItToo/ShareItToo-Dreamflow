import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const read = (path) => readFileSync(resolve(root, path), 'utf8');

test('N9 default-off UI carries the complete non-binding no-money notice', () => {
  const config = read('lib/config/private_pilot_config.dart');
  const screen = read('lib/screens/create_listing_screen.dart');
  for (const marker of [
    'Pilot-Simulation', 'keine verbindliche SIT-Miete', 'keine echten Zahlungen',
    'Erstattungen oder Auszahlungen', 'Nichts ist öffentlich',
    'Anzeigen bleiben im geschlossenen Pilot',
  ]) assert.match(config, new RegExp(marker, 'u'));
  assert.match(screen, /PrivatePilotConfig\.blueOceanStageANonBindingNotice/u);
  assert.match(config, /SIT_BLUE_OCEAN_LISTING_ASSISTANT/u);
});

test('N9 runbook fixes three adults, nine to fifteen listings and safe locations', () => {
  const runbook = read('docs/operations/BLUE_OCEAN_HEILBRONN_WAVE0_RUNBOOK.md');
  assert.match(runbook, /`heilbronn_wave0`/u);
  assert.match(runbook, /Three invited adults/u);
  assert.match(runbook, /nine to fifteen listings total/u);
  for (const marker of ['Pilot Treffpunkt A', 'Pilot Treffpunkt B', 'Pilot Treffpunkt C']) {
    assert.match(runbook, new RegExp(marker, 'u'));
  }
  assert.match(runbook, /HEILBRONN_WAVE0_ACTIVATION_GO/u);
  assert.match(runbook, /does not authorize activation/u);
});

test('N9 feedback template is structured and personal-data-free by contract', () => {
  const feedback = read('docs/templates/BLUE_OCEAN_HEILBRONN_WAVE0_FEEDBACK_FORM.md');
  for (const marker of [
    'BLANK TEMPLATE', 'HW0-A | HW0-B | HW0-C', 'Unsupported claim observed',
    'Price choice', 'Manual fallback used', 'Support needed', 'abort-wave',
  ]) assert.match(feedback, new RegExp(marker, 'u'));
  assert.doesNotMatch(feedback, /@[A-Za-z0-9.-]+|\+49\s*\d/u);
});

test('N9 evaluation sheet has one blank aggregate row and no participant column', () => {
  const csv = read('docs/templates/blue_ocean_heilbronn_wave0_evaluation_sheet.csv').trim();
  const rows = csv.split('\n').map((row) => row.split(','));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, rows[1].length);
  assert.equal(rows[1][1], 'BLUE_OCEAN');
  assert.equal(rows[1][2], '3');
  assert.equal(rows[1][3], '9');
  assert.equal(rows[1][4], '15');
  assert.equal(rows[1].at(-1), 'BLANK_TEMPLATE_NOT_OBSERVED_HUMAN_RESULTS');
  assert.doesNotMatch(rows[0].join(','), /participant_(?:id|name|email)|free_text/u);
});
