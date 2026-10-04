export const listingAiAssistVersion = 'WP195-2026-09-17.2';

export class ListingAiAssistError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'ListingAiAssistError';
    this.status = status;
    this.code = code;
  }
}

function fail(status, code) {
  throw new ListingAiAssistError(status, code);
}

function text(value, code, maximum = 4000) {
  const result = typeof value === 'string' ? value.trim() : '';
  if (!result || result.length > maximum) fail(400, code);
  return result;
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(400, code);
  }
}

function boundedStrategy(value) {
  const strategy = text(value, 'listing_ai_assist_strategy_invalid', 20);
  if (!['quick', 'premium'].includes(strategy)) fail(400, 'listing_ai_assist_strategy_invalid');
  return strategy;
}

function boundedCondition(value) {
  const condition = text(value, 'listing_ai_assist_condition_invalid', 40);
  if (!['new', 'like-new', 'good', 'acceptable', 'worn'].includes(condition)) {
    fail(400, 'listing_ai_assist_condition_invalid');
  }
  return condition;
}

function priceResult({ title, category, condition, location, strategy }) {
  const value = `${title} ${category} ${location}`.toLocaleLowerCase('de-DE');
  const base = /kamera|smartphone|laptop|elektronik/iu.test(value)
    ? 15 : (/werkzeug|bohr|säge|garten/iu.test(value) ? 10 : 8);
  const conditionFactor = condition === 'new' || condition === 'like-new' ? 1.2
    : (condition === 'worn' || condition === 'acceptable' ? 0.8 : 1);
  // Strategy is validated for the typed contract, but only the client picks
  // a point inside this stable range; it must not multiply the range again.
  const center = Math.max(1, Math.round(base * conditionFactor));
  return Object.freeze({
    dailyPriceMin: Math.max(1, center - 2),
    dailyPriceMax: center + 2,
    weeklyPriceMin: Math.max(1, Math.round((center - 2) * 6)),
    weeklyPriceMax: Math.round((center + 2) * 6),
    reasoning: 'Regelbasierter Orientierungsrahmen aus deinen Angaben; die Strategie wählt nur einen Punkt im Rahmen. Keine Marktpreisermittlung und keine autoritative Preisangabe.',
    source: 'server_rules',
    providerExecuted: false,
  });
}

export function normalizeListingAiPriceRequest(raw) {
  exactKeys(raw, [
    'title', 'description', 'category', 'condition', 'location', 'strategy',
  ], 'listing_ai_assist_price_input_shape');
  return Object.freeze({
    title: text(raw.title, 'listing_ai_assist_title_invalid', 240),
    description: typeof raw.description === 'string' ? raw.description.trim().slice(0, 4_000) : '',
    category: text(raw.category, 'listing_ai_assist_category_invalid', 120),
    condition: boundedCondition(raw.condition),
    location: text(raw.location, 'listing_ai_assist_location_invalid', 240),
    strategy: boundedStrategy(raw.strategy),
  });
}

export function createListingAiAssistService({ configuration } = {}) {
  if (!configuration || typeof configuration.provider !== 'string') {
    throw new TypeError('listing_ai_assist_configuration_required');
  }
  return Object.freeze({
    async price(raw, { ownerId = null } = {}) {
      if (!ownerId) fail(401, 'authentication_required');
      const input = normalizeListingAiPriceRequest(raw);
      return Object.freeze({
        version: listingAiAssistVersion,
        operation: 'price',
        configuredProvider: configuration.provider,
        model: configuration.model,
        ...priceResult(input),
      });
    },
  });
}
