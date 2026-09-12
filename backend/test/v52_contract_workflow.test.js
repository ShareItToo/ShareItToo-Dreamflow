import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  persistV52PlatformContract,
  validateV52CheckoutDeclarations,
  v52CheckoutDeclarations,
  v52ContractDocument,
  v52ContractDocuments,
  v52ContractDocumentReadiness,
  V52ContractWorkflowError,
} from '../src/v52_contract_workflow.js';

const issuedAt = new Date('2026-08-20T09:00:00.000Z');
const acceptedAt = new Date('2026-08-20T09:02:00.000Z');
const expiresAt = new Date('2026-08-20T09:10:00.000Z');
const quoteId = 'quote-1';
const quoteHash = 'c'.repeat(64);
const clientBuild = '1.0.0+2026081510';

function declarations() {
  return v52CheckoutDeclarations.map((entry) => ({
    type: entry.type,
    exactWording: entry.wording,
    documentName: v52ContractDocument.name,
    documentVersion: v52ContractDocument.version,
    language: v52ContractDocument.locale,
    clientBuild,
    quoteId,
    quoteHash,
    documentReferences: entry.documentReferences.map((reference) => ({
      ...reference,
    })),
    accepted: true,
    acceptedAt: acceptedAt.toISOString(),
  }));
}

function snapshotRows() {
  return v52ContractDocuments.map((entry) => {
    const content = `Volltext Teil ${entry.part}`;
    return {
      id: `snapshot-${entry.part.toLowerCase()}`,
      document_key: entry.key,
      document_version: v52ContractDocument.version,
      content_type: 'text/html',
      content_text: content,
      content_sha256: crypto.createHash('sha256').update(content, 'utf8').digest('hex'),
    };
  });
}

const validationContext = {
  now: acceptedAt,
  quoteId,
  quoteHash,
  quoteIssuedAt: issuedAt,
  quoteExpiresAt: expiresAt,
  clientBuild,
};

test('V5.2 accepts exactly two quote-bound declarations with exact references', () => {
  const normalized = validateV52CheckoutDeclarations(
    declarations(),
    validationContext,
  );
  assert.deepEqual(
    normalized.map((entry) => entry.type),
    ['private_terms_and_platform_terms', 'early_performance_and_withdrawal'],
  );
  assert.equal(normalized[0].documentReferences.length, 4);
  assert.equal(normalized[1].documentReferences.length, 2);
  assert.match(normalized[0].exactWording, /\[Teil A, Version V5\.2-2026-08-16\]/u);
  assert.ok(normalized.every((entry) => /^[0-9a-f]{64}$/.test(entry.wordingSha256)));
});

test('V5.2 rejects preselection drift, stale quote references and changed document links', () => {
  for (const mutate of [
    (items) => { items[0].accepted = false; },
    (items) => { items[0].quoteHash = 'd'.repeat(64); },
    (items) => { items[1].clientBuild = 'other-build'; },
    (items) => { items[0].documentReferences[0].part = 'I'; },
    (items) => { items[0].acceptedAt = new Date(issuedAt.getTime() - 1).toISOString(); },
    (items) => { items[0].acceptedAt = expiresAt.toISOString(); },
  ]) {
    const candidate = declarations();
    mutate(candidate);
    assert.throws(
      () => validateV52CheckoutDeclarations(candidate, validationContext),
      (error) => error instanceof V52ContractWorkflowError
        && error.code.startsWith('v52_declaration_invalid:'),
    );
  }
});

test('V5.2 readiness requires all nine immutable snapshots', async () => {
  const rows = snapshotRows().slice(0, -1);
  const readiness = await v52ContractDocumentReadiness({
    async query(sql, values) {
      assert.match(sql, /effective_at <= \$4/u);
      assert.deepEqual(values[0], v52ContractDocuments.map((entry) => entry.key));
      return { rows };
    },
  }, { at: acceptedAt });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.documents.length, 9);
});

test('V5.2 readiness rejects a snapshot whose stored hash does not match its text', async () => {
  const rows = snapshotRows();
  rows[0].content_sha256 = 'f'.repeat(64);
  const readiness = await v52ContractDocumentReadiness({
    async query() {
      return { rows };
    },
  }, { at: acceptedAt });
  assert.equal(readiness.ready, false);
  assert.equal(readiness.byKey.has('platform_terms'), false);
});

test('declarations, explicit acceptance, nine snapshots and receipt precede handoff', async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM legal_document_snapshots')) {
        return { rows: snapshotRows() };
      }
      if (sql.includes('INSERT INTO platform_contracts')) {
        return { rows: [{ id: values[0], accepted_at: acceptedAt }] };
      }
      if (sql.includes('INSERT INTO platform_contract_receipts')) {
        return { rows: [{ id: 'receipt-1', generated_at: acceptedAt }] };
      }
      return { rows: [] };
    },
  };
  const contract = await persistV52PlatformContract(client, {
    userId: 'renter-1',
    bookingId: 'booking-1',
    quoteId,
    quoteHash,
    quoteIssuedAt: issuedAt,
    quoteExpiresAt: expiresAt,
    clientBuild,
    declarations: declarations(),
    idempotencyKey: 'booking-create-1:platform-contract',
    acceptedAt,
  });

  assert.equal(contract.state, 'platformContractAccepted');
  assert.equal(contract.contractVersion, v52ContractDocument.version);
  assert.equal(Object.keys(contract.documentHashes).length, 9);
  assert.equal(contract.receipt.deliveryStatus, 'authenticated_in_app_available');
  assert.match(contract.sitAcceptance.wordingSha256, /^[0-9a-f]{64}$/u);

  const declarationIndexes = calls
    .map(({ sql }, index) => sql.includes('INSERT INTO platform_contract_declarations')
      ? index
      : -1)
    .filter((index) => index >= 0);
  const contractIndex = calls.findIndex(({ sql }) => sql.includes('INSERT INTO platform_contracts'));
  const receiptIndex = calls.findIndex(({ sql }) => (
    sql.includes('INSERT INTO platform_contract_receipts')
  ));
  assert.equal(declarationIndexes.length, 2);
  assert.ok(declarationIndexes.every((index) => index < contractIndex));
  assert.ok(contractIndex < receiptIndex);

  const contractInsert = calls[contractIndex];
  assert.equal(contractInsert.values[5], v52ContractDocument.version);
  assert.equal(contractInsert.values[6], 'snapshot-a');
  assert.equal(contractInsert.values[14], 'snapshot-i');
  assert.match(contractInsert.values[16], /^[0-9a-f]{64}$/u);
  const receiptHtml = calls[receiptIndex].values[1];
  assert.match(receiptHtml, /Gebundene Dokumente/u);
  assert.match(receiptHtml, /Teil A/u);
  assert.match(receiptHtml, /Teil I/u);
});

test('no V5.2 contract or receipt is created while one snapshot is absent', async () => {
  const calls = [];
  await assert.rejects(
    persistV52PlatformContract({
      async query(sql, values) {
        calls.push({ sql, values });
        if (sql.includes('FROM legal_document_snapshots')) {
          return { rows: snapshotRows().slice(0, -1) };
        }
        return { rows: [] };
      },
    }, {
      userId: 'renter-1',
      bookingId: 'booking-1',
      quoteId,
      quoteHash,
      quoteIssuedAt: issuedAt,
      quoteExpiresAt: expiresAt,
      clientBuild,
      declarations: declarations(),
      idempotencyKey: 'booking-create-1:platform-contract',
      acceptedAt,
    }),
    (error) => error instanceof V52ContractWorkflowError
      && error.code === 'v52_contract_documents_unavailable',
  );
  assert.equal(
    calls.some(({ sql }) => sql.includes('INSERT INTO platform_contracts')),
    false,
  );
  assert.equal(
    calls.some(({ sql }) => sql.includes('INSERT INTO platform_contract_receipts')),
    false,
  );
});
