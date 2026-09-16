import {
  validateV52CheckoutDeclarations,
  v52CheckoutDeclarations,
  v52ContractDocument,
  V52ContractWorkflowError,
} from './v52_contract_workflow.js';

export const privatePilotDocument = Object.freeze({
  name: 'ShareItToo Rechtsmappe Privat-Launch',
  version: 'V5.1-2026-08-16',
  language: 'de',
});

export const privatePilotInterimPolicy = Object.freeze({
  version: 'V5.1-2026-08-16',
  scope: 'internal-and-closed-testing-only',
  active: true,
  realPaymentsEnabled: false,
  replaceOnUserInstruction: true,
});

export const privatePilotOpenDecisions = Object.freeze([
  Object.freeze({
    id: 'platform_contract_and_withdrawal_timing',
    status: 'superseded_by_v51',
    interimRule: 'v51_exact_two_declarations_at_binding_booking_request',
    updateAuthority: 'v51_part_a_11_13_and_implementation_2_5',
    blocksLiveActivation: true,
    activeForInternalTesting: true,
  }),
  Object.freeze({
    id: 'withdrawal_effect_on_private_rental',
    status: 'superseded_by_v51',
    interimRule: 'v51_14_day_before_after_handover_effects_later_rights_review',
    updateAuthority: 'v51_part_a_13_and_implementation_5',
    blocksLiveActivation: true,
    activeForInternalTesting: true,
  }),
  Object.freeze({
    id: 'cancellation_50_100_or_30_50',
    status: 'superseded_by_v51',
    interimRule: 'v51_24h_50_percent_60min_and_actual_loss_after_start',
    updateAuthority: 'v51_part_c_and_implementation_6',
    blocksLiveActivation: true,
    activeForInternalTesting: true,
  }),
  Object.freeze({
    id: 'marketplace_psp_mechanics',
    status: 'superseded_by_v51',
    interimRule: 'licensed_marketplace_psp_test_only_until_evidenced',
    updateAuthority: 'v51_part_e_and_psp_contract_acceptance',
    blocksLiveActivation: true,
    activeForInternalTesting: true,
  }),
  Object.freeze({
    id: 'missing_return_confirmation_window',
    status: 'superseded_by_v51',
    interimRule: 'awaiting_return_confirmation_until_t0_plus_5_calendar_days',
    updateAuthority: 'v51_part_e_2',
    blocksLiveActivation: false,
    activeForInternalTesting: true,
  }),
  Object.freeze({
    id: 'handover_photo_workflow',
    status: 'superseded_by_v51',
    interimRule: 'four_handover_party_photos_plus_counterparty_confirmation_or_deviation_photo',
    updateAuthority: 'v51_part_d_2_and_implementation_9',
    blocksLiveActivation: false,
    activeForInternalTesting: true,
  }),
]);

export const privatePilotDeclarations = Object.freeze({
  account: 'Ich bin mindestens 18 Jahre alt, handle als natuerliche Person und nutze ShareItToo im Privat-Pilot ausschliesslich privat.',
  listing: 'Ich biete diesen Gegenstand als Privatperson an, bin zur Vermietung berechtigt und handle weder gewerblich noch beruflich.',
  booking: 'Ich buche als Privatperson fuer private Zwecke und akzeptiere, dass ShareItToo keine Kaution, Versicherung oder Schadengarantie anbietet.',
  bindingBookingRequest: 'Ich gebe eine verbindliche zahlungspflichtige Buchungsanfrage zu den angezeigten Daten, Preisen und Dokumentversionen ab.',
  platformTerms: 'Ich akzeptiere die Plattform-Nutzungsbedingungen und den angezeigten Plattformbeitrag.',
  earlyPerformance: 'Ich verlange, dass ShareItToo vor Ablauf der Widerrufsfrist mit der Vermittlung und technischen Buchungsbestätigung beginnt.',
  withdrawalKnowledge: 'Mir ist bekannt, dass mein Widerrufsrecht bei vollständiger Vertragserfüllung unter den gesetzlichen Voraussetzungen erlöschen kann.',
  ownerAcceptance: 'Ich nehme die zahlungspflichtige Buchungsanfrage zu den angezeigten Bedingungen und Dokumentversionen an.',
  platformWithdrawal: 'Ich widerrufe die kostenpflichtige Plattformleistung von ShareItToo für die ausgewählte Buchung.',
});

export const privatePilotCheckoutDocument = v52ContractDocument;
export const privatePilotRequiredCheckoutDeclarations = v52CheckoutDeclarations;

export const privatePilotAllowedCategoryIds = Object.freeze(new Set([
  'cat1', 'cat2', 'cat3', 'cat4', 'cat5', 'cat6', 'cat7', 'cat8',
  'cat12', 'cat14', 'cat15', 'cat16', 'cat17', 'cat20', 'cat22', 'cat23',
]));

export const privatePilotAllowedSubcategories = Object.freeze({
  cat1: Object.freeze(['Smartphones', 'Tablets', 'Wearables', 'Audio', 'Zubehör']),
  cat2: Object.freeze(['Laptops', 'Desktops', 'Monitore', 'Drucker', 'Netzwerk']),
  cat3: Object.freeze(['Kameras', 'Objektive', 'Stative', 'Licht']),
  cat4: Object.freeze(['Konsolen', 'Gaming-PC', 'VR', 'Lenkräder', 'Retro']),
  cat5: Object.freeze(['Staubsauger', 'Mixer', 'Kaffeemaschinen', 'Waschmaschinen', 'Trockner']),
  cat6: Object.freeze(['Sofas', 'Tische', 'Stühle', 'Beleuchtung', 'Deko']),
  cat7: Object.freeze(['Rasenmäher', 'Heckenscheren', 'Gartengeräte', 'Bewässerung', 'Pflanzkisten']),
  cat8: Object.freeze(['Handwerkzeuge', 'Elektrowerkzeuge', 'Bohrmaschinen', 'Sägen', 'Schleifer']),
  cat12: Object.freeze(['Kleidung', 'Taschen', 'Schuhe', 'Schmuck', 'Uhren']),
  cat14: Object.freeze(['Gitarren', 'Tastaturen', 'Schlagzeug', 'Blasinstrumente', 'Studio']),
  cat15: Object.freeze(['Bücher', 'Filme', 'Spiele', 'Hörbücher', 'Magazine']),
  cat16: Object.freeze(['Ringe', 'Ketten', 'Uhren', 'Ohrringe', 'Sets']),
  cat17: Object.freeze(['Gemälde', 'Skulpturen', 'Drucke', 'Figuren', 'Seltenes']),
  cat20: Object.freeze(['Bürotechnik', 'Präsentation', 'Werkstatt', 'Lager', 'Zubehör']),
  cat22: Object.freeze(['Party-Deko', 'Eventtechnik', 'Tische & Stühle', 'Pavillons', 'Buffet & Catering']),
  cat23: Object.freeze(['Zelte', 'Schlafsäcke', 'Rucksäcke & Koffer', 'Campingküche', 'Outdoor-Zubehör']),
});

export const privatePilotAllowedCatalogKeys = Object.freeze(
  Object.entries(privatePilotAllowedSubcategories).flatMap(([categoryId, subcategories]) => (
    subcategories.map((subcategory) => `${categoryId}\u001f${subcategory}`)
  )),
);

export function normalizePrivatePilotRegion(value) {
  return typeof value === 'string'
    ? value.trim().normalize('NFKC').toLocaleLowerCase('de-DE').replace(/\s+/gu, ' ')
    : '';
}

function allowedRegionSet(values) {
  const source = values instanceof Set ? [...values] : (Array.isArray(values) ? values : []);
  return new Set(source.map(normalizePrivatePilotRegion).filter(Boolean));
}

export function privatePilotCatalogKey(categoryId, subcategory) {
  return `${String(categoryId ?? '').trim()}\u001f${String(subcategory ?? '').trim()}`;
}

export function assertPrivatePilotCatalogEntry(raw, { allowedRegions = [] } = {}) {
  const categoryId = String(raw?.categoryId ?? '').trim();
  if (!privatePilotAllowedCategoryIds.has(categoryId)) {
    throw new PrivatePilotValidationError('private_pilot_category_not_allowed');
  }
  if (!privatePilotAllowedCatalogKeys.includes(
    privatePilotCatalogKey(categoryId, raw?.subcategory),
  )) {
    throw new PrivatePilotValidationError('private_pilot_subcategory_not_allowed');
  }
  const country = String(raw?.country ?? '').trim().toLowerCase();
  if (!['de', 'deutschland', 'germany'].includes(country)) {
    throw new PrivatePilotValidationError('private_pilot_country_not_allowed');
  }
  const regionCode = normalizePrivatePilotRegion(raw?.city);
  if (!regionCode || !allowedRegionSet(allowedRegions).has(regionCode)) {
    throw new PrivatePilotValidationError('private_pilot_region_not_allowed');
  }
  return Object.freeze({ categoryId, regionCode });
}

export function assertPrivatePilotAccountState(raw) {
  if (!raw?.privateUseConfirmedAt) {
    throw new PrivatePilotValidationError('private_pilot_account_declaration_required');
  }
  if (String(raw?.privateMarketplaceReviewStatus ?? 'clear') !== 'clear') {
    throw new PrivatePilotValidationError('private_pilot_commercial_review_blocked');
  }
  return true;
}

export function assertPrivatePilotStoredListing(raw, { allowedRegions = [] } = {}) {
  assertPrivatePilotAccountState({
    privateUseConfirmedAt: raw?.ownerPrivateUseConfirmedAt,
    privateMarketplaceReviewStatus: raw?.ownerPrivateMarketplaceReviewStatus,
  });
  if (!raw?.privateStatusConfirmedAt) {
    throw new PrivatePilotValidationError('private_pilot_listing_declaration_required');
  }
  const { regionCode } = assertPrivatePilotCatalogEntry(raw, { allowedRegions });
  if (String(raw?.pilotRegionCode ?? '') !== regionCode) {
    throw new PrivatePilotValidationError('private_pilot_listing_region_unbound');
  }
  return true;
}

export class PrivatePilotValidationError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function assertPrivatePilotListing(raw, { allowedRegions = [] } = {}) {
  if (raw?.privateStatusConfirmed !== true) {
    throw new PrivatePilotValidationError('private_status_confirmation_required');
  }
  assertPrivatePilotCatalogEntry(raw, { allowedRegions });
  if (raw?.offersDeliveryAtDropoff === true
      || raw?.offersPickupAtReturn === true
      || raw?.offersExpressAtDropoff === true
      || raw?.maxDeliveryKmAtDropoff != null
      || raw?.maxPickupKmAtReturn != null) {
    throw new PrivatePilotValidationError('private_pilot_delivery_disabled');
  }
  return true;
}

export function privatePilotListingFields(raw, { allowedRegions = [] } = {}) {
  const { regionCode } = assertPrivatePilotCatalogEntry(raw, { allowedRegions });
  return Object.freeze({
    privateStatusConfirmed: raw?.privateStatusConfirmed === true,
    pilotRegionCode: regionCode,
    offersDeliveryAtDropoff: false,
    offersPickupAtReturn: false,
    offersExpressAtDropoff: false,
    maxDeliveryKmAtDropoff: null,
    maxPickupKmAtReturn: null,
    handoverRadiusKm: null,
  });
}

export function assertPrivatePilotBooking(raw, { requireDeclaration = true } = {}) {
  if (requireDeclaration && raw?.privateStatusConfirmed !== true) {
    throw new PrivatePilotValidationError('private_status_confirmation_required');
  }
  if (raw?.ownerDeliversAtDropoffChosen === true
      || raw?.ownerPicksUpAtReturnChosen === true
      || raw?.expressRequested === true
      || raw?.deliveryAddressLine != null
      || raw?.returnAddressLine != null) {
    throw new PrivatePilotValidationError('private_pilot_delivery_disabled');
  }
  if (requireDeclaration) {
    try {
      validateV52CheckoutDeclarations(raw?.legalDeclarations);
    } catch (error) {
      if (error instanceof V52ContractWorkflowError) {
        throw new PrivatePilotValidationError(error.code);
      }
      throw error;
    }
  }
  return true;
}

export function assertPrivatePilotOwnerAcceptance(raw) {
  const declarations = Array.isArray(raw?.legalDeclarations)
    ? raw.legalDeclarations
    : [];
  const match = declarations.find((entry) => (
    entry?.type === 'owner_booking_acceptance'
    && entry?.exactWording === privatePilotDeclarations.ownerAcceptance
    && entry?.documentName === privatePilotDocument.name
    && entry?.documentVersion === privatePilotDocument.version
    && entry?.language === privatePilotDocument.language
    && entry?.accepted === true
    && Number.isFinite(Date.parse(entry?.acceptedAt))
  ));
  if (!match) {
    throw new PrivatePilotValidationError(
      'private_pilot_declaration_missing:owner_booking_acceptance',
    );
  }
  return match;
}
