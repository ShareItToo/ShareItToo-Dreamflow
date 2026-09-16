import {
  listingAiDraftSchemaVersion,
  listingAiPromptVersion,
} from './listing_ai_draft_domain.js';

export const onDeviceListingAiProviderVersion = 'WP109-2026-09-11.1';

const catalogRules = Object.freeze([
  rule('cat8', 'Bohrmaschinen', 'Bohrmaschine', ['drill', 'power drill', 'bohrmaschine', 'bohrer'], ['bohren', 'renovation']),
  rule('cat8', 'Sägen', 'Säge', ['saw', 'chainsaw', 'circular saw', 'jigsaw', 'säge', 'kettensäge'], ['sägen', 'renovation']),
  rule('cat8', 'Schleifer', 'Schleifgerät', ['sander', 'grinder', 'schleifer', 'schleifmaschine'], ['schleifen', 'renovation']),
  rule('cat8', 'Elektrowerkzeuge', 'Elektrowerkzeug', ['power tool', 'rotary tool', 'impact driver', 'elektrowerkzeug'], ['handwerken', 'renovation']),
  rule('cat8', 'Handwerkzeuge', 'Handwerkzeug', ['hand tool', 'hammer', 'wrench', 'screwdriver', 'pliers', 'werkzeug'], ['handwerken'],),
  rule('cat3', 'Kameras', 'Kamera', ['camera', 'digital camera', 'photography', 'kamera'], ['fotografie']),
  rule('cat3', 'Objektive', 'Kameraobjektiv', ['camera lens', 'lens', 'objektiv'], ['fotografie']),
  rule('cat3', 'Stative', 'Kamerastativ', ['tripod', 'camera support', 'stativ'], ['fotografie']),
  rule('cat1', 'Smartphones', 'Smartphone', ['smartphone', 'mobile phone', 'cell phone', 'telefon'], ['mobil']),
  rule('cat1', 'Tablets', 'Tablet', ['tablet computer', 'tablet'], ['mobil']),
  rule('cat1', 'Audio', 'Audiogerät', ['headphones', 'speaker', 'audio equipment', 'loudspeaker', 'kopfhörer', 'lautsprecher'], ['audio']),
  rule('cat2', 'Laptops', 'Laptop', ['laptop', 'notebook computer', 'notebook'], ['computer']),
  rule('cat2', 'Monitore', 'Monitor', ['computer monitor', 'display device', 'monitor'], ['computer']),
  rule('cat2', 'Drucker', 'Drucker', ['printer', 'drucker'], ['büro']),
  rule('cat4', 'Konsolen', 'Spielekonsole', ['video game console', 'game console', 'spielekonsole'], ['gaming']),
  rule('cat4', 'VR', 'VR-Headset', ['virtual reality headset', 'vr headset'], ['gaming']),
  rule('cat5', 'Staubsauger', 'Staubsauger', ['vacuum cleaner', 'vacuum', 'staubsauger'], ['reinigung']),
  rule('cat5', 'Mixer', 'Mixer', ['blender', 'mixer', 'food processor'], ['küche']),
  rule('cat5', 'Kaffeemaschinen', 'Kaffeemaschine', ['coffee maker', 'espresso machine', 'kaffeemaschine'], ['küche']),
  rule('cat6', 'Tische', 'Tisch', ['table', 'desk', 'tisch'], ['möbel']),
  rule('cat6', 'Stühle', 'Stuhl', ['chair', 'office chair', 'stuhl'], ['möbel']),
  rule('cat6', 'Beleuchtung', 'Leuchte', ['lamp', 'light fixture', 'lighting', 'leuchte', 'lampe'], ['beleuchtung']),
  rule('cat7', 'Rasenmäher', 'Rasenmäher', ['lawn mower', 'mower', 'rasenmäher'], ['garten']),
  rule('cat7', 'Heckenscheren', 'Heckenschere', ['hedge trimmer', 'heckenschere'], ['garten']),
  rule('cat14', 'Gitarren', 'Gitarre', ['guitar', 'electric guitar', 'acoustic guitar', 'gitarre'], ['musik']),
  rule('cat14', 'Tastaturen', 'Keyboard', ['musical keyboard', 'electronic keyboard', 'keyboard instrument'], ['musik']),
  rule('cat20', 'Präsentation', 'Projektor', ['projector', 'video projector', 'beamer'], ['präsentation']),
  rule('cat22', 'Pavillons', 'Pavillon', ['canopy', 'gazebo', 'pavilion', 'pavillon'], ['veranstaltung']),
  rule('cat22', 'Tische & Stühle', 'Eventmöbel', ['folding chair', 'folding table', 'event furniture'], ['veranstaltung']),
  rule('cat23', 'Zelte', 'Zelt', ['tent', 'camping tent', 'zelt'], ['camping']),
  rule('cat23', 'Schlafsäcke', 'Schlafsack', ['sleeping bag', 'schlafsack'], ['camping']),
  rule('cat23', 'Rucksäcke & Koffer', 'Reisegepäck', ['backpack', 'suitcase', 'luggage', 'rucksack', 'koffer'], ['reise']),
]);

const knownBrands = Object.freeze([
  'AEG', 'Apple', 'Asus', 'Bosch', 'Brother', 'Canon', 'DeWalt', 'Dell',
  'Einhell', 'Epson', 'Fender', 'Gardena', 'GoPro', 'HP', 'Husqvarna',
  'Kärcher', 'Lenovo', 'LG', 'Makita', 'Metabo', 'Microsoft', 'Milwaukee',
  'Nikon', 'Nintendo', 'Panasonic', 'Philips', 'Ryobi', 'Samsung', 'Sony',
  'Stihl', 'Yamaha',
]);

function rule(category, subcategory, title, terms, tags) {
  return Object.freeze({ category, subcategory, title, terms, tags });
}

function source(imageReference, detail) {
  return Object.freeze({
    type: 'provider_output',
    imageReference,
    detail,
  });
}

function field(value, confidence, imageReference, reasonCode, {
  confirmationRequired = confidence !== 'HIGH',
  detail = 'on_device_ml_observation',
} = {}) {
  return Object.freeze({
    value: confidence === 'LOW' ? null : value,
    confidence,
    source: source(imageReference, detail),
    confirmationRequired,
    reasonCode,
    ownerConfirmed: false,
  });
}

function normalizedText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('de-DE')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function chooseCatalog(observations) {
  const scores = new Map(catalogRules.map((entry) => [entry, 0]));
  for (const observation of observations) {
    for (const label of observation.labels) {
      const text = normalizedText(label.text);
      for (const entry of catalogRules) {
        if (entry.terms.some((term) => text === normalizedText(term))) {
          scores.set(entry, scores.get(entry) + label.confidence);
        }
      }
    }
    const ocr = normalizedText(observation.ocrText);
    if (ocr) {
      for (const entry of catalogRules) {
        if (entry.terms.some((term) => ocr.includes(normalizedText(term)))) {
          scores.set(entry, scores.get(entry) + 0.55);
        }
      }
    }
  }
  const ranked = [...scores.entries()].sort((left, right) => right[1] - left[1]);
  if (!ranked[0] || ranked[0][1] < 0.45) return null;
  const [entry, score] = ranked[0];
  const runnerUp = ranked[1]?.[1] ?? 0;
  return Object.freeze({
    ...entry,
    confidence: score >= 0.82 && score - runnerUp >= 0.18 ? 'HIGH' : 'MEDIUM',
  });
}

function brandAndModel(observations) {
  const text = observations.map((entry) => entry.ocrText).join(' ');
  for (const brand of knownBrands) {
    const brandPattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${brand.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?:$|[^\\p{L}\\p{N}])`, 'iu');
    if (!brandPattern.test(text)) continue;
    const afterBrand = text.slice(Math.max(0, text.search(brandPattern))).split(/\s+/u).slice(1, 7);
    const model = afterBrand.find((token) => (
      /^(?=.{3,24}$)(?=.*\d)[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(token)
    ));
    return Object.freeze({ brand, model: model ?? null });
  }
  return Object.freeze({ brand: null, model: null });
}

function question(id, targetField, text) {
  return Object.freeze({ id, field: targetField, question: text });
}

export function createOnDeviceListingAiOutput(request) {
  const observations = request.onDeviceObservations;
  const firstReference = request.analysisImageReferences[0];
  const catalog = chooseCatalog(observations);
  const identity = brandAndModel(observations);
  const titleBase = catalog?.title ?? null;
  const title = titleBase == null
    ? null
    : [identity.brand, identity.model, titleBase].filter(Boolean).join(' ');
  const categoryConfidence = catalog?.confidence ?? 'LOW';
  const titleConfidence = title == null ? 'LOW' : categoryConfidence;
  const questions = [];
  if (catalog == null) {
    questions.push(question(
      'on_device_question_category_0001',
      'category',
      'Welcher Gegenstand und welche Kategorie sind auf den Fotos zu sehen?',
    ));
  } else if (identity.model == null) {
    questions.push(question(
      'on_device_question_model_0001',
      'model',
      'Welche Modellbezeichnung steht auf dem Gegenstand?',
    ));
  }
  questions.push(question(
    'on_device_question_condition_0001',
    'condition',
    'Welchen Zustand hat der Gegenstand nach deiner eigenen Prüfung?',
  ));
  questions.push(question(
    'on_device_question_value_0001',
    'replacementValueMinor',
    'Wie hoch ist ungefähr der heutige Ersatzwert?',
  ));

  return Object.freeze({
    promptVersion: listingAiPromptVersion,
    schemaVersion: listingAiDraftSchemaVersion,
    fields: Object.freeze({
      title: field(title, titleConfidence, firstReference, title == null
        ? 'on_device_identity_insufficient'
        : 'on_device_visual_identity', { confirmationRequired: true }),
      category: field(catalog?.category, categoryConfidence, firstReference, catalog == null
        ? 'on_device_category_insufficient'
        : 'on_device_catalog_match', { confirmationRequired: true }),
      subcategory: field(catalog?.subcategory, categoryConfidence, firstReference, catalog == null
        ? 'on_device_category_insufficient'
        : 'on_device_catalog_match', { confirmationRequired: true }),
      brand: field(identity.brand, identity.brand == null ? 'LOW' : 'MEDIUM', firstReference,
        identity.brand == null ? 'on_device_brand_insufficient' : 'on_device_ocr_brand',
        { confirmationRequired: true }),
      model: field(identity.model, identity.model == null ? 'LOW' : 'MEDIUM', firstReference,
        identity.model == null ? 'on_device_model_insufficient' : 'on_device_ocr_model',
        { confirmationRequired: true }),
      description: field(title == null
        ? null
        : `Auf den Fotos als möglicherweise ${title} erkannt. Bitte Marke, Modell, Lieferumfang, Funktion und Zustand vor der Veröffentlichung selbst prüfen.`,
      titleConfidence, firstReference, title == null
        ? 'on_device_description_insufficient'
        : 'on_device_cautious_description', { confirmationRequired: true }),
      condition: field(null, 'LOW', firstReference, 'owner_condition_required'),
      accessories: field(null, 'LOW', firstReference, 'owner_accessories_required'),
      projectTags: field(catalog?.tags ?? null, categoryConfidence, firstReference, catalog == null
        ? 'on_device_tags_insufficient'
        : 'on_device_catalog_tags', { confirmationRequired: true }),
      useCases: field(catalog?.tags ?? null, categoryConfidence, firstReference, catalog == null
        ? 'on_device_use_cases_insufficient'
        : 'on_device_catalog_use_cases', { confirmationRequired: true }),
      safetyNotes: field(title == null
        ? null
        : 'Sicherheits-, Funktions- und Nutzungshinweise müssen vom Eigentümer ergänzt und bestätigt werden.',
      titleConfidence, firstReference, title == null
        ? 'on_device_safety_insufficient'
        : 'owner_safety_confirmation_required', { confirmationRequired: true }),
      replacementValueMinor: field(null, 'LOW', firstReference, 'owner_replacement_value_required'),
      pickupRegion: field(null, 'LOW', firstReference, 'account_or_owner_region_required'),
    }),
    clarificationQuestions: Object.freeze(questions.slice(0, 3)),
  });
}

export function createOnDeviceListingAiProvider() {
  return Object.freeze({
    provider: 'on_device',
    version: onDeviceListingAiProviderVersion,
    async generate(request) {
      return Object.freeze({
        output: createOnDeviceListingAiOutput(request),
        usage: Object.freeze({
          inputUnits: 0,
          outputUnits: 0,
          estimatedCostCents: 0,
          billedCostCents: 0,
        }),
      });
    },
  });
}
