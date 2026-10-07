import crypto from 'node:crypto';

import { privatePilotAllowedCatalogKeys } from './private_pilot_domain.js';

export const listingSupplyEnrichmentVersion = 'G5A-2026-08-21.1';
export const listingSupplyHeuristicVersion = 'G5A-CATEGORY-TEMPLATES-1';

const MAX_SUGGESTIONS = 3;
const outcomeIds = Object.freeze([
  'included_accessory',
  'separate_rental',
  'standalone_listing',
  'not_part',
  'wrong_detection',
]);
const followUpOutcomes = new Set(['separate_rental', 'standalone_listing']);

export class ListingSupplyEnrichmentError extends Error {
  constructor(status, code, details = undefined) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function object(value, code = 'invalid_listing_supply_enrichment_payload') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ListingSupplyEnrichmentError(400, code);
  }
  return { ...value };
}

function text(value, maximum = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function identifier(value, code) {
  const candidate = text(value, 120);
  if (!/^[A-Za-z0-9_.:-]{8,120}$/u.test(candidate)) {
    throw new ListingSupplyEnrichmentError(400, code);
  }
  return candidate;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function catalogKey(categoryId, subcategory) {
  return `${categoryId}\u001f${subcategory}`;
}

function suggestion(key, label, categoryId, subcategory, projectTag) {
  if (!/^[a-z][a-z0-9_]{2,59}$/u.test(key)
      || typeof label !== 'string' || label.length < 3 || label.length > 120
      || !privatePilotAllowedCatalogKeys.includes(catalogKey(categoryId, subcategory))
      || !/^[a-z][a-z0-9_]{2,39}$/u.test(projectTag)) {
    throw new Error('invalid_listing_supply_heuristic');
  }
  return Object.freeze({ key, label, categoryId, subcategory, projectTag });
}

const heuristicTemplates = Object.freeze({
  [catalogKey('cat8', 'Bohrmaschinen')]: Object.freeze([
    suggestion('drill_hand_tools', 'Passende Handwerkzeuge', 'cat8', 'Handwerkzeuge', 'renovation'),
    suggestion('drill_workshop_support', 'Werkstatt-Unterstützung', 'cat20', 'Werkstatt', 'renovation'),
    suggestion('drill_dust_collection', 'Geeignete Staubabsaugung', 'cat5', 'Staubsauger', 'renovation'),
  ]),
  [catalogKey('cat8', 'Schleifer')]: Object.freeze([
    suggestion('sander_dust_collection', 'Geeignete Staubabsaugung', 'cat5', 'Staubsauger', 'renovation'),
    suggestion('sander_hand_tools', 'Passende Handwerkzeuge', 'cat8', 'Handwerkzeuge', 'renovation'),
    suggestion('sander_workshop_support', 'Werkstatt-Unterstützung', 'cat20', 'Werkstatt', 'renovation'),
  ]),
  [catalogKey('cat8', 'Sägen')]: Object.freeze([
    suggestion('saw_workshop_support', 'Stabile Werkstatt-Unterstützung', 'cat20', 'Werkstatt', 'renovation'),
    suggestion('saw_dust_collection', 'Geeignete Staubabsaugung', 'cat5', 'Staubsauger', 'renovation'),
    suggestion('saw_hand_tools', 'Passende Handwerkzeuge', 'cat8', 'Handwerkzeuge', 'renovation'),
  ]),
  [catalogKey('cat7', 'Rasenmäher')]: Object.freeze([
    suggestion('mower_garden_tools', 'Weitere Gartengeräte', 'cat7', 'Gartengeräte', 'garden'),
    suggestion('mower_irrigation', 'Bewässerungszubehör', 'cat7', 'Bewässerung', 'garden'),
    suggestion('mower_hand_tools', 'Passende Handwerkzeuge', 'cat8', 'Handwerkzeuge', 'garden'),
  ]),
  [catalogKey('cat7', 'Gartengeräte')]: Object.freeze([
    suggestion('garden_irrigation', 'Bewässerungszubehör', 'cat7', 'Bewässerung', 'garden'),
    suggestion('garden_plant_boxes', 'Pflanzkisten', 'cat7', 'Pflanzkisten', 'garden'),
    suggestion('garden_hand_tools', 'Passende Handwerkzeuge', 'cat8', 'Handwerkzeuge', 'garden'),
  ]),
  [catalogKey('cat22', 'Pavillons')]: Object.freeze([
    suggestion('pavilion_tables_chairs', 'Tische und Stühle', 'cat22', 'Tische & Stühle', 'event'),
    suggestion('pavilion_party_decor', 'Party-Deko', 'cat22', 'Party-Deko', 'event'),
    suggestion('pavilion_event_tech', 'Eventtechnik', 'cat22', 'Eventtechnik', 'event'),
  ]),
  [catalogKey('cat23', 'Zelte')]: Object.freeze([
    suggestion('tent_sleep_system', 'Schlafsäcke', 'cat23', 'Schlafsäcke', 'camping'),
    suggestion('tent_outdoor_accessory', 'Outdoor-Zubehör', 'cat23', 'Outdoor-Zubehör', 'camping'),
    suggestion('tent_camping_kitchen', 'Campingküche', 'cat23', 'Campingküche', 'camping'),
  ]),
  [catalogKey('cat3', 'Kameras')]: Object.freeze([
    suggestion('camera_lenses', 'Passende Objektive', 'cat3', 'Objektive', 'photography'),
    suggestion('camera_tripods', 'Stative', 'cat3', 'Stative', 'photography'),
    suggestion('camera_lighting', 'Licht', 'cat3', 'Licht', 'photography'),
  ]),
});

function suggestionId(listingId, key) {
  return `supply_suggestion_${digest(`${listingSupplyEnrichmentVersion}:${listingId}:${key}`).slice(0, 32)}`;
}

function sourceListing(row, actorId) {
  if (!row) throw new ListingSupplyEnrichmentError(404, 'listing_not_found');
  if (row.owner_id !== actorId) {
    throw new ListingSupplyEnrichmentError(403, 'listing_supply_enrichment_forbidden');
  }
  if (Number(row.catalog_version) !== 1 || row.status !== 'active' || row.is_active !== true) {
    throw new ListingSupplyEnrichmentError(409, 'listing_supply_enrichment_requires_active_listing');
  }
  return row;
}

function storedSession(payload) {
  const raw = payload?.supplyEnrichment;
  if (raw == null) return null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
      || raw.version !== listingSupplyEnrichmentVersion
      || raw.heuristicVersion !== listingSupplyHeuristicVersion
      || !Array.isArray(raw.suggestions)
      || raw.suggestions.length > MAX_SUGGESTIONS) {
    throw new ListingSupplyEnrichmentError(409, 'listing_supply_enrichment_version_changed');
  }
  return structuredClone(raw);
}

function publicSuggestion(entry) {
  return {
    id: entry.id,
    key: entry.key,
    label: entry.label,
    prompt: entry.prompt,
    target: {
      categoryId: entry.targetCategoryId,
      subcategory: entry.targetSubcategory,
    },
    projectTag: entry.projectTag,
    outcome: entry.outcome ?? null,
    documentation: entry.documentation ?? null,
    linkedListingId: entry.linkedListingId ?? null,
    actedAt: entry.actedAt ?? null,
    linkedAt: entry.linkedAt ?? null,
  };
}

function publicSession(session) {
  return deepFreeze({
    version: session.version,
    heuristicVersion: session.heuristicVersion,
    sourceListingId: session.sourceListingId,
    generatedAt: session.generatedAt,
    detectionBasis: session.detectionBasis,
    suggestions: session.suggestions.map(publicSuggestion),
    maximumSuggestionCount: MAX_SUGGESTIONS,
    primaryListingCreated: true,
    primaryListingBlocked: false,
    externalGenerativeAiUsed: false,
  });
}

function sessionFor(row, { now }) {
  const templates = heuristicTemplates[catalogKey(row.category_id, row.subcategory)] ?? [];
  return {
    version: listingSupplyEnrichmentVersion,
    heuristicVersion: listingSupplyHeuristicVersion,
    sourceListingId: row.id,
    generatedAt: now.toISOString(),
    detectionBasis: {
      kind: 'exact_category_template_question',
      categoryId: row.category_id,
      subcategory: row.subcategory,
      titleAnalysisUsed: false,
      photoAnalysisUsed: false,
      suggestionIsDetectionTruth: false,
    },
    suggestions: templates.slice(0, MAX_SUGGESTIONS).map((entry) => ({
      id: suggestionId(row.id, entry.key),
      key: entry.key,
      label: entry.label,
      prompt: `Gehört „${entry.label}“ zu deinem Angebot oder möchtest du daraus eine eigene Anzeige machen?`,
      targetCategoryId: entry.categoryId,
      targetSubcategory: entry.subcategory,
      projectTag: entry.projectTag,
      outcome: null,
      documentation: null,
      linkedListingId: null,
      actedAt: null,
      linkedAt: null,
    })),
  };
}

async function loadListingForUpdate(client, listingId) {
  const result = await client.query(
    `SELECT id, owner_id, payload, catalog_version, catalog_revision,
            status, is_active, category_id, subcategory,
            location_text, city, country, latitude, longitude
       FROM listings
      WHERE id = $1
      FOR UPDATE`,
    [listingId],
  );
  return result.rows[0] ?? null;
}

async function saveSession(client, row, session) {
  const nextPayload = { ...(row.payload ?? {}), supplyEnrichment: session };
  const updated = await client.query(
    `UPDATE listings
        SET payload = $3::jsonb,
            catalog_revision = catalog_revision + 1,
            updated_at = now()
      WHERE id = $1 AND owner_id = $2 AND catalog_revision = $4`,
    [row.id, row.owner_id, JSON.stringify(nextPayload), Number(row.catalog_revision)],
  );
  if (updated.rowCount !== 1) {
    throw new ListingSupplyEnrichmentError(409, 'listing_supply_enrichment_revision_conflict');
  }
}

export function assertListingSupplyEnrichmentTechnicalAccess(configuration) {
  if (configuration?.listingSupplyEnrichment?.enabled !== true
      || configuration.listingSupplyEnrichment.publicReleaseAllowed !== false
      || configuration.listingSupplyEnrichment.externalGenerativeAiAllowed !== false) {
    throw new ListingSupplyEnrichmentError(404, 'listing_supply_enrichment_not_enabled');
  }
  return true;
}

export async function generateListingSupplyEnrichment(client, {
  actorId,
  listingId,
  now = new Date(),
}) {
  const sourceId = identifier(listingId, 'invalid_listing_id');
  const row = sourceListing(await loadListingForUpdate(client, sourceId), actorId);
  let session = storedSession(row.payload);
  if (session == null) {
    session = sessionFor(row, { now });
    await saveSession(client, row, session);
  }
  return publicSession(session);
}

function outcomeDocumentation(outcome, suggestionEntry) {
  switch (outcome) {
    case 'included_accessory':
      return {
        kind: 'included_accessory_documentation',
        label: suggestionEntry.label,
        ownerConfirmed: true,
        handoverEvidenceSlot: 'accessories',
      };
    case 'not_part':
      return {
        kind: 'listing_clarity_reminder',
        clarityRequired: true,
        fields: ['photos', 'description'],
      };
    case 'wrong_detection':
      return {
        kind: 'heuristic_feedback',
        acceptedAsListingTruth: false,
        feedback: 'wrong_detection',
      };
    case 'separate_rental':
    case 'standalone_listing':
      return {
        kind: 'follow_up_listing_intent',
        linkRequired: true,
      };
    default:
      throw new ListingSupplyEnrichmentError(400, 'invalid_listing_supply_enrichment_outcome');
  }
}

function followUpPrefill(row, suggestionEntry, outcome) {
  if (!followUpOutcomes.has(outcome)) return null;
  return {
    title: suggestionEntry.label,
    categoryId: suggestionEntry.targetCategoryId,
    subcategory: suggestionEntry.targetSubcategory,
    locationText: row.location_text,
    city: row.city,
    country: row.country,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    pricePrefilled: false,
    descriptionPrefilled: false,
    photoPrefilled: false,
    link: {
      sourceListingId: row.id,
      suggestionId: suggestionEntry.id,
      outcome,
    },
  };
}

export async function recordListingSupplyEnrichmentOutcome(client, {
  actorId,
  listingId,
  suggestionId: rawSuggestionId,
  outcome: rawOutcome,
  now = new Date(),
}) {
  const sourceId = identifier(listingId, 'invalid_listing_id');
  const selectedSuggestionId = identifier(
    rawSuggestionId,
    'invalid_listing_supply_enrichment_suggestion_id',
  );
  const outcome = text(rawOutcome, 40);
  if (!outcomeIds.includes(outcome)) {
    throw new ListingSupplyEnrichmentError(400, 'invalid_listing_supply_enrichment_outcome');
  }
  const row = sourceListing(await loadListingForUpdate(client, sourceId), actorId);
  const session = storedSession(row.payload);
  if (session == null) {
    throw new ListingSupplyEnrichmentError(409, 'listing_supply_enrichment_not_generated');
  }
  const index = session.suggestions.findIndex((entry) => entry.id === selectedSuggestionId);
  if (index < 0) {
    throw new ListingSupplyEnrichmentError(404, 'listing_supply_enrichment_suggestion_not_found');
  }
  const existing = session.suggestions[index];
  if (existing.outcome != null && existing.outcome !== outcome) {
    throw new ListingSupplyEnrichmentError(409, 'listing_supply_enrichment_outcome_already_recorded');
  }
  if (existing.outcome == null) {
    session.suggestions[index] = {
      ...existing,
      outcome,
      documentation: outcomeDocumentation(outcome, existing),
      actedAt: now.toISOString(),
    };
    await saveSession(client, row, session);
  }
  const suggestionEntry = session.suggestions[index];
  return deepFreeze({
    version: listingSupplyEnrichmentVersion,
    sourceListingId: row.id,
    suggestion: publicSuggestion(suggestionEntry),
    nextAction: outcome === 'included_accessory'
      ? 'included_accessory_documented'
      : (outcome === 'not_part'
          ? 'review_listing_photos_and_description'
          : (outcome === 'wrong_detection'
              ? 'feedback_recorded_without_truth_change'
              : 'create_prefilled_follow_up_listing')),
    prefill: followUpPrefill(row, suggestionEntry, outcome),
    primaryListingBlocked: false,
    externalGenerativeAiUsed: false,
  });
}

export async function linkListingSupplyEnrichmentFollowUp(client, {
  actorId,
  targetListingId,
  raw,
  now = new Date(),
}) {
  const link = object(raw, 'invalid_listing_supply_enrichment_link');
  const sourceId = identifier(link.sourceListingId, 'invalid_listing_supply_enrichment_source_id');
  const selectedSuggestionId = identifier(
    link.suggestionId,
    'invalid_listing_supply_enrichment_suggestion_id',
  );
  const targetId = identifier(targetListingId, 'invalid_listing_supply_enrichment_target_id');
  const outcome = text(link.outcome, 40);
  if (!followUpOutcomes.has(outcome) || sourceId === targetId) {
    throw new ListingSupplyEnrichmentError(400, 'invalid_listing_supply_enrichment_link');
  }
  const source = sourceListing(await loadListingForUpdate(client, sourceId), actorId);
  const targetResult = await client.query(
    `SELECT id, owner_id, catalog_version, category_id, subcategory
       FROM listings
      WHERE id = $1
      FOR KEY SHARE`,
    [targetId],
  );
  const target = targetResult.rows[0];
  if (!target || target.owner_id !== actorId || Number(target.catalog_version) !== 1) {
    throw new ListingSupplyEnrichmentError(409, 'listing_supply_enrichment_target_invalid');
  }
  const session = storedSession(source.payload);
  if (session == null) {
    throw new ListingSupplyEnrichmentError(409, 'listing_supply_enrichment_not_generated');
  }
  const index = session.suggestions.findIndex((entry) => entry.id === selectedSuggestionId);
  if (index < 0) {
    throw new ListingSupplyEnrichmentError(404, 'listing_supply_enrichment_suggestion_not_found');
  }
  const suggestionEntry = session.suggestions[index];
  if (suggestionEntry.outcome !== outcome
      || suggestionEntry.targetCategoryId !== target.category_id
      || suggestionEntry.targetSubcategory !== target.subcategory) {
    throw new ListingSupplyEnrichmentError(409, 'listing_supply_enrichment_target_mismatch');
  }
  if (suggestionEntry.linkedListingId != null
      && suggestionEntry.linkedListingId !== targetId) {
    throw new ListingSupplyEnrichmentError(409, 'listing_supply_enrichment_link_already_completed');
  }
  if (suggestionEntry.linkedListingId == null) {
    session.suggestions[index] = {
      ...suggestionEntry,
      linkedListingId: targetId,
      linkedAt: now.toISOString(),
      documentation: {
        ...suggestionEntry.documentation,
        linkRequired: false,
        linkCompleted: true,
      },
    };
    await saveSession(client, source, session);
  }
  return deepFreeze({
    version: listingSupplyEnrichmentVersion,
    sourceListingId: sourceId,
    suggestionId: selectedSuggestionId,
    outcome,
    linkedListingId: targetId,
    linked: true,
    primaryListingBlocked: false,
  });
}

export function listingSupplyHeuristicTemplates() {
  return deepFreeze(Object.entries(heuristicTemplates).map(([sourceCatalogKey, entries]) => ({
    sourceCatalogKey,
    suggestions: entries.map((entry) => ({ ...entry })),
  })));
}
