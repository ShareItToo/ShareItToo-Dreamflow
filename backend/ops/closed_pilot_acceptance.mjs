import {
  privatePilotCheckoutDocument,
  privatePilotDeclarations,
  privatePilotDocument,
  privatePilotRequiredCheckoutDeclarations,
} from '../src/private_pilot_domain.js';
import { v52ContractDocumentReadiness } from '../src/v52_contract_workflow.js';

export const closedPilotLocation = Object.freeze({
  locationText: 'Staging Testadresse Heilbronn',
  city: 'Heilbronn',
  country: 'Deutschland',
  lat: 49.1427,
  lng: 9.2109,
});

export const closedPilotListingCategory = Object.freeze({
  categoryId: 'cat3',
  subcategory: 'Kameras',
});

function acceptanceClientBuild() {
  const value = process.env.ACCEPTANCE_CLIENT_BUILD?.trim() ?? '';
  if (!/^1\.0\.0\+[1-9][0-9]{9}$/u.test(value)) {
    throw new Error('ACCEPTANCE_CLIENT_BUILD must bind the exact closed-pilot Android candidate.');
  }
  return value;
}

export async function assertClosedPilotLegalReadiness(database) {
  const readiness = await v52ContractDocumentReadiness(database);
  if (!readiness.ready) {
    throw new Error('closed_pilot_v52_legal_snapshots_not_ready');
  }
  return readiness;
}

export function closedPilotQuoteBody({ itemId, startDate, endDate }) {
  return {
    itemId,
    startDate,
    endDate,
    privateStatusConfirmed: true,
  };
}

export function closedPilotBookingBody({ id, itemId, startDate, endDate, quote }) {
  const clientBuild = acceptanceClientBuild();
  const acceptedAt = new Date().toISOString();
  return {
    id,
    ...closedPilotQuoteBody({ itemId, startDate, endDate }),
    quoteId: quote.quoteId,
    quoteHash: quote.quoteHash,
    clientBuild,
    legalDeclarations: privatePilotRequiredCheckoutDeclarations.map((entry) => ({
      type: entry.type,
      exactWording: entry.wording,
      documentName: privatePilotCheckoutDocument.name,
      documentVersion: privatePilotCheckoutDocument.version,
      language: privatePilotCheckoutDocument.locale,
      clientBuild,
      quoteId: quote.quoteId,
      quoteHash: quote.quoteHash,
      documentReferences: entry.documentReferences.map((reference) => ({ ...reference })),
      accepted: true,
      acceptedAt,
    })),
  };
}

export function closedPilotOwnerAcceptanceBody() {
  return {
    status: 'accepted',
    legalDeclarations: [{
      type: 'owner_booking_acceptance',
      exactWording: privatePilotDeclarations.ownerAcceptance,
      documentName: privatePilotDocument.name,
      documentVersion: privatePilotDocument.version,
      language: privatePilotDocument.language,
      accepted: true,
      acceptedAt: new Date().toISOString(),
    }],
  };
}
