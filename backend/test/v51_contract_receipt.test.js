import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import {
  getV51ContractReceipt,
  persistV51ContractReceipt,
  renderV51ContractReceipt,
  V51ContractReceiptError,
} from '../src/v51_contract_receipt.js';

const acceptedAt = new Date('2026-08-16T12:00:00.000Z');

function input() {
  return {
    contractId: 'contract-1',
    bookingId: 'booking-1',
    quoteId: 'quote-1',
    quoteHash: 'c'.repeat(64),
    contractVersion: 'V5.1-2026-08-16',
    locale: 'de',
    clientBuild: '1.0.0+2026081509',
    acceptedAt,
    platformTerms: {
      document_key: 'platform_terms',
      document_version: 'V5.1-2026-08-16',
      content_text: 'Plattform <script>nicht ausführen</script>',
      content_sha256: 'a'.repeat(64),
    },
    privateRentalTerms: {
      document_key: 'private_rental_terms',
      document_version: 'V5.1-2026-08-16',
      content_text: 'Privat-Mietbedingungen',
      content_sha256: 'b'.repeat(64),
    },
    declarations: [
      {
        type: 'private_terms_and_platform_terms',
        exactWording: 'Erklärung eins',
        wordingSha256: 'd'.repeat(64),
        acceptedAt,
      },
      {
        type: 'early_performance_and_withdrawal',
        exactWording: 'Erklärung zwei',
        wordingSha256: 'e'.repeat(64),
        acceptedAt,
      },
    ],
    idempotencyKey: 'booking-create-1:platform-contract',
    generatedAt: acceptedAt,
  };
}

test('receipt contains the complete immutable texts and escapes active HTML', () => {
  const html = renderV51ContractReceipt(input());
  assert.match(html, /ShareItToo Vertragsbestätigung/u);
  assert.match(html, /Erklärung eins/u);
  assert.match(html, /Privat-Mietbedingungen/u);
  assert.match(html, /Plattform &lt;script&gt;nicht ausführen&lt;\/script&gt;/u);
  assert.equal(html.includes('<script>'), false);
  assert.match(html, new RegExp('a'.repeat(64), 'u'));
  assert.match(html, new RegExp('e'.repeat(64), 'u'));
});

test('receipt artifact and availability events are persisted before handoff', async () => {
  const calls = [];
  const client = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('INSERT INTO platform_contract_receipts')) {
        return { rows: [{ id: 'receipt-1', generated_at: acceptedAt }] };
      }
      return { rows: [] };
    },
  };
  const receipt = await persistV51ContractReceipt(client, input());
  assert.equal(receipt.id, 'receipt-1');
  assert.equal(receipt.downloadPath, '/v1/platform-contracts/contract-1/receipt');
  assert.match(receipt.artifactSha256, /^[0-9a-f]{64}$/u);
  assert.equal(
    calls.filter(({ sql }) => sql.includes('INSERT INTO platform_contract_receipt_events')).length,
    2,
  );
  assert.deepEqual(
    calls.filter(({ sql }) => sql.includes('INSERT INTO platform_contract_receipt_events'))
      .map(({ values }) => values[1]),
    ['generated', 'delivery_attempted'],
  );
});

test('authenticated owner download verifies integrity and records first delivery', async () => {
  const html = renderV51ContractReceipt(input());
  const hash = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
  const calls = [];
  const receipt = await getV51ContractReceipt({
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('FROM platform_contract_receipts AS receipt')) {
        return {
          rows: [{
            id: 'receipt-1',
            contract_id: 'contract-1',
            content_html: html,
            artifact_sha256: hash,
          }],
        };
      }
      return { rows: [] };
    },
  }, {
    userId: 'renter-1',
    contractId: 'contract-1',
    deliveredAt: acceptedAt,
  });
  assert.equal(receipt.contentHtml, html);
  assert.equal(receipt.artifactSha256, hash);
  assert.deepEqual(calls[0].values, ['contract-1', 'renter-1']);
  assert.match(calls[1].sql, /ON CONFLICT \(idempotency_key\) DO NOTHING/u);
  assert.equal(calls[1].values[4], 'contract-1:receipt:first-download');
});

test('download fails closed for another user or a modified artifact', async () => {
  await assert.rejects(
    getV51ContractReceipt({ async query() { return { rows: [] }; } }, {
      userId: 'other-user',
      contractId: 'contract-1',
    }),
    (error) => error instanceof V51ContractReceiptError
      && error.code === 'v51_receipt_not_found',
  );
  await assert.rejects(
    getV51ContractReceipt({
      async query() {
        return {
          rows: [{
            id: 'receipt-1',
            content_html: '<p>modified</p>',
            artifact_sha256: 'f'.repeat(64),
          }],
        };
      },
    }, { userId: 'renter-1', contractId: 'contract-1' }),
    (error) => error instanceof V51ContractReceiptError
      && error.code === 'v51_receipt_integrity_failed',
  );
});
