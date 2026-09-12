import crypto from 'node:crypto';

export class FinancialDocumentError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function text(value, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new FinancialDocumentError(500, 'financial_document_time_invalid');
  }
  return date.toISOString();
}

function minor(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new FinancialDocumentError(500, 'financial_document_amount_invalid');
  }
  return parsed;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function profileName(profile, fallback) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return fallback;
  return text(profile.displayName, fallback);
}

function itemTitle(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Mietgegenstand';
  return text(payload.title, 'Mietgegenstand');
}

function euro(value, currency) {
  return `${(minor(value) / 100).toFixed(2).replace('.', ',')} ${escapeHtml(currency)}`;
}

function numberFor(type, sourceId, audienceUserId, issuedAt) {
  const prefixes = {
    booking_payment_receipt: 'BUCHUNG',
    sit_fee_receipt: 'SIT-GEBUEHR',
    owner_payout_statement: 'AUSZAHLUNG',
    refund_receipt: 'ERSTATTUNG',
  };
  const digest = crypto.createHash('sha256')
    .update(`${type}:${sourceId}:${audienceUserId}`)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();
  const date = new Date(issuedAt);
  const bucket = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  return `SIT-${prefixes[type]}-${bucket}-${digest}`;
}

function documentTitle(type) {
  return {
    booking_payment_receipt: 'Buchungs- und Zahlungsübersicht',
    sit_fee_receipt: 'Beleg über die SIT-Plattformgebühr',
    owner_payout_statement: 'Auszahlungsnachweis für den Vermieter',
    refund_receipt: 'Erstattungsbeleg',
  }[type];
}

function renderDocument(draft) {
  const s = draft.snapshot;
  const testBanner = draft.testMode
    ? '<p class="test">TESTBELEG – kein Echtgeld und keine steuerliche Rechnung.</p>'
    : '';
  const typeSpecific = {
    booking_payment_receipt: {
      rows: `
      <tr><th>Privater Mietpreis – Leistung des Vermieters</th><td>${euro(draft.privateRentMinor, draft.currency)}</td></tr>
      <tr><th>SIT-Plattformgebühr – Leistung von SIT</th><td>${euro(draft.sitFeeMinor, draft.currency)}</td></tr>
      <tr class="total"><th>Gezahlter Gesamtbetrag</th><td>${euro(draft.amountMinor, draft.currency)}</td></tr>`,
      notice: 'Der private Vermieter ist Leistungserbringer des Mietpreises. SIT ist nicht Vermieter und weist auf den privaten Mietpreis keine Umsatzsteuer aus.',
    },
    sit_fee_receipt: {
      rows: `
      <tr><th>SIT-Plattformgebühr</th><td>${euro(draft.sitFeeMinor, draft.currency)}</td></tr>
      <tr class="total"><th>Belegbetrag</th><td>${euro(draft.amountMinor, draft.currency)}</td></tr>`,
      notice: 'Dieser SIT-Beleg betrifft ausschließlich die Plattformgebühr. Der private Mietpreis ist nicht Bestandteil dieses SIT-Belegs.',
    },
    owner_payout_statement: {
      rows: `
      <tr><th>Ausgezahlter privater Mietpreis</th><td>${euro(draft.ownerPayoutMinor, draft.currency)}</td></tr>
      <tr class="total"><th>Auszahlung</th><td>${euro(draft.amountMinor, draft.currency)}</td></tr>`,
      notice: 'Dies ist ein Auszahlungsnachweis und keine Rechnung von SIT über den privaten Mietpreis.',
    },
    refund_receipt: {
      rows: `
      <tr><th>Erstattung Mietpreis – Schuldner Vermieter</th><td>${euro(draft.rentRefundMinor, draft.currency)}</td></tr>
      <tr><th>Erstattung SIT-Plattformgebühr – Schuldner SIT</th><td>${euro(draft.sitFeeRefundMinor, draft.currency)}</td></tr>
      <tr class="total"><th>Erstatteter Gesamtbetrag</th><td>${euro(draft.amountMinor, draft.currency)}</td></tr>`,
      notice: 'Mietpreis und SIT-Plattformgebühr werden mit getrenntem Schuldner ausgewiesen.',
    },
  }[draft.documentType];
  return `<!doctype html>
<html lang="de" data-financial-document-version="V5.1-2026-08-16">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${escapeHtml(documentTitle(draft.documentType))}</title>
<style>body{font:16px/1.5 Arial,sans-serif;color:#18324d;margin:0;background:#f5f8fc}main{max-width:760px;margin:auto;padding:32px 20px}section{background:#fff;border:1px solid #d8e2ee;border-radius:14px;padding:22px;margin:16px 0}table{width:100%;border-collapse:collapse}th{text-align:left;font-weight:600}td{text-align:right}th,td{padding:9px 0;border-bottom:1px solid #e6edf5}.total{font-weight:800}.test{border:2px solid #b54708;background:#fff4e5;padding:12px;border-radius:10px;font-weight:800}.muted{color:#526b84;font-size:.9rem}</style></head>
<body><main>${testBanner}<h1>${escapeHtml(documentTitle(draft.documentType))}</h1>
<p class="muted">Dokument ${escapeHtml(draft.documentNumber)} · ausgestellt ${escapeHtml(draft.issuedAt)}</p>
<section><h2>Buchung</h2><dl><dt>Buchungs-ID</dt><dd>${escapeHtml(draft.bookingId)}</dd><dt>Gegenstand</dt><dd>${escapeHtml(s.itemTitle)}</dd><dt>Zeitraum</dt><dd>${escapeHtml(s.startsAt)} bis ${escapeHtml(s.endsAt)}</dd><dt>Privater Vermieter</dt><dd>${escapeHtml(s.ownerName)}</dd><dt>Mieter</dt><dd>${escapeHtml(s.renterName)}</dd><dt>Quote</dt><dd>${escapeHtml(s.quoteId ?? 'serverseitiger Buchungssnapshot')}</dd></dl></section>
<section><h2>Beträge</h2><table>${typeSpecific.rows}</table><p>${escapeHtml(typeSpecific.notice)}</p></section>
<section><h2>Nachweis</h2><p>Quelle: unveränderlicher ${escapeHtml(draft.sourceKind)}-Snapshot ${escapeHtml(draft.sourceId)}. Preis- und Erstattungsbeträge wurden nicht im Client neu berechnet.</p><p class="muted">Steuerliche Einordnung SIT-Gebühr: ${escapeHtml(s.sitFeeTaxLabel)}. Private Miete: kein pauschaler Ausweis von 19 % Umsatzsteuer durch SIT.</p></section>
</main></body></html>`;
}

function baseSnapshot(row, { sitFeeTaxLabel }) {
  return Object.freeze({
    schemaVersion: 1,
    itemTitle: itemTitle(row.listing_payload),
    ownerName: profileName(row.owner_profile, 'Privater Vermieter'),
    renterName: profileName(row.renter_profile, 'Mieter'),
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    quoteId: text(row.quote_id) || null,
    quoteHash: text(row.quote_hash) || null,
    contractVersion: text(row.contract_version) || null,
    sitFeeTaxLabel,
  });
}

function makeDraft({
  row,
  actorId,
  type,
  sourceKind,
  sourceId,
  issuedAt,
  amountMinor,
  privateRentMinor = 0,
  sitFeeMinor = 0,
  ownerPayoutMinor = 0,
  rentRefundMinor = 0,
  sitFeeRefundMinor = 0,
  supplierRole,
  debtorRole,
  legalConfig,
}) {
  const testMode = row.livemode !== true;
  if (!testMode && legalConfig.liveIssuanceApproved !== true) {
    throw new FinancialDocumentError(503, 'financial_document_live_issuance_not_approved');
  }
  const sitFeeTaxLabel = testMode
    ? 'im Testbetrieb nicht als Steuerrechnung freigegeben'
    : text(legalConfig.sitFeeTaxLabel);
  if (!sitFeeTaxLabel) {
    throw new FinancialDocumentError(503, 'financial_document_tax_configuration_missing');
  }
  const normalizedIssuedAt = iso(issuedAt);
  const draft = {
    bookingId: row.booking_id,
    audienceUserId: actorId,
    documentType: type,
    paymentId: sourceKind === 'payment' ? sourceId : null,
    refundId: sourceKind === 'refund' ? sourceId : null,
    payoutId: sourceKind === 'payout' ? sourceId : null,
    sourceKind,
    sourceId,
    documentNumber: numberFor(type, sourceId, actorId, normalizedIssuedAt),
    currency: text(row.currency, 'EUR'),
    amountMinor: minor(amountMinor),
    privateRentMinor: minor(privateRentMinor),
    sitFeeMinor: minor(sitFeeMinor),
    ownerPayoutMinor: minor(ownerPayoutMinor),
    rentRefundMinor: minor(rentRefundMinor),
    sitFeeRefundMinor: minor(sitFeeRefundMinor),
    supplierRole,
    debtorRole,
    taxTreatment: type === 'sit_fee_receipt'
      ? (testMode ? 'sit_fee_tax_status_pending' : 'sit_fee_tax_status_configured')
      : (type === 'booking_payment_receipt' ? 'private_rent_no_sit_vat' : 'not_applicable'),
    testMode,
    issuedAt: normalizedIssuedAt,
    snapshot: baseSnapshot(row, { sitFeeTaxLabel }),
  };
  const contentHtml = renderDocument(draft);
  return Object.freeze({
    ...draft,
    contentHtml,
    artifactSha256: crypto.createHash('sha256').update(contentHtml, 'utf8').digest('hex'),
  });
}

export function buildFinancialDocumentDrafts({
  actorId,
  paymentRows = [],
  refundRows = [],
  payoutRows = [],
  legalConfig = {},
}) {
  const drafts = [];
  for (const row of paymentRows) {
    if (row.renter_id !== actorId
        || !['captured', 'partially_refunded', 'refunded'].includes(row.status)
        || minor(row.captured_minor) !== minor(row.amount_minor)) continue;
    const issuedAt = row.captured_at ?? row.updated_at;
    drafts.push(makeDraft({
      row, actorId, type: 'booking_payment_receipt', sourceKind: 'payment',
      sourceId: row.payment_id, issuedAt, amountMinor: row.amount_minor,
      privateRentMinor: row.rental_subtotal_minor,
      sitFeeMinor: row.platform_fee_minor,
      supplierRole: 'private_owner', debtorRole: 'renter', legalConfig,
    }));
    if (minor(row.platform_fee_minor) > 0) {
      drafts.push(makeDraft({
        row, actorId, type: 'sit_fee_receipt', sourceKind: 'payment',
        sourceId: row.payment_id, issuedAt, amountMinor: row.platform_fee_minor,
        sitFeeMinor: row.platform_fee_minor,
        supplierRole: 'sit', debtorRole: 'renter', legalConfig,
      }));
    }
  }
  for (const row of refundRows) {
    if (row.renter_id !== actorId || row.status !== 'succeeded') continue;
    drafts.push(makeDraft({
      row, actorId, type: 'refund_receipt', sourceKind: 'refund',
      sourceId: row.refund_id, issuedAt: row.succeeded_at ?? row.updated_at,
      amountMinor: row.amount_minor, rentRefundMinor: row.owner_share_minor,
      sitFeeRefundMinor: row.platform_share_minor,
      supplierRole: 'payment_provider', debtorRole: 'payment_provider', legalConfig,
    }));
  }
  for (const row of payoutRows) {
    if (row.owner_id !== actorId || row.status !== 'paid') continue;
    drafts.push(makeDraft({
      row, actorId, type: 'owner_payout_statement', sourceKind: 'payout',
      sourceId: row.payout_id, issuedAt: row.paid_at ?? row.updated_at,
      amountMinor: row.amount_minor, ownerPayoutMinor: row.amount_minor,
      supplierRole: 'private_owner', debtorRole: 'payment_provider', legalConfig,
    }));
  }
  return Object.freeze(drafts);
}

function shape(row) {
  const snapshot = row.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {};
  const sourceId = row.payment_id ?? row.refund_id ?? row.payout_id;
  const sourceKind = row.payment_id ? 'payment' : (row.refund_id ? 'refund' : 'payout');
  return Object.freeze({
    id: row.id,
    documentNumber: row.document_number,
    bookingId: row.booking_id,
    type: row.document_type,
    title: documentTitle(row.document_type),
    sourceKind,
    sourceId,
    currency: row.currency,
    amountMinor: minor(row.amount_minor),
    privateRentMinor: minor(row.private_rent_minor),
    sitFeeMinor: minor(row.sit_fee_minor),
    ownerPayoutMinor: minor(row.owner_payout_minor),
    rentRefundMinor: minor(row.rent_refund_minor),
    sitFeeRefundMinor: minor(row.sit_fee_refund_minor),
    supplierRole: row.supplier_role,
    debtorRole: row.debtor_role,
    taxTreatment: row.tax_treatment,
    testMode: row.test_mode === true,
    issuedAt: iso(row.issued_at),
    artifactSha256: row.artifact_sha256,
    downloadPath: `/v1/financial-documents/${encodeURIComponent(row.id)}/artifact`,
    booking: Object.freeze({
      itemTitle: text(snapshot.itemTitle, 'Mietgegenstand'),
      renterName: text(snapshot.renterName, 'Mieter'),
      ownerName: text(snapshot.ownerName, 'Privater Vermieter'),
      startsAt: snapshot.startsAt ?? null,
      endsAt: snapshot.endsAt ?? null,
      quoteId: snapshot.quoteId ?? null,
      quoteHash: snapshot.quoteHash ?? null,
      contractVersion: snapshot.contractVersion ?? null,
    }),
    sitFeeTaxLabel: text(snapshot.sitFeeTaxLabel),
  });
}

const sourceColumns = `
  booking.id AS booking_id, booking.owner_id, booking.renter_id,
  booking.starts_at, booking.ends_at, booking.currency,
  listing.payload AS listing_payload,
  owner.profile AS owner_profile, renter.profile AS renter_profile,
  contract.quote_id, contract.quote_hash, contract.contract_version`;

async function sourceRows(client, actorId) {
  const payments = await client.query(
    `SELECT payment.id AS payment_id, payment.status, payment.amount_minor,
            payment.rental_subtotal_minor, payment.platform_fee_minor,
            payment.owner_payout_minor, payment.captured_minor,
            payment.captured_at, payment.updated_at, payment.livemode,
            ${sourceColumns}
       FROM payments AS payment
       JOIN bookings AS booking ON booking.id = payment.booking_id
       JOIN listings AS listing ON listing.id = booking.listing_id
       JOIN users AS owner ON owner.id = booking.owner_id
       JOIN users AS renter ON renter.id = booking.renter_id
       LEFT JOIN platform_contracts AS contract ON contract.booking_id = booking.id
      WHERE (booking.owner_id = $1 OR booking.renter_id = $1)
        AND payment.status IN ('captured', 'partially_refunded', 'refunded')
      ORDER BY payment.created_at, payment.id`,
    [actorId],
  );
  const refunds = await client.query(
    `SELECT refund.id AS refund_id, refund.status, refund.amount_minor,
            refund.owner_share_minor, refund.platform_share_minor,
            refund.succeeded_at, refund.updated_at, refund.livemode,
            ${sourceColumns}
       FROM refunds AS refund
       JOIN payments AS payment ON payment.id = refund.payment_id
       JOIN bookings AS booking ON booking.id = payment.booking_id
       JOIN listings AS listing ON listing.id = booking.listing_id
       JOIN users AS owner ON owner.id = booking.owner_id
       JOIN users AS renter ON renter.id = booking.renter_id
       LEFT JOIN platform_contracts AS contract ON contract.booking_id = booking.id
      WHERE booking.renter_id = $1 AND refund.status = 'succeeded'
      ORDER BY refund.created_at, refund.id`,
    [actorId],
  );
  const payouts = await client.query(
    `SELECT payout.id AS payout_id, payout.status, payout.amount_minor,
            payout.paid_at, payout.updated_at, payout.livemode,
            ${sourceColumns}
       FROM payouts AS payout
       JOIN bookings AS booking ON booking.id = payout.booking_id
       JOIN listings AS listing ON listing.id = booking.listing_id
       JOIN users AS owner ON owner.id = booking.owner_id
       JOIN users AS renter ON renter.id = booking.renter_id
       LEFT JOIN platform_contracts AS contract ON contract.booking_id = booking.id
      WHERE payout.payee_id = $1 AND payout.status = 'paid'
      ORDER BY payout.created_at, payout.id`,
    [actorId],
  );
  return { paymentRows: payments.rows, refundRows: refunds.rows, payoutRows: payouts.rows };
}

export async function listFinancialDocuments(client, { actorId, legalConfig = {} }) {
  const rows = await sourceRows(client, actorId);
  const drafts = buildFinancialDocumentDrafts({ actorId, ...rows, legalConfig });
  for (const draft of drafts) {
    const inserted = await client.query(
      `INSERT INTO financial_documents (
         booking_id, audience_user_id, document_type,
         payment_id, refund_id, payout_id, document_number, currency,
         amount_minor, private_rent_minor, sit_fee_minor, owner_payout_minor,
         rent_refund_minor, sit_fee_refund_minor, supplier_role, debtor_role,
         tax_treatment, test_mode, snapshot, content_html,
         artifact_sha256, issued_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
         $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21, $22
       ) ON CONFLICT DO NOTHING
       RETURNING id`,
      [
        draft.bookingId, draft.audienceUserId, draft.documentType,
        draft.paymentId, draft.refundId, draft.payoutId, draft.documentNumber,
        draft.currency, draft.amountMinor, draft.privateRentMinor,
        draft.sitFeeMinor, draft.ownerPayoutMinor, draft.rentRefundMinor,
        draft.sitFeeRefundMinor, draft.supplierRole, draft.debtorRole,
        draft.taxTreatment, draft.testMode, JSON.stringify(draft.snapshot),
        draft.contentHtml, draft.artifactSha256, draft.issuedAt,
      ],
    );
    if (inserted.rowCount) {
      await client.query(
        `INSERT INTO financial_document_events (
           document_id, actor_id, event_type, artifact_sha256,
           idempotency_key, metadata
         ) VALUES ($1, $2, 'generated', $3, $4, $5::jsonb)`,
        [
          inserted.rows[0].id, actorId, draft.artifactSha256,
          `financial-document:${inserted.rows[0].id}:generated`,
          JSON.stringify({ sourceKind: draft.sourceKind, sourceId: draft.sourceId }),
        ],
      );
    }
  }
  const result = await client.query(
    `SELECT id, booking_id, document_type, payment_id, refund_id, payout_id,
            document_number, currency, amount_minor, private_rent_minor,
            sit_fee_minor, owner_payout_minor, rent_refund_minor,
            sit_fee_refund_minor, supplier_role, debtor_role, tax_treatment,
            test_mode, snapshot, artifact_sha256, issued_at
       FROM financial_documents
      WHERE audience_user_id = $1
      ORDER BY issued_at DESC, id DESC`,
    [actorId],
  );
  return Object.freeze(result.rows.map(shape));
}

export async function getFinancialDocumentArtifact(client, { actorId, documentId }) {
  const id = text(documentId);
  if (!id || id.length > 160) {
    throw new FinancialDocumentError(400, 'financial_document_id_invalid');
  }
  const result = await client.query(
    `SELECT id, document_number, content_html, artifact_sha256
       FROM financial_documents
      WHERE id = $1 AND audience_user_id = $2`,
    [id, actorId],
  );
  if (!result.rowCount) {
    throw new FinancialDocumentError(404, 'financial_document_not_found');
  }
  const row = result.rows[0];
  const observedHash = crypto.createHash('sha256').update(row.content_html, 'utf8').digest('hex');
  if (observedHash !== row.artifact_sha256) {
    throw new FinancialDocumentError(409, 'financial_document_hash_mismatch');
  }
  await client.query(
    `INSERT INTO financial_document_events (
       document_id, actor_id, event_type, artifact_sha256,
       idempotency_key, metadata
     ) VALUES ($1, $2, 'downloaded', $3, $4, $5::jsonb)`,
    [
      row.id, actorId, row.artifact_sha256,
      `financial-document:${row.id}:download:${crypto.randomUUID()}`,
      JSON.stringify({ authenticatedDownload: true }),
    ],
  );
  return Object.freeze({
    documentNumber: row.document_number,
    contentHtml: row.content_html,
    artifactSha256: row.artifact_sha256,
  });
}
