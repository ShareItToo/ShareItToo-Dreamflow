import crypto from 'node:crypto';

export class V51ContractReceiptError extends Error {
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
  if (!normalized || normalized.length > max) throw new V51ContractReceiptError(code);
  return normalized;
}

function requiredHash(value, code) {
  const normalized = requiredText(value, 64, code);
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw new V51ContractReceiptError(code);
  return normalized;
}

function requiredContent(value, max, code) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new V51ContractReceiptError(code);
  }
  return value;
}

function iso(value, code) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new V51ContractReceiptError(code);
  return parsed.toISOString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderV51ContractReceipt({
  contractId,
  bookingId,
  quoteId,
  quoteHash,
  contractVersion,
  locale,
  clientBuild,
  acceptedAt,
  platformTerms,
  privateRentalTerms,
  documents,
  declarations,
  sitAcceptance,
}) {
  if (!Array.isArray(declarations) || declarations.length !== 2) {
    throw new V51ContractReceiptError('v51_receipt_declarations_invalid');
  }
  const acceptedIso = iso(acceptedAt, 'v51_receipt_acceptance_time_invalid');
  const rows = [
    ['Plattformvertrag', requiredText(contractId, 160, 'v51_receipt_contract_required')],
    ['Buchung', requiredText(bookingId, 160, 'v51_receipt_booking_required')],
    ['Angebot', requiredText(quoteId, 160, 'v51_receipt_quote_required')],
    ['Angebot-Hash', requiredHash(quoteHash, 'v51_receipt_quote_hash_invalid')],
    ['Vertragsversion', requiredText(contractVersion, 120, 'v51_receipt_version_required')],
    ['Sprache', requiredText(locale, 20, 'v51_receipt_locale_required')],
    ['Client-Build', requiredText(clientBuild, 120, 'v51_receipt_build_required')],
    ['SIT-Annahme', acceptedIso],
  ];
  const declarationHtml = declarations.map((entry) => {
    if (entry.documentReferences != null
        && (!Array.isArray(entry.documentReferences)
          || entry.documentReferences.length === 0
          || entry.documentReferences.length > 9)) {
      throw new V51ContractReceiptError('v51_receipt_references_invalid');
    }
    const referenceHtml = entry.documentReferences == null
      ? ''
      : `<h4>Gebundene Dokumente</h4><ul>${entry.documentReferences.map((reference) => (
        `<li>Teil ${escapeHtml(requiredText(reference.part, 8, 'v51_receipt_reference_part_required'))}: `
        + `${escapeHtml(requiredText(reference.documentKey, 120, 'v51_receipt_reference_key_required'))} `
        + `(${escapeHtml(requiredText(reference.documentVersion, 120, 'v51_receipt_reference_version_required'))})</li>`
      )).join('')}</ul>`;
    return `
    <section>
      <h3>${escapeHtml(requiredText(entry.type, 120, 'v51_receipt_declaration_type_required'))}</h3>
      <p>${escapeHtml(requiredText(entry.exactWording, 5000, 'v51_receipt_declaration_wording_required'))}</p>
      <dl>
        <dt>Text-Hash</dt><dd>${escapeHtml(requiredHash(entry.wordingSha256, 'v51_receipt_declaration_hash_invalid'))}</dd>
        <dt>Bestätigt</dt><dd>${escapeHtml(iso(entry.acceptedAt, 'v51_receipt_declaration_time_invalid'))}</dd>
      </dl>
      ${referenceHtml}
    </section>`;
  }).join('');
  const receiptDocuments = documents ?? [platformTerms, privateRentalTerms];
  if (!Array.isArray(receiptDocuments)
      || receiptDocuments.length < 2
      || receiptDocuments.length > 9) {
    throw new V51ContractReceiptError('v51_receipt_documents_invalid');
  }
  const documentKeys = new Set();
  const documentHtml = receiptDocuments.map((document) => {
    const documentKey = requiredText(
      document.document_key,
      120,
      'v51_receipt_document_key_required',
    );
    if (documentKeys.has(documentKey)) {
      throw new V51ContractReceiptError('v51_receipt_document_duplicate');
    }
    documentKeys.add(documentKey);
    return `
    <section>
      <h2>${escapeHtml(documentKey)}</h2>
      <dl>
        <dt>Version</dt><dd>${escapeHtml(requiredText(document.document_version, 120, 'v51_receipt_document_version_required'))}</dd>
        <dt>Inhalt-Hash</dt><dd>${escapeHtml(requiredHash(document.content_sha256, 'v51_receipt_document_hash_invalid'))}</dd>
      </dl>
      <pre>${escapeHtml(requiredContent(document.content_text, 1_000_000, 'v51_receipt_document_content_required'))}</pre>
    </section>`;
  }).join('');
  const sitAcceptanceHtml = sitAcceptance == null
    ? '<p>ShareItToo bestätigt die Annahme des SIT-Plattformvertrags zum unten genannten Zeitpunkt.</p>'
    : `<section>
      <h2>Ausdrückliche SIT-Annahme</h2>
      <p>${escapeHtml(requiredText(sitAcceptance.wording, 5000, 'v51_receipt_sit_acceptance_required'))}</p>
      <dl>
        <dt>Text-Hash</dt><dd>${escapeHtml(requiredHash(sitAcceptance.wordingSha256, 'v51_receipt_sit_acceptance_hash_invalid'))}</dd>
        <dt>Angenommen</dt><dd>${escapeHtml(iso(sitAcceptance.acceptedAt, 'v51_receipt_sit_acceptance_time_invalid'))}</dd>
      </dl>
    </section>`;
  const details = rows.map(([label, value]) => (
    `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`
  )).join('');
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ShareItToo Vertragsbestätigung</title>
</head>
<body>
  <main>
    <h1>ShareItToo Vertragsbestätigung</h1>
    ${sitAcceptanceHtml}
    <dl>${details}</dl>
    <h2>Ausdrückliche Erklärungen</h2>${declarationHtml}
    <h2>Vertragsdokumente</h2>${documentHtml}
  </main>
</body>
</html>`;
}

export async function persistV51ContractReceipt(client, input) {
  const contentHtml = renderV51ContractReceipt(input);
  const artifactSha256 = sha256(contentHtml);
  const generatedAt = new Date(input.generatedAt);
  if (!Number.isFinite(generatedAt.getTime())) {
    throw new V51ContractReceiptError('v51_receipt_time_invalid');
  }
  const inserted = await client.query(
    `INSERT INTO platform_contract_receipts (
       contract_id, artifact_format, content_html, artifact_sha256,
       generated_at, idempotency_key
     ) VALUES ($1, 'html', $2, $3, $4, $5)
     RETURNING id, generated_at`,
    [
      input.contractId,
      contentHtml,
      artifactSha256,
      generatedAt,
      `${input.idempotencyKey}:artifact`,
    ],
  );
  const receiptId = inserted.rows[0]?.id;
  if (!receiptId) throw new V51ContractReceiptError('v51_receipt_not_created');
  const artifactReference = `db:platform-contract-receipts/${receiptId}`;
  for (const [eventType, suffix] of [
    ['generated', 'generated'],
    ['delivery_attempted', 'in-app-available'],
  ]) {
    await client.query(
      `INSERT INTO platform_contract_receipt_events (
         contract_id, event_type, artifact_format, artifact_sha256,
         artifact_reference, delivery_channel, occurred_at,
         idempotency_key, metadata
       ) VALUES ($1, $2, 'html', $3, $4, 'in_app', $5, $6, $7::jsonb)`,
      [
        input.contractId,
        eventType,
        artifactSha256,
        artifactReference,
        generatedAt,
        `${input.idempotencyKey}:${suffix}`,
        JSON.stringify({ availability: 'authenticated_download' }),
      ],
    );
  }
  return Object.freeze({
    id: receiptId,
    artifactFormat: 'html',
    artifactSha256,
    generatedAt: new Date(inserted.rows[0].generated_at).toISOString(),
    downloadPath: `/v1/platform-contracts/${encodeURIComponent(input.contractId)}/receipt`,
  });
}

export async function getV51ContractReceipt(client, {
  userId,
  contractId,
  deliveredAt = new Date(),
}) {
  const result = await client.query(
    `SELECT receipt.id, receipt.contract_id, receipt.content_html,
            receipt.artifact_sha256
       FROM platform_contract_receipts AS receipt
       JOIN platform_contracts AS contract ON contract.id = receipt.contract_id
      WHERE receipt.contract_id = $1 AND contract.user_id = $2`,
    [contractId, userId],
  );
  const receipt = result.rows[0];
  if (!receipt) throw new V51ContractReceiptError('v51_receipt_not_found');
  const observedHash = sha256(receipt.content_html);
  if (observedHash !== receipt.artifact_sha256) {
    throw new V51ContractReceiptError('v51_receipt_integrity_failed');
  }
  await client.query(
    `INSERT INTO platform_contract_receipt_events (
       contract_id, event_type, artifact_format, artifact_sha256,
       artifact_reference, delivery_channel, occurred_at,
       idempotency_key, metadata
     ) VALUES ($1, 'delivered', 'html', $2, $3, 'download', $4, $5, $6::jsonb)
     ON CONFLICT (idempotency_key) DO NOTHING`,
    [
      contractId,
      receipt.artifact_sha256,
      `db:platform-contract-receipts/${receipt.id}`,
      deliveredAt,
      `${contractId}:receipt:first-download`,
      JSON.stringify({ authenticated: true }),
    ],
  );
  return Object.freeze({
    contentHtml: receipt.content_html,
    artifactSha256: receipt.artifact_sha256,
  });
}
