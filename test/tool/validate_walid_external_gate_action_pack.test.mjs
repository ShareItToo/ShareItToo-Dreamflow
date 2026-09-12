import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { validateWalidExternalGateActionPack } from '../../tool/validate_walid_external_gate_action_pack.mjs';

const pack = readFileSync(
  new URL('../../docs/operations/WALID_EXTERNAL_GATE_ACTION_PACK.md', import.meta.url),
  'utf8',
);
const regression = readFileSync(
  new URL('../../scripts/technical_regression_check.sh', import.meta.url),
  'utf8',
);

test('accepts four ordered tiers and twelve bounded action blocks', () => {
  assert.deepEqual(validateWalidExternalGateActionPack(), {
    status: 'hold-no-go',
    tierCount: 4,
    actionBlockCount: 12,
    responseTokenCount: 31,
    externalGateCount: 11,
    externallyReadyGateCount: 0,
    issuedReleaseTokenCount: 0,
    nextActionBlock: 'A1',
    releaseDecision: 'hold-no-go',
  });
});

test('strict mode stops at the first bounded Walid answer', () => {
  assert.throws(
    () => validateWalidExternalGateActionPack({ requireNextWalidAnswer: true }),
    /walid_answer_required:PF3_A1_QUOTE_REQUEST_PACK_GO\|PF3_A1_HOLD/u,
  );
});

test('rejects reordering the Stage B and Stage C sections', () => {
  const b = '## B — Geschlossener Echtgeldpilot';
  const c = '## C — Öffentlicher Regionalstart';
  const changed = pack.replace(b, '## TEMP').replace(c, b).replace('## TEMP', c);
  assert.throws(
    () => validateWalidExternalGateActionPack({ packOverride: changed }),
    /tier_order_invalid:/u,
  );
});

test('requires every action block field', () => {
  const changed = pack.replace('- Dauer:', '- Zeit:');
  assert.throws(
    () => validateWalidExternalGateActionPack({ packOverride: changed }),
    /block_label_missing:.*Dauer/u,
  );
});

test('requires the exact Stage A decision choices', () => {
  const changed = pack.replace('`PILOT_STAGE_A_DECISION_GO`', '`STAGE_A_GO`');
  assert.throws(
    () => validateWalidExternalGateActionPack({ packOverride: changed }),
    /response_token_missing:PILOT_STAGE_A_DECISION_GO/u,
  );
});

test('requires every canonical external release token', () => {
  const changed = pack.replace(
    '`PILOT_STAGE_A_OPERATIONS_EVIDENCE_ACCEPTED`',
    '`OPERATIONS_DONE`',
  );
  assert.throws(
    () => validateWalidExternalGateActionPack({ packOverride: changed }),
    /release_token_missing:operations_roles_and_absence/u,
  );
});

test('rejects secret-shaped content and softened safety markers', () => {
  assert.throws(
    () => validateWalidExternalGateActionPack({ packOverride: `${pack}\npassword: exposed\n` }),
    /secret_shaped_content_forbidden/u,
  );
  assert.throws(
    () => validateWalidExternalGateActionPack({
      packOverride: pack.replace('Intake bleibt deaktiviert', 'Intake kann starten'),
    }),
    /safety_marker_missing:Intake bleibt deaktiviert/u,
  );
});

test('complete regression permanently executes the Walid action-pack validator', () => {
  assert.match(
    regression,
    /node --check tool\/validate_walid_external_gate_action_pack\.mjs/u,
  );
  assert.match(
    regression,
    /node --test test\/tool\/validate_walid_external_gate_action_pack\.test\.mjs/u,
  );
  assert.match(
    regression,
    /node tool\/validate_walid_external_gate_action_pack\.mjs/u,
  );
});
