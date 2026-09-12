import crypto from 'node:crypto';

import { persistV51ContractReceipt } from './v51_contract_receipt.js';

export const v52ContractDocument = Object.freeze({
  name: 'ShareItToo Rechtsmappe Privat-Launch V5.2',
  version: 'V5.2-2026-08-16',
  locale: 'de',
});

export const v52ContractDocuments = Object.freeze([
  Object.freeze({ part: 'A', key: 'platform_terms' }),
  Object.freeze({ part: 'B', key: 'private_rental_terms' }),
  Object.freeze({ part: 'C', key: 'cancellation_refund' }),
  Object.freeze({ part: 'D', key: 'handover_return_damage' }),
  Object.freeze({ part: 'E', key: 'payment_payout' }),
  Object.freeze({ part: 'F', key: 'community_safety' }),
  Object.freeze({ part: 'G', key: 'reporting_moderation_review' }),
  Object.freeze({ part: 'H', key: 'privacy' }),
  Object.freeze({ part: 'I', key: 'imprint_withdrawal_shorttexts' }),
]);

function reference(part, documentKey) {
  return Object.freeze({
    part,
    documentKey,
    documentVersion: v52ContractDocument.version,
  });
}

export const v52CheckoutDeclarations = Object.freeze([
  Object.freeze({
    type: 'private_terms_and_platform_terms',
    wording: `Ich handle bei dieser Buchung ausschließlich privat und akzeptiere die SIT-Plattformbedingungen [Teil A, Version ${v52ContractDocument.version}] sowie die Privat-Mietbedingungen einschließlich Storno-, Übergabe- und Schadenregeln [Teile B-D, Version ${v52ContractDocument.version}].`,
    documentReferences: Object.freeze([
      reference('A', 'platform_terms'),
      reference('B', 'private_rental_terms'),
      reference('C', 'cancellation_refund'),
      reference('D', 'handover_return_damage'),
    ]),
  }),
  Object.freeze({
    type: 'early_performance_and_withdrawal',
    wording: 'Ich verlange ausdrücklich, dass ShareItToo unmittelbar nach Abschluss des Plattformvertrags und vor Ablauf der 14-tägigen Widerrufsfrist mit der Plattformleistung beginnt. Mir ist bekannt, dass mein gesetzliches Widerrufsrecht erlischt, sobald SIT die vereinbarte Plattformleistung vollständig erbracht hat. Mein zusätzliches vertragliches 14-Tage-Lösungsrecht bleibt unberührt.',
    documentReferences: Object.freeze([
      reference('A', 'platform_terms'),
      reference('I', 'imprint_withdrawal_shorttexts'),
    ]),
  }),
]);

export const v52SitAcceptance = Object.freeze({
  type: 'automated_platform_contract_acceptance',
  wording: 'ShareItToo nimmt dein Angebot auf die buchungsbezogene Plattformleistung unmittelbar automatisiert und ausdrücklich an. Der SIT-Plattformvertrag ist damit geschlossen.',
});

export class V52ContractWorkflowError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function requiredText(value, max, code) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > max) throw new V52ContractWorkflowError(code);
  return normalized;
}

function requiredHash(value, code) {
  const normalized = requiredText(value, 64, code);
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new V52ContractWorkflowError(code);
  return normalized;
}

function time(value, code) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new V52ContractWorkflowError(code);
  return parsed;
}

function sameReferences(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((entry, index) => {
      const required = expected[index];
      return entry
        && typeof entry === 'object'
        && !Array.isArray(entry)
        && entry.part === required.part
        && entry.documentKey === required.documentKey
        && entry.documentVersion === required.documentVersion
        && Object.keys(entry).length === 3;
    });
}

export function validateV52CheckoutDeclarations(raw, {
  now = new Date(),
  quoteId,
  quoteHash,
  quoteIssuedAt,
  quoteExpiresAt,
  clientBuild,
} = {}) {
  if (!Array.isArray(raw) || raw.length !== v52CheckoutDeclarations.length) {
    throw new V52ContractWorkflowError('v52_exactly_two_declarations_required');
  }
  const expectedQuoteId = quoteId == null
    ? null
    : requiredText(quoteId, 160, 'v52_declaration_quote_required');
  const expectedQuoteHash = quoteHash == null
    ? null
    : requiredHash(quoteHash, 'v52_declaration_quote_hash_invalid');
  const expectedBuild = clientBuild == null
    ? null
    : requiredText(clientBuild, 120, 'v52_declaration_build_required');
  const issuedAt = quoteIssuedAt == null ? null : time(
    quoteIssuedAt,
    'v52_declaration_quote_issued_at_invalid',
  );
  const expiresAt = quoteExpiresAt == null ? null : time(
    quoteExpiresAt,
    'v52_declaration_quote_expires_at_invalid',
  );
  const acceptedByType = new Map();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new V52ContractWorkflowError('v52_declaration_invalid');
    }
    if (acceptedByType.has(entry.type)) {
      throw new V52ContractWorkflowError('v52_declaration_duplicate');
    }
    acceptedByType.set(entry.type, entry);
  }
  return v52CheckoutDeclarations.map((required) => {
    const entry = acceptedByType.get(required.type);
    const acceptedAt = time(
      entry?.acceptedAt,
      `v52_declaration_invalid:${required.type}`,
    );
    const entryQuoteId = requiredText(
      entry?.quoteId,
      160,
      `v52_declaration_invalid:${required.type}`,
    );
    const entryQuoteHash = requiredHash(
      entry?.quoteHash,
      `v52_declaration_invalid:${required.type}`,
    );
    const entryBuild = requiredText(
      entry?.clientBuild,
      120,
      `v52_declaration_invalid:${required.type}`,
    );
    if (!entry
        || entry.exactWording !== required.wording
        || entry.documentName !== v52ContractDocument.name
        || entry.documentVersion !== v52ContractDocument.version
        || entry.language !== v52ContractDocument.locale
        || entry.accepted !== true
        || entryQuoteId !== (expectedQuoteId ?? entryQuoteId)
        || entryQuoteHash !== (expectedQuoteHash ?? entryQuoteHash)
        || entryBuild !== (expectedBuild ?? entryBuild)
        || !sameReferences(entry.documentReferences, required.documentReferences)
        || acceptedAt.getTime() > now.getTime() + 300_000
        || (issuedAt && acceptedAt.getTime() < issuedAt.getTime())
        || (expiresAt && acceptedAt.getTime() >= expiresAt.getTime())) {
      throw new V52ContractWorkflowError(`v52_declaration_invalid:${required.type}`);
    }
    return Object.freeze({
      type: required.type,
      exactWording: required.wording,
      wordingSha256: sha256(required.wording),
      acceptedAt,
      quoteId: entryQuoteId,
      quoteHash: entryQuoteHash,
      clientBuild: entryBuild,
      documentReferences: required.documentReferences,
    });
  });
}

export async function v52ContractDocumentReadiness(client, { at = new Date() } = {}) {
  const result = await client.query(
    `SELECT DISTINCT ON (document_key)
            id, document_key, document_version, content_type,
            content_text, content_sha256
       FROM legal_document_snapshots
      WHERE document_key = ANY($1::text[])
        AND document_version = $2
        AND locale = $3
        AND effective_at <= $4
      ORDER BY document_key, effective_at DESC, created_at DESC`,
    [
      v52ContractDocuments.map((entry) => entry.key),
      v52ContractDocument.version,
      v52ContractDocument.locale,
      at,
    ],
  );
  const verifiedRows = result.rows.filter((row) => (
    typeof row.content_text === 'string'
    && /^[0-9a-f]{64}$/.test(row.content_sha256 ?? '')
    && sha256(row.content_text) === row.content_sha256
  ));
  const byKey = new Map(verifiedRows.map((row) => [row.document_key, row]));
  const documents = v52ContractDocuments.map((entry) => byKey.get(entry.key) ?? null);
  return Object.freeze({
    ready: documents.every(Boolean),
    documents: Object.freeze(documents),
    byKey,
  });
}

export async function persistV52PlatformContract(client, {
  userId,
  bookingId,
  quoteId,
  quoteHash,
  quoteIssuedAt,
  quoteExpiresAt,
  clientBuild,
  declarations,
  idempotencyKey,
  acceptedAt = new Date(),
}) {
  const normalizedUserId = requiredText(userId, 160, 'v52_contract_user_required');
  const normalizedBookingId = requiredText(bookingId, 160, 'v52_contract_booking_required');
  const normalizedQuoteId = requiredText(quoteId, 160, 'v52_contract_quote_required');
  const normalizedQuoteHash = requiredHash(quoteHash, 'v52_contract_quote_hash_invalid');
  const normalizedBuild = requiredText(clientBuild, 120, 'v52_contract_build_required');
  const normalizedKey = requiredText(idempotencyKey, 240, 'v52_contract_idempotency_required');
  const contractAcceptedAt = time(acceptedAt, 'v52_contract_time_invalid');
  const normalizedDeclarations = validateV52CheckoutDeclarations(declarations, {
    now: contractAcceptedAt,
    quoteId: normalizedQuoteId,
    quoteHash: normalizedQuoteHash,
    quoteIssuedAt,
    quoteExpiresAt,
    clientBuild: normalizedBuild,
  });
  const snapshots = await v52ContractDocumentReadiness(client, {
    at: contractAcceptedAt,
  });
  if (!snapshots.ready) {
    throw new V52ContractWorkflowError('v52_contract_documents_unavailable');
  }
  const contractId = crypto.randomUUID();
  for (const declaration of normalizedDeclarations) {
    await client.query(
      `INSERT INTO platform_contract_declarations (
         contract_id, declaration_type, exact_wording, wording_sha256,
         accepted_at, user_id, booking_id, document_version, locale,
         client_build, quote_id, quote_hash, document_references
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
      [
        contractId,
        declaration.type,
        declaration.exactWording,
        declaration.wordingSha256,
        declaration.acceptedAt,
        normalizedUserId,
        normalizedBookingId,
        v52ContractDocument.version,
        v52ContractDocument.locale,
        normalizedBuild,
        normalizedQuoteId,
        normalizedQuoteHash,
        JSON.stringify(declaration.documentReferences),
      ],
    );
  }
  const documents = Object.fromEntries(
    v52ContractDocuments.map((entry, index) => [entry.key, snapshots.documents[index]]),
  );
  const acceptance = Object.freeze({
    type: v52SitAcceptance.type,
    wording: v52SitAcceptance.wording,
    wordingSha256: sha256(v52SitAcceptance.wording),
    acceptedAt: contractAcceptedAt,
  });
  const contract = await client.query(
    `INSERT INTO platform_contracts (
       id, user_id, booking_id, quote_id, quote_hash, contract_version,
       platform_terms_snapshot_id, private_rental_terms_snapshot_id,
       cancellation_refund_snapshot_id, handover_return_damage_snapshot_id,
       payment_payout_snapshot_id, community_safety_snapshot_id,
       reporting_moderation_review_snapshot_id, privacy_snapshot_id,
       imprint_withdrawal_shorttexts_snapshot_id, sit_acceptance_wording,
       sit_acceptance_sha256, locale, client_build, accepted_at, idempotency_key
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19, $20, $21
     ) RETURNING id, accepted_at`,
    [
      contractId,
      normalizedUserId,
      normalizedBookingId,
      normalizedQuoteId,
      normalizedQuoteHash,
      v52ContractDocument.version,
      documents.platform_terms.id,
      documents.private_rental_terms.id,
      documents.cancellation_refund.id,
      documents.handover_return_damage.id,
      documents.payment_payout.id,
      documents.community_safety.id,
      documents.reporting_moderation_review.id,
      documents.privacy.id,
      documents.imprint_withdrawal_shorttexts.id,
      acceptance.wording,
      acceptance.wordingSha256,
      v52ContractDocument.locale,
      normalizedBuild,
      contractAcceptedAt,
      normalizedKey,
    ],
  );
  if (contract.rows[0]?.id !== contractId) {
    throw new V52ContractWorkflowError('v52_contract_not_created');
  }
  const receipt = await persistV51ContractReceipt(client, {
    contractId,
    bookingId: normalizedBookingId,
    quoteId: normalizedQuoteId,
    quoteHash: normalizedQuoteHash,
    contractVersion: v52ContractDocument.version,
    locale: v52ContractDocument.locale,
    clientBuild: normalizedBuild,
    acceptedAt: contractAcceptedAt,
    documents: snapshots.documents,
    declarations: normalizedDeclarations,
    sitAcceptance: acceptance,
    idempotencyKey: normalizedKey,
    generatedAt: contractAcceptedAt,
  });
  return Object.freeze({
    id: contractId,
    state: 'platformContractAccepted',
    acceptedAt: new Date(contract.rows[0].accepted_at).toISOString(),
    contractVersion: v52ContractDocument.version,
    locale: v52ContractDocument.locale,
    sitAcceptance: Object.freeze({
      ...acceptance,
      acceptedAt: contractAcceptedAt.toISOString(),
    }),
    documentHashes: Object.freeze(Object.fromEntries(
      v52ContractDocuments.map((entry, index) => [
        entry.key,
        snapshots.documents[index].content_sha256,
      ]),
    )),
    receipt: Object.freeze({
      ...receipt,
      deliveryStatus: 'authenticated_in_app_available',
    }),
  });
}
