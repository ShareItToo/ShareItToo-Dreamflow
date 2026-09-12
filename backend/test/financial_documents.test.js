import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  FinancialDocumentError,
  buildFinancialDocumentDrafts,
} from '../src/financial_documents.js';

const actorId = 'renter-1';
const base = Object.freeze({
  booking_id: 'booking-1',
  owner_id: 'owner-1',
  renter_id: actorId,
  starts_at: '2026-08-20T10:00:00.000Z',
  ends_at: '2026-08-22T10:00:00.000Z',
  currency: 'EUR',
  listing_payload: { title: 'Bohrmaschine' },
  owner_profile: { displayName: 'Privater Vermieter' },
  renter_profile: { displayName: 'Mieter' },
  quote_id: 'quote-1',
  quote_hash: 'a'.repeat(64),
  contract_version: 'V5.1-2026-08-16',
  livemode: false,
  updated_at: '2026-08-19T12:00:00.000Z',
});

function payment(overrides = {}) {
  return {
    ...base,
    payment_id: 'payment-1',
    status: 'captured',
    amount_minor: 4400,
    rental_subtotal_minor: 4000,
    platform_fee_minor: 400,
    owner_payout_minor: 4000,
    captured_minor: 4400,
    captured_at: '2026-08-19T12:00:00.000Z',
    ...overrides,
  };
}

function build({ paymentRows = [], refundRows = [], payoutRows = [], id = actorId, legalConfig = {} } = {}) {
  return buildFinancialDocumentDrafts({
    actorId: id,
    paymentRows,
    refundRows,
    payoutRows,
    legalConfig,
  });
}

test('unpaid, failed and only-authorized payments never produce documents', () => {
  for (const status of ['created', 'requires_action', 'authorized', 'failed', 'cancelled']) {
    assert.deepEqual(build({ paymentRows: [payment({ status, captured_minor: 0 })] }), []);
  }
  assert.deepEqual(build({
    paymentRows: [payment({ status: 'captured', captured_minor: 4300 })],
  }), []);
});

test('captured renter payment creates only a split booking summary and SIT-fee receipt', () => {
  const drafts = build({ paymentRows: [payment()] });
  assert.deepEqual(drafts.map((entry) => entry.documentType), [
    'booking_payment_receipt',
    'sit_fee_receipt',
  ]);
  assert.deepEqual(drafts.map((entry) => entry.amountMinor), [4400, 400]);
  assert.equal(drafts[0].privateRentMinor, 4000);
  assert.equal(drafts[0].sitFeeMinor, 400);
  assert.equal(drafts[0].supplierRole, 'private_owner');
  assert.equal(drafts[1].supplierRole, 'sit');
  assert.equal(drafts[0].testMode, true);
  assert.match(drafts[0].contentHtml, /Privater Mietpreis[^]*40,00 EUR/u);
  assert.match(drafts[0].contentHtml, /SIT-Plattformgebühr[^]*4,00 EUR/u);
  assert.match(drafts[0].contentHtml, /TESTBELEG/u);
  assert.match(drafts[0].contentHtml, /keine Umsatzsteuer aus/u);
  assert.doesNotMatch(drafts[0].contentHtml, /(?:1[.,]19|USt\.\s*19|19\s*%[^<]{0,40}(?:berechnet|enthalten|ausgewiesen))/iu);
});

test('owner receives no fee invoice and only a statement after an actually paid payout', () => {
  const ownerId = 'owner-1';
  const unpaid = build({
    id: ownerId,
    paymentRows: [payment()],
    payoutRows: [{
      ...base,
      payout_id: 'payout-1',
      status: 'pending',
      amount_minor: 4000,
      paid_at: null,
    }],
  });
  assert.deepEqual(unpaid, []);

  const paid = build({
    id: ownerId,
    paymentRows: [payment()],
    payoutRows: [{
      ...base,
      payout_id: 'payout-1',
      status: 'paid',
      amount_minor: 4000,
      paid_at: '2026-08-24T12:00:00.000Z',
    }],
  });
  assert.equal(paid.length, 1);
  assert.equal(paid[0].documentType, 'owner_payout_statement');
  assert.equal(paid[0].amountMinor, 4000);
  assert.match(paid[0].contentHtml, /keine Rechnung von SIT/u);
});

test('refund receipt exists only after success and preserves separate debtors', () => {
  const pending = {
    ...base,
    refund_id: 'refund-1',
    status: 'pending',
    amount_minor: 2200,
    owner_share_minor: 2000,
    platform_share_minor: 200,
    succeeded_at: null,
  };
  assert.deepEqual(build({ refundRows: [pending] }), []);
  const [receipt] = build({
    refundRows: [{ ...pending, status: 'succeeded', succeeded_at: base.updated_at }],
  });
  assert.equal(receipt.documentType, 'refund_receipt');
  assert.equal(receipt.rentRefundMinor, 2000);
  assert.equal(receipt.sitFeeRefundMinor, 200);
  assert.match(receipt.contentHtml, /Schuldner Vermieter/u);
  assert.match(receipt.contentHtml, /Schuldner SIT/u);
});

test('document number, artifact and hash are deterministic for the same immutable source', () => {
  const first = build({ paymentRows: [payment()] });
  const second = build({ paymentRows: [payment()] });
  assert.equal(first[0].documentNumber, second[0].documentNumber);
  assert.equal(first[0].artifactSha256, second[0].artifactSha256);
  assert.match(first[0].artifactSha256, /^[0-9a-f]{64}$/u);
  assert.equal(first[0].snapshot.quoteHash, 'a'.repeat(64));
});

test('live issuance fails closed until both approval and tax label are configured', () => {
  const live = payment({ livemode: true });
  assert.throws(
    () => build({ paymentRows: [live] }),
    (error) => error instanceof FinancialDocumentError
      && error.code === 'financial_document_live_issuance_not_approved',
  );
  assert.throws(
    () => build({ paymentRows: [live], legalConfig: { liveIssuanceApproved: true } }),
    (error) => error instanceof FinancialDocumentError
      && error.code === 'financial_document_tax_configuration_missing',
  );
  const [approved] = build({
    paymentRows: [live],
    legalConfig: { liveIssuanceApproved: true, sitFeeTaxLabel: 'Steuerstatus geprüft' },
  });
  assert.equal(approved.testMode, false);
  assert.doesNotMatch(approved.contentHtml, /TESTBELEG/u);
  assert.match(approved.contentHtml, /Steuerstatus geprüft/u);
});

test('financial document storage, authenticated download and privacy inventory are fail-closed', () => {
  const migration = readFileSync(
    new URL('../sql/migrations/020_v51_financial_documents.up.sql', import.meta.url),
    'utf8',
  );
  const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
  const service = readFileSync(new URL('../src/financial_documents.js', import.meta.url), 'utf8');
  const privacyExport = readFileSync(new URL('../src/privacy_export.js', import.meta.url), 'utf8');
  const retention = readFileSync(new URL('../src/retention_inventory.js', import.meta.url), 'utf8');

  for (const table of ['financial_documents', 'financial_document_events']) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, 'u'));
    assert.match(migration, new RegExp(`CREATE TRIGGER ${table}_append_only[\\s\\S]*ON ${table}`, 'u'));
    assert.match(retention, new RegExp(`'transactions', '${table}'`, 'u'));
  }
  assert.match(migration, /artifact_sha256 CHAR\(64\) NOT NULL/u);
  assert.match(migration, /payment_id IS NOT NULL\)::int[\s\S]*refund_id IS NOT NULL\)::int[\s\S]*payout_id IS NOT NULL\)::int = 1/u);
  assert.match(migration, /document_type = 'booking_payment_receipt'[\s\S]*amount_minor = private_rent_minor \+ sit_fee_minor/u);
  assert.match(migration, /document_type = 'sit_fee_receipt'[\s\S]*amount_minor = sit_fee_minor/u);
  assert.match(migration, /document_type = 'owner_payout_statement'[\s\S]*amount_minor = owner_payout_minor/u);
  assert.match(migration, /document_type = 'refund_receipt'[\s\S]*amount_minor = rent_refund_minor \+ sit_fee_refund_minor/u);
  assert.match(service, /observedHash !== row\.artifact_sha256/u);
  assert.match(app, /\/v1\/financial-documents[\s\S]*requireAuth[\s\S]*requireActiveAccount/u);
  assert.match(app, /Cache-Control': 'private, no-store'/u);
  assert.match(privacyExport, /financialDocuments/u);
  assert.match(privacyExport, /financialDocumentEvents/u);
});
