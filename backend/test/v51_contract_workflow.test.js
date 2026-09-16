import assert from 'node:assert/strict';
import test from 'node:test';

import {
  persistV51PlatformContract,
  validateV51CheckoutDeclarations,
  v51CheckoutDeclarations,
  v51ContractDocument,
  v51ContractDocumentReadiness,
  V51ContractWorkflowError,
} from '../src/v51_contract_workflow.js';

const acceptedAt = new Date('2026-08-16T12:00:00.000Z');

function declarations() {
  return v51CheckoutDeclarations.map((entry) => ({
    type: entry.type,
    exactWording: entry.wording,
    documentName: v51ContractDocument.name,
    documentVersion: v51ContractDocument.version,
    language: v51ContractDocument.locale,
    accepted: true,
    acceptedAt: acceptedAt.toISOString(),
  }));
}

test('V5.1 accepts exactly two explicit current declarations', () => {
  const normalized = validateV51CheckoutDeclarations(declarations(), {
    now: acceptedAt,
  });
  assert.deepEqual(
    normalized.map((entry) => entry.type),
    ['private_terms_and_platform_terms', 'early_performance_and_withdrawal'],
  );
  assert.ok(normalized.every((entry) => /^[0-9a-f]{64}$/.test(entry.wordingSha256)));
  assert.throws(
    () => validateV51CheckoutDeclarations([...declarations(), declarations()[0]], {
      now: acceptedAt,
    }),
    (error) => error instanceof V51ContractWorkflowError
      && error.code === 'v51_exactly_two_declarations_required',
  );
  const preselectedByOmission = declarations();
  preselectedByOmission[0].accepted = false;
  assert.throws(
    () => validateV51CheckoutDeclarations(preselectedByOmission, { now: acceptedAt }),
    /v51_declaration_invalid:private_terms_and_platform_terms/u,
  );
});

test('contract readiness requires both immutable V5.1 snapshots', async () => {
  const calls = [];
  const incomplete = await v51ContractDocumentReadiness({
    async query(sql, values) {
      calls.push({ sql, values });
      return {
        rows: [{
          id: 'snapshot-platform',
          document_key: 'platform_terms',
          document_version: v51ContractDocument.version,
          content_type: 'text/plain',
          content_text: 'Plattformbedingungen',
          content_sha256: 'a'.repeat(64),
        }],
      };
    },
  }, { at: acceptedAt });
  assert.equal(incomplete.ready, false);
  assert.match(calls[0].sql, /effective_at <= \$4/u);
  assert.deepEqual(calls[0].values[0], ['platform_terms', 'private_rental_terms']);
});

test('platform contract and its two declarations are persisted atomically', async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM legal_document_snapshots')) {
        return {
          rows: [
            {
              id: 'snapshot-platform',
              document_key: 'platform_terms',
              document_version: v51ContractDocument.version,
              content_type: 'text/plain',
              content_text: 'Plattformbedingungen',
              content_sha256: 'a'.repeat(64),
            },
            {
              id: 'snapshot-rental',
              document_key: 'private_rental_terms',
              document_version: v51ContractDocument.version,
              content_type: 'text/plain',
              content_text: 'Privat-Mietbedingungen',
              content_sha256: 'b'.repeat(64),
            },
          ],
        };
      }
      if (sql.includes('INSERT INTO platform_contracts')) {
        return { rows: [{ id: 'contract-1', accepted_at: acceptedAt }] };
      }
      if (sql.includes('INSERT INTO platform_contract_receipts')) {
        return { rows: [{ id: 'receipt-1', generated_at: acceptedAt }] };
      }
      return { rows: [] };
    },
  };
  const result = await persistV51PlatformContract(client, {
    userId: 'renter-1',
    bookingId: 'booking-1',
    quoteId: 'quote-1',
    quoteHash: 'c'.repeat(64),
    clientBuild: '1.0.0+2026081509',
    declarations: declarations(),
    idempotencyKey: 'booking-create-1:platform-contract',
    acceptedAt,
  });
  assert.equal(result.id, 'contract-1');
  assert.equal(result.contractVersion, v51ContractDocument.version);
  assert.deepEqual(result.documentHashes, {
    platformTerms: 'a'.repeat(64),
    privateRentalTerms: 'b'.repeat(64),
  });
  assert.equal(result.receipt.id, 'receipt-1');
  assert.match(result.receipt.artifactSha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.receipt.downloadPath, '/v1/platform-contracts/contract-1/receipt');
  assert.equal(
    calls.filter((entry) => entry.sql.includes('INSERT INTO platform_contract_declarations')).length,
    2,
  );
  const contractInsert = calls.find((entry) => entry.sql.includes('INSERT INTO platform_contracts'));
  assert.equal(contractInsert.values[0], 'renter-1');
  assert.equal(contractInsert.values[1], 'booking-1');
  assert.equal(contractInsert.values[2], 'quote-1');
  assert.equal(contractInsert.values[3], 'c'.repeat(64));
  assert.equal(contractInsert.values[5], 'snapshot-platform');
  assert.equal(contractInsert.values[6], 'snapshot-rental');
});

test('no platform contract is created while either legal snapshot is absent', async () => {
  let contractInsertAttempted = false;
  const client = {
    async query(sql) {
      if (sql.includes('FROM legal_document_snapshots')) return { rows: [] };
      if (sql.includes('INSERT INTO platform_contracts')) contractInsertAttempted = true;
      return { rows: [] };
    },
  };
  await assert.rejects(
    persistV51PlatformContract(client, {
      userId: 'renter-1',
      bookingId: 'booking-1',
      quoteId: 'quote-1',
      quoteHash: 'c'.repeat(64),
      clientBuild: '1.0.0+2026081509',
      declarations: declarations(),
      idempotencyKey: 'booking-create-1:platform-contract',
      acceptedAt,
    }),
    (error) => error instanceof V51ContractWorkflowError
      && error.code === 'v51_contract_documents_unavailable',
  );
  assert.equal(contractInsertAttempted, false);
});
