#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateExternalGateExecutionBoard } from './validate_external_gate_execution_board.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const packPath = 'docs/operations/WALID_EXTERNAL_GATE_ACTION_PACK.md';
const boardPath =
  'docs/evidence/external-gates/external-gate-execution-board.json';

const tierHeadings = Object.freeze([
  '## A — Geschlossener Android-Pilot ohne Echtgeld',
  '## B — Geschlossener Echtgeldpilot',
  '## C — Öffentlicher Regionalstart',
  '## D — iOS und spätere zusätzliche Plattformen',
]);
const blockHeadings = Object.freeze([
  '### A1 — Rechts-, Betreiber-, Privacy- und Retention-Review anbahnen',
  '### A2 — Operations-Rollen und Stellvertretungen vorbereiten',
  '### A3 — Firebase-Owner-Review begleiten',
  '### A4 — Private Android-Distributionsroute festlegen',
  '### A5 — Pilot-Envelope und private Teilnehmerverwaltung bestätigen',
  '### A6 — Separate Stage-A-Entscheidung',
  '### B1 — Support-Scanner und Upload-Policy entscheiden',
  '### B2 — Marketplace-PSP-Angebote und Vertragsreview anbahnen',
  '### B3 — Separate Echtgeldentscheidung',
  '### C1 — Authentische Economics und Skalierungsbetrieb belegen',
  '### C2 — Öffentliche Store- und Launchentscheidung',
  '### D1 — Apple-/iOS-Scope und Kosten entscheiden',
]);
const requiredLabels = Object.freeze([
  '- Warum Walid jetzt gebraucht wird:',
  '- Dauer:',
  '- Mögliche Kosten:',
  '- Walid öffnet/bestätigt:',
  '- Codex parallel:',
  '- Antworttokens:',
  '- Ohne Entscheidung blockiert:',
]);
const responseTokens = Object.freeze([
  'PF3_A1_QUOTE_REQUEST_PACK_GO',
  'PF3_A1_HOLD',
  'PF3_A1_COST_GO_MAX_EUR_<GANZZAHL>',
  'PF3_A1_COST_NO_GO',
  'PF3_A2_PRIVATE_ROLE_MAPPING_READY',
  'PF3_A2_HOLD',
  'PF3_A2_ABSENCE_EVIDENCE_READY',
  'PF3_A3_OWNER_CONSOLE_READ_ONLY_READY',
  'PF3_A3_HOLD',
  'PF3_A4_PLAY_CONSOLE_READ_ONLY_READY',
  'PF3_A4_HOLD',
  'GOOGLE_PLAY_INTERNAL_RELEASE_GO',
  'ONEPLUS_PERSONAL_DEVICE_NONDESTRUCTIVE_TEST_GO',
  'PF3_A5_SPIEGELBERG_CAT8_30_ANDROID_NO_MONEY_SCOPE_CONFIRMED',
  'PF3_A5_HOLD',
  'PILOT_STAGE_A_DECISION_GO',
  'PILOT_STAGE_A_DECISION_NO_GO',
  'PF3_B1_SCANNER_OPTIONS_PACK_GO',
  'PF3_B1_HOLD',
  'PF3_B2_PSP_QUOTE_PACK_GO',
  'PF3_B2_HOLD',
  'PF3_B2_COST_GO_MAX_EUR_<GANZZAHL>',
  'PF3_B2_COST_NO_GO',
  'PILOT_STAGE_B_REAL_MONEY_DECISION_GO',
  'PILOT_STAGE_B_REAL_MONEY_DECISION_NO_GO',
  'PF3_C1_ECONOMICS_INPUT_PLAN_GO',
  'PF3_C1_HOLD',
  'PILOT_STAGE_C_PUBLIC_LAUNCH_DECISION_GO',
  'PILOT_STAGE_C_PUBLIC_LAUNCH_DECISION_NO_GO',
  'IOS_PLATFORM_GATE_DECISION_DEFER',
  'IOS_PLATFORM_GATE_DECISION_INVENTORY_ONLY',
]);

function assertCondition(condition, code) {
  if (!condition) throw new Error(code);
}

function positionsInOrder(text, markers, code) {
  let previous = -1;
  for (const marker of markers) {
    const index = text.indexOf(marker);
    assertCondition(index > previous, `${code}:${marker}`);
    previous = index;
  }
}

function blockText(pack, heading, nextHeading) {
  const start = pack.indexOf(heading);
  const end = nextHeading === undefined ? pack.length : pack.indexOf(nextHeading);
  return pack.slice(start, end);
}

export function validateWalidExternalGateActionPack({
  packOverride,
  requireNextWalidAnswer = false,
} = {}) {
  const external = validateExternalGateExecutionBoard();
  const pack = packOverride ?? readFileSync(path.join(root, packPath), 'utf8');
  const board = JSON.parse(readFileSync(path.join(root, boardPath), 'utf8'));

  assertCondition(pack.startsWith('# PF3 — Walid external gate action pack'), 'title_invalid');
  assertCondition(pack.includes('Status: **HOLD / NO-GO**'), 'hold_state_missing');
  positionsInOrder(pack, tierHeadings, 'tier_order_invalid');
  positionsInOrder(pack, blockHeadings, 'block_order_invalid');

  blockHeadings.forEach((heading, index) => {
    const section = blockText(pack, heading, blockHeadings[index + 1]);
    for (const label of requiredLabels) {
      assertCondition(section.includes(label), `block_label_missing:${heading}:${label}`);
    }
    assertCondition(/unbekannt|keine Gebühr|bereits bezahlt/iu.test(section), `cost_state_missing:${heading}`);
    assertCondition(/blockiert|gesperrt|HOLD|aus/iu.test(section), `blocked_state_missing:${heading}`);
  });

  for (const token of responseTokens) {
    assertCondition(pack.includes(`\`${token}\``), `response_token_missing:${token}`);
  }
  for (const gate of board.gates) {
    assertCondition(pack.includes(`\`${gate.releaseToken}\``), `release_token_missing:${gate.id}`);
  }

  for (const marker of [
    'keine stillschweigende Freigabe',
    'Ohne Betrag und',
    'Keine Verträge oder personenbezogenen Betreiberangaben im Chat',
    'keine Accountrechte verändern',
    'Bei Login, 2FA',
    'keine Binärdatei signieren oder hochladen',
    'Noch niemanden einladen oder registrieren',
    'keine Aktivierung',
    'Intake bleibt deaktiviert',
    'kein Echtgeld',
    'keine produktive Analytics-/Cloudänderung',
    'keine Submission und keine Veröffentlichung',
    'Stage A bleibt Android-only',
    'Der Gesamtauftrag endet am unerteilten Gate',
  ]) {
    assertCondition(pack.includes(marker), `safety_marker_missing:${marker}`);
  }

  assertCondition(
    !/\b(?:password|passwort|api[_ -]?key|client[_ -]?secret)\s*[:=]\s*\S+/iu.test(pack),
    'secret_shaped_content_forbidden',
  );
  assertCondition(
    external.gateCount === 11
      && external.externallyReadyGateCount === 0
      && external.releaseDecision === 'hold-no-go',
    'external_gate_state_drift',
  );

  if (requireNextWalidAnswer) {
    throw new Error('walid_answer_required:PF3_A1_QUOTE_REQUEST_PACK_GO|PF3_A1_HOLD');
  }

  return Object.freeze({
    status: 'hold-no-go',
    tierCount: 4,
    actionBlockCount: 12,
    responseTokenCount: responseTokens.length,
    externalGateCount: 11,
    externallyReadyGateCount: 0,
    issuedReleaseTokenCount: 0,
    nextActionBlock: 'A1',
    releaseDecision: 'hold-no-go',
  });
}

function runCli() {
  const args = process.argv.slice(2);
  const allowed = new Set(['--require-next-walid-answer']);
  const unknown = args.find((argument) => !allowed.has(argument));
  if (unknown !== undefined) throw new Error(`unknown_argument:${unknown}`);
  const result = validateWalidExternalGateActionPack({
    requireNextWalidAnswer: args.includes('--require-next-walid-answer'),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}
