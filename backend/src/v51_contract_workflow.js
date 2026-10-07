import crypto from 'node:crypto';

import { persistV51ContractReceipt } from './v51_contract_receipt.js';

export const v51ContractDocument = Object.freeze({
  name: 'ShareItToo Rechtsmappe Privat-Launch',
  version: 'V5.1-2026-08-16',
  locale: 'de',
});

export const v51CheckoutDeclarations = Object.freeze([
  Object.freeze({
    type: 'private_terms_and_platform_terms',
    wording: 'Ich handle bei dieser Buchung ausschließlich privat und akzeptiere die SIT-Plattformbedingungen sowie die Privat-Mietbedingungen einschließlich Storno-, Übergabe- und Schadenregeln.',
  }),
  Object.freeze({
    type: 'early_performance_and_withdrawal',
    wording: 'Ich verlange ausdrücklich, dass ShareItToo unmittelbar nach Abschluss des Plattformvertrags und vor Ablauf der 14-tägigen Widerrufsfrist mit der Plattformleistung beginnt. Mir ist bekannt, dass mein gesetzliches Widerrufsrecht erlischt, sobald SIT die vereinbarte Plattformleistung vollständig erbracht hat. Mein zusätzliches vertragliches 14-Tage-Lösungsrecht bleibt unberührt.',
  }),
]);

export class V51ContractWorkflowError extends Error {
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
  if (!normalized || normalized.length > max) throw new V51ContractWorkflowError(code);
  return normalized;
}

function requiredHash(value, code) {
  const normalized = requiredText(value, 64, code);
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new V51ContractWorkflowError(code);
  return normalized;
}

export function validateV51CheckoutDeclarations(raw, { now = new Date() } = {}) {
  if (!Array.isArray(raw) || raw.length !== v51CheckoutDeclarations.length) {
    throw new V51ContractWorkflowError('v51_exactly_two_declarations_required');
  }
  const acceptedByType = new Map();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new V51ContractWorkflowError('v51_declaration_invalid');
    }
    if (acceptedByType.has(entry.type)) {
      throw new V51ContractWorkflowError('v51_declaration_duplicate');
    }
    acceptedByType.set(entry.type, entry);
  }
  return v51CheckoutDeclarations.map((required) => {
    const entry = acceptedByType.get(required.type);
    const acceptedAt = new Date(entry?.acceptedAt);
    if (!entry
        || entry.exactWording !== required.wording
        || entry.documentName !== v51ContractDocument.name
        || entry.documentVersion !== v51ContractDocument.version
        || entry.language !== v51ContractDocument.locale
        || entry.accepted !== true
        || !Number.isFinite(acceptedAt.getTime())
        || acceptedAt.getTime() > now.getTime() + 300_000) {
      throw new V51ContractWorkflowError(`v51_declaration_invalid:${required.type}`);
    }
    return Object.freeze({
      type: required.type,
      exactWording: required.wording,
      wordingSha256: sha256(required.wording),
      acceptedAt,
    });
  });
}

export async function v51ContractDocumentReadiness(client, { at = new Date() } = {}) {
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
      ['platform_terms', 'private_rental_terms'],
      v51ContractDocument.version,
      v51ContractDocument.locale,
      at,
    ],
  );
  const byKey = new Map(result.rows.map((row) => [row.document_key, row]));
  const platformTerms = byKey.get('platform_terms');
  const privateRentalTerms = byKey.get('private_rental_terms');
  return Object.freeze({
    ready: Boolean(platformTerms && privateRentalTerms),
    platformTerms: platformTerms ?? null,
    privateRentalTerms: privateRentalTerms ?? null,
  });
}

export async function persistV51PlatformContract(client, {
  userId,
  bookingId,
  quoteId,
  quoteHash,
  clientBuild,
  declarations,
  idempotencyKey,
  acceptedAt = new Date(),
}) {
  const normalizedUserId = requiredText(userId, 160, 'v51_contract_user_required');
  const normalizedBookingId = requiredText(bookingId, 160, 'v51_contract_booking_required');
  const normalizedQuoteId = requiredText(quoteId, 160, 'v51_contract_quote_required');
  const normalizedQuoteHash = requiredHash(quoteHash, 'v51_contract_quote_hash_invalid');
  const normalizedBuild = requiredText(clientBuild, 120, 'v51_contract_build_required');
  const normalizedKey = requiredText(idempotencyKey, 240, 'v51_contract_idempotency_required');
  const contractAcceptedAt = new Date(acceptedAt);
  if (!Number.isFinite(contractAcceptedAt.getTime())) {
    throw new V51ContractWorkflowError('v51_contract_time_invalid');
  }
  const normalizedDeclarations = validateV51CheckoutDeclarations(declarations, {
    now: contractAcceptedAt,
  });
  const snapshots = await v51ContractDocumentReadiness(client, {
    at: contractAcceptedAt,
  });
  if (!snapshots.ready) {
    throw new V51ContractWorkflowError('v51_contract_documents_unavailable');
  }
  const contract = await client.query(
    `INSERT INTO platform_contracts (
       user_id, booking_id, quote_id, quote_hash, contract_version,
       platform_terms_snapshot_id, private_rental_terms_snapshot_id,
       locale, client_build, accepted_at, idempotency_key
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, accepted_at`,
    [
      normalizedUserId,
      normalizedBookingId,
      normalizedQuoteId,
      normalizedQuoteHash,
      v51ContractDocument.version,
      snapshots.platformTerms.id,
      snapshots.privateRentalTerms.id,
      v51ContractDocument.locale,
      normalizedBuild,
      contractAcceptedAt,
      normalizedKey,
    ],
  );
  const contractId = contract.rows[0]?.id;
  if (!contractId) throw new V51ContractWorkflowError('v51_contract_not_created');
  for (const declaration of normalizedDeclarations) {
    await client.query(
      `INSERT INTO platform_contract_declarations (
         contract_id, declaration_type, exact_wording, wording_sha256, accepted_at
       ) VALUES ($1, $2, $3, $4, $5)`,
      [
        contractId,
        declaration.type,
        declaration.exactWording,
        declaration.wordingSha256,
        declaration.acceptedAt,
      ],
    );
  }
  const receipt = await persistV51ContractReceipt(client, {
    contractId,
    bookingId: normalizedBookingId,
    quoteId: normalizedQuoteId,
    quoteHash: normalizedQuoteHash,
    contractVersion: v51ContractDocument.version,
    locale: v51ContractDocument.locale,
    clientBuild: normalizedBuild,
    acceptedAt: contractAcceptedAt,
    platformTerms: snapshots.platformTerms,
    privateRentalTerms: snapshots.privateRentalTerms,
    declarations: normalizedDeclarations,
    idempotencyKey: normalizedKey,
    generatedAt: contractAcceptedAt,
  });
  return Object.freeze({
    id: contractId,
    acceptedAt: new Date(contract.rows[0].accepted_at).toISOString(),
    contractVersion: v51ContractDocument.version,
    locale: v51ContractDocument.locale,
    documentHashes: Object.freeze({
      platformTerms: snapshots.platformTerms.content_sha256,
      privateRentalTerms: snapshots.privateRentalTerms.content_sha256,
    }),
    receipt,
  });
}
