import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { validateG3LLegalDraft } from '../../tool/validate_g3l_legal_draft.mjs';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'sit-g3l-draft-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of ['assets', 'backend/src', 'docs/architecture', 'docs/compliance', 'lib/config']) {
    cpSync(resolve(repositoryRoot, path), resolve(root, path), { recursive: true });
  }
  return root;
}

function manifestAt(root) {
  const path = resolve(root, 'assets/legal/de/legal_manifest_g3l_draft.json');
  return { path, value: JSON.parse(readFileSync(path, 'utf8')) };
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

test('accepts an immutable fail-closed G3L draft while preserving V5.2', () => {
  const result = validateG3LLegalDraft({ repositoryRoot });
  assert.deepEqual(result, {
    version: 'G3L-DRAFT-2026-08-20.1',
    status: 'draft-blocked',
    parentVersion: 'V5.2-2026-08-16',
    draftDocumentCount: 4,
    openReviewDecisionCount: 14,
    hardStopBeforePublicActivation: true,
  });
});

test('rejects any approval or public activation claim', (t) => {
  const root = fixture(t);
  const { path, value } = manifestAt(root);
  value.status = 'approved';
  value.approvalAllowed = true;
  value.activationAllowed = true;
  writeJson(path, value);
  assert.throws(
    () => validateG3LLegalDraft({ repositoryRoot: root }),
    /inactive, unapproved technical draft/u,
  );
});

test('rejects mutation of a historical V5.2 document even if draft files are unchanged', (t) => {
  const root = fixture(t);
  const path = resolve(root, 'assets/legal/de/v52/part_b_private_rental_terms.html');
  writeFileSync(path, `${readFileSync(path, 'utf8')}\nchanged`);
  assert.throws(
    () => validateG3LLegalDraft({ repositoryRoot: root }),
    /historical V5.2 part B hash drift/u,
  );
});

test('rejects drift in the multi-item draft matrix', (t) => {
  const root = fixture(t);
  const path = resolve(
    root,
    'assets/legal/de/g3l-draft-2026-08-20.1/01_multi_item_change_matrix.md',
  );
  writeFileSync(path, `${readFileSync(path, 'utf8')}\nchanged`);
  assert.throws(
    () => validateG3LLegalDraft({ repositoryRoot: root }),
    /draft document hash drift/u,
  );
});

test('rejects a silently checked professional-review item', (t) => {
  const root = fixture(t);
  const { path, value } = manifestAt(root);
  const checklist = value.draftDocuments.find(
    (document) => document.type === 'professional_review_checklist',
  );
  const checklistPath = resolve(root, checklist.path);
  const content = readFileSync(checklistPath, 'utf8').replace('- [ ]', '- [x]');
  writeFileSync(checklistPath, content);
  checklist.sha256 = '0'.repeat(64);
  writeJson(path, value);
  assert.throws(
    () => validateG3LLegalDraft({ repositoryRoot: root }),
    /draft document entry drift|checklist must remain completely open/u,
  );
});

test('rejects hiding an affected privacy, export, receipt, or evidence scope', (t) => {
  const root = fixture(t);
  const { path, value } = manifestAt(root);
  value.affectedScopes = value.affectedScopes.filter((scope) => scope !== 'accountExport');
  writeJson(path, value);
  assert.throws(
    () => validateG3LLegalDraft({ repositoryRoot: root }),
    /affected-scope matrix is incomplete/u,
  );
});

test('rejects a closed legal decision or softened public release gate', (t) => {
  const root = fixture(t);
  const { path, value } = manifestAt(root);
  value.openReviewDecisions.pop();
  value.releaseGate.professionalLegalApproval = true;
  value.releaseGate.hardStopBeforePublicActivation = false;
  writeJson(path, value);
  assert.throws(
    () => validateG3LLegalDraft({ repositoryRoot: root }),
    /professional review decisions must remain complete/u,
  );
});

test('rejects bypassing the immutable draft identifier in group workflow', (t) => {
  const root = fixture(t);
  const path = resolve(root, 'backend/src/booking_group_workflow.js');
  const content = readFileSync(path, 'utf8').replace(
    'legalDocumentSetVersion: technicalGroupLegalDocumentSet.version',
    "legalDocumentSetVersion: 'approved-version'",
  );
  writeFileSync(path, content);
  assert.throws(
    () => validateG3LLegalDraft({ repositoryRoot: root }),
    /workflow is not bound to the immutable G3L draft identifier/u,
  );
});

test('rejects removal of the backend production or Flutter release guard', (t) => {
  const root = fixture(t);
  const path = resolve(root, 'lib/config/booking_group_technical_config.dart');
  const content = readFileSync(path, 'utf8').replace(
    'PrivatePilotConfig.technicalSurfaceAvailableFor',
    'PrivatePilotConfig.bindingCheckoutAvailableFor',
  );
  writeFileSync(path, content);
  assert.throws(
    () => validateG3LLegalDraft({ repositoryRoot: root }),
    /public\/live feature controls are not fail-closed/u,
  );
});
