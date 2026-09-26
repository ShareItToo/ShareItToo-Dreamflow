import crypto from 'node:crypto';

import { privatePilotAllowedCatalogKeys } from './private_pilot_domain.js';

export const plannerCoreVersion = 'G4A-2026-08-21.1';
export const plannerTemplateReviewStatus = 'reviewed-current-private-pilot-boundaries';

const priorities = Object.freeze(['required', 'recommended', 'optional']);
const unresolvedServerFacts = Object.freeze([
  'eligibleListing',
  'owner',
  'currentAvailability',
  'currentQuote',
  'currentPrice',
]);
const globalCompatibilityRules = Object.freeze([
  'Only exact server-allowlisted category and subcategory targets are emitted.',
  'G4A emits item types only; G4B must resolve real eligible inventory and current server truth.',
  'A project may later split into separate owner, country, currency, legal, payment, period, or handover groups.',
]);
const globalSafetyRules = Object.freeze([
  'No vehicles, transport service, paid delivery, shipping, drones, weapons, medical goods, living things, deposits, insurance, or damage guarantee.',
  'No professional, structural, electrical, gas, asbestos, chemical, food, staffed-catering, or emergency-service instruction is provided.',
  'The renter must verify item condition, instructions, suitability, lawful use, required competence, and personal protective measures.',
]);

export class PlannerCoreError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function target(categoryId, subcategory) {
  const catalogKey = `${categoryId}\u001f${subcategory}`;
  if (!privatePilotAllowedCatalogKeys.includes(catalogKey)) {
    throw new PlannerCoreError('planner_template_catalog_target_not_allowed');
  }
  return Object.freeze({ categoryId, subcategory, catalogKey });
}

function question(id, prompt, options) {
  if (!/^[a-z][a-z0-9_]{2,39}$/u.test(id)
      || typeof prompt !== 'string'
      || prompt.length < 8
      || !Array.isArray(options)
      || options.length < 2
      || options.length > 8
      || new Set(options).size !== options.length
      || options.some((option) => !/^[a-z][a-z0-9_]{1,39}$/u.test(option))) {
    throw new PlannerCoreError('invalid_planner_template_question');
  }
  return Object.freeze({ id, prompt, type: 'single_choice', options: Object.freeze(options) });
}

function when(answerId, values) {
  return Object.freeze({ answerId, values: Object.freeze(values) });
}

function item(itemType, priority, catalogTargets, {
  conditions = [],
  assumption,
} = {}) {
  if (!/^[a-z][a-z0-9_]{2,59}$/u.test(itemType)
      || !priorities.includes(priority)
      || !Array.isArray(catalogTargets)
      || catalogTargets.length === 0
      || typeof assumption !== 'string'
      || assumption.length < 12) {
    throw new PlannerCoreError('invalid_planner_template_item');
  }
  return Object.freeze({
    itemType,
    priority,
    catalogTargets: Object.freeze(catalogTargets),
    conditions: Object.freeze(conditions),
    assumption,
  });
}

function conditionalAssumption(text, conditions = []) {
  return Object.freeze({ text, conditions: Object.freeze(conditions) });
}

function template({
  id,
  title,
  questions,
  items,
  assumptions,
  compatibilityRules,
  safetyRules,
}) {
  if (!/^[a-z][a-z0-9_]{2,39}$/u.test(id)
      || typeof title !== 'string'
      || questions.length < 3
      || questions.length > 6
      || new Set(questions.map((entry) => entry.id)).size !== questions.length
      || new Set(items.map((entry) => entry.itemType)).size !== items.length
      || priorities.some((priority) => !items.some((entry) => entry.priority === priority))
      || !Array.isArray(assumptions)
      || assumptions.some((entry) => typeof entry?.text !== 'string'
        || entry.text.length < 12
        || !Array.isArray(entry.conditions))
      || !Array.isArray(compatibilityRules)
      || compatibilityRules.length === 0
      || compatibilityRules.some((entry) => typeof entry !== 'string' || entry.length < 12)
      || !Array.isArray(safetyRules)
      || safetyRules.length === 0
      || safetyRules.some((entry) => typeof entry !== 'string' || entry.length < 12)) {
    throw new PlannerCoreError('invalid_planner_template');
  }
  const questionIds = new Set(questions.map((entry) => entry.id));
  for (const entry of [...items, ...assumptions]) {
    for (const condition of entry.conditions) {
      if (!questionIds.has(condition.answerId)
          || !Array.isArray(condition.values)
          || condition.values.length === 0) {
        throw new PlannerCoreError('invalid_planner_template_condition');
      }
      const source = questions.find((candidate) => candidate.id === condition.answerId);
      if (condition.values.some((value) => !source.options.includes(value))) {
        throw new PlannerCoreError('invalid_planner_template_condition');
      }
    }
  }
  return Object.freeze({
    id,
    title,
    version: plannerCoreVersion,
    reviewStatus: plannerTemplateReviewStatus,
    externalGenerativeAiRequired: false,
    questions: Object.freeze(questions),
    items: Object.freeze(items),
    assumptions: Object.freeze(assumptions),
    compatibilityRules: Object.freeze(compatibilityRules),
    safetyRules: Object.freeze(safetyRules),
  });
}

export const plannerTemplates = Object.freeze([
  template({
    id: 'terrace_cleaning',
    title: 'Terrasse reinigen',
    questions: [
      question('surface', 'Welche Terrassenoberfläche soll gereinigt werden?', ['stone', 'wood', 'composite']),
      question('area_size', 'Wie groß ist die zu reinigende Fläche?', ['small', 'medium', 'large']),
      question('water_access', 'Ist ein sicherer Wasseranschluss erreichbar?', ['available', 'unavailable']),
      question('power_access', 'Ist ein sicherer Stromanschluss erreichbar?', ['available', 'unavailable']),
    ],
    items: [
      item('stone_surface_cleaning_tool', 'required', [
        target('cat8', 'Elektrowerkzeuge'),
        target('cat8', 'Handwerkzeuge'),
      ], {
        conditions: [when('surface', ['stone'])],
        assumption: 'The surface is stone; suitability for the exact stone and joints remains unverified.',
      }),
      item('wood_surface_cleaning_tool', 'required', [target('cat8', 'Handwerkzeuge')], {
        conditions: [when('surface', ['wood'])],
        assumption: 'The surface is wood; only a tool explicitly suitable for that finish may be resolved.',
      }),
      item('composite_surface_cleaning_tool', 'required', [target('cat8', 'Handwerkzeuge')], {
        conditions: [when('surface', ['composite'])],
        assumption: 'The surface is composite; manufacturer restrictions remain unknown.',
      }),
      item('manual_detail_cleaning_tool', 'recommended', [target('cat8', 'Handwerkzeuge')], {
        assumption: 'Edges and sensitive areas may require a separate manual tool.',
      }),
      item('work_area_accessory', 'optional', [target('cat20', 'Zubehör')], {
        assumption: 'A non-consumable work-area accessory may help, but type and dimensions remain unresolved.',
      }),
      item('water_application_accessory', 'optional', [target('cat7', 'Bewässerung')], {
        conditions: [when('water_access', ['available'])],
        assumption: 'Water access was confirmed, but connector and pressure compatibility remain unresolved.',
      }),
      item('large_area_garden_tool', 'optional', [target('cat7', 'Gartengeräte')], {
        conditions: [when('area_size', ['large'])],
        assumption: 'The stated area is large; G4B may search an additional compatible area tool.',
      }),
    ],
    assumptions: [
      conditionalAssumption('No cleaning chemical or pressure setting is recommended by this planner.'),
      conditionalAssumption('No safe power source was confirmed; electrically powered results require a separately verified supply.', [when('power_access', ['unavailable'])]),
    ],
    compatibilityRules: [
      'Surface material must match the listing instructions and owner-confirmed permitted use.',
      'Water connector, pressure, power, cable, and outdoor-use compatibility require real item facts.',
    ],
    safetyRules: [
      'Do not use pressure or chemicals on a surface unless its manufacturer and owner permit it.',
      'Outdoor electrical equipment requires an appropriate protected supply and dry connection handling.',
    ],
  }),
  template({
    id: 'renovation',
    title: 'Renovieren',
    questions: [
      question('task', 'Welche Hauptarbeit ist geplant?', ['drill', 'sand', 'saw', 'assemble']),
      question('material', 'Welches Material wird überwiegend bearbeitet?', ['wood', 'masonry', 'mixed']),
      question('workspace', 'Findet die Arbeit innen oder außen statt?', ['indoor', 'outdoor']),
      question('power_access', 'Ist ein sicherer Stromanschluss erreichbar?', ['available', 'unavailable']),
      question('experience', 'Wie ist die Erfahrung mit dieser Werkzeugart?', ['beginner', 'experienced']),
    ],
    items: [
      item('drilling_tool', 'required', [target('cat8', 'Bohrmaschinen')], {
        conditions: [when('task', ['drill'])],
        assumption: 'A drilling task was selected; bit, material, depth, and hidden services remain unknown.',
      }),
      item('sanding_tool', 'required', [target('cat8', 'Schleifer')], {
        conditions: [when('task', ['sand'])],
        assumption: 'A sanding task was selected; abrasive and dust class remain unknown.',
      }),
      item('sawing_tool', 'required', [target('cat8', 'Sägen')], {
        conditions: [when('task', ['saw'])],
        assumption: 'A sawing task was selected; blade, material, support, and competence remain unknown.',
      }),
      item('assembly_hand_tools', 'required', [target('cat8', 'Handwerkzeuge')], {
        conditions: [when('task', ['assemble'])],
        assumption: 'An assembly task was selected; fastener type and required torque remain unknown.',
      }),
      item('dust_collection_equipment', 'recommended', [target('cat5', 'Staubsauger')], {
        conditions: [when('workspace', ['indoor']), when('task', ['drill', 'sand', 'saw'])],
        assumption: 'Indoor dust may need collection; filtration class and tool connection require verification.',
      }),
      item('manual_support_tools', 'recommended', [target('cat8', 'Handwerkzeuge')], {
        assumption: 'Measuring, holding, or manual finishing may require separate compatible tools.',
      }),
      item('workshop_support_equipment', 'optional', [target('cat20', 'Werkstatt')], {
        assumption: 'A stable support setup may help, but dimensions and load rating remain unknown.',
      }),
    ],
    assumptions: [
      conditionalAssumption('The planner does not assess structural, electrical, gas, asbestos, or other hazardous-building work.'),
      conditionalAssumption('Beginner experience was selected; professional instruction or execution may be required.', [when('experience', ['beginner'])]),
      conditionalAssumption('No safe power source was confirmed; powered results require a separately verified supply.', [when('power_access', ['unavailable'])]),
    ],
    compatibilityRules: [
      'Tool, accessory, material, dimensions, power supply, and dust-control interfaces must match exact listing facts.',
      'The planner does not infer bits, blades, abrasives, fasteners, or consumables from a category label.',
    ],
    safetyRules: [
      'Stop and use a qualified professional for structural, mains-electrical, gas, asbestos, or uncertain hidden-service work.',
      'Guarding, workpiece support, dust control, competence, and personal protection must be verified before use.',
    ],
  }),
  template({
    id: 'garden',
    title: 'Gartenprojekt',
    questions: [
      question('task', 'Welche Gartenarbeit steht im Mittelpunkt?', ['mow', 'trim', 'water', 'plant']),
      question('area_size', 'Wie groß ist der betroffene Gartenbereich?', ['small', 'medium', 'large']),
      question('terrain', 'Wie ist das Gelände überwiegend?', ['level', 'sloped', 'mixed']),
      question('power_access', 'Ist ein sicherer Stromanschluss erreichbar?', ['available', 'unavailable']),
      question('weather', 'Welche Arbeitsbedingungen werden erwartet?', ['dry', 'damp', 'unknown']),
    ],
    items: [
      item('lawn_mowing_tool', 'required', [target('cat7', 'Rasenmäher')], {
        conditions: [when('task', ['mow'])],
        assumption: 'Mowing was selected; terrain, wet-grass, gradient, and area limits require item verification.',
      }),
      item('hedge_trimming_tool', 'required', [target('cat7', 'Heckenscheren')], {
        conditions: [when('task', ['trim'])],
        assumption: 'Hedge trimming was selected; height, branch size, nesting, and access remain unknown.',
      }),
      item('garden_watering_equipment', 'required', [target('cat7', 'Bewässerung')], {
        conditions: [when('task', ['water'])],
        assumption: 'Watering was selected; connector, pressure, source, and local restrictions remain unknown.',
      }),
      item('planting_garden_tools', 'required', [target('cat7', 'Gartengeräte')], {
        conditions: [when('task', ['plant'])],
        assumption: 'Planting was selected; soil, underground services, and required depth remain unknown.',
      }),
      item('garden_hand_tools', 'recommended', [target('cat8', 'Handwerkzeuge')], {
        assumption: 'Manual preparation or finishing may require separate garden-safe hand tools.',
      }),
      item('garden_watering_support', 'optional', [target('cat7', 'Bewässerung')], {
        assumption: 'Watering support is optional; source, connector, pressure, and restrictions remain unresolved.',
      }),
      item('additional_area_garden_tool', 'optional', [target('cat7', 'Gartengeräte')], {
        conditions: [when('area_size', ['large'])],
        assumption: 'A large area was stated; an additional compatible item type may reduce handoffs.',
      }),
      item('plant_container_equipment', 'optional', [target('cat7', 'Pflanzkisten')], {
        conditions: [when('task', ['plant'])],
        assumption: 'Planting containers may be relevant, but dimensions and load remain unresolved.',
      }),
    ],
    assumptions: [
      conditionalAssumption('No pesticide, fertilizer, chemical treatment, tree felling, or living thing is recommended.'),
      conditionalAssumption('Damp or unknown conditions were selected; electrical and terrain suitability require extra verification.', [when('weather', ['damp', 'unknown'])]),
      conditionalAssumption('No safe power source was confirmed; powered results require a separately verified supply.', [when('power_access', ['unavailable'])]),
    ],
    compatibilityRules: [
      'Area, gradient, vegetation size, weather rating, power, and accessory interfaces require exact listing facts.',
      'A category match cannot establish safe blade reach, branch capacity, slope rating, or wet-use suitability.',
    ],
    safetyRules: [
      'Check for people, animals, nests, buried services, overhead lines, unstable slopes, and weather before work.',
      'Tree felling, chainsaw selection, pesticides, chemicals, and professional landscaping services are outside this planner.',
    ],
  }),
  template({
    id: 'move',
    title: 'Umzug vorbereiten',
    questions: [
      question('load_size', 'Wie groß ist die zu bewegende Menge?', ['small', 'medium', 'large']),
      question('stairs', 'Sind Treppen im Weg?', ['none', 'some', 'many']),
      question('disassembly', 'Müssen Gegenstände zerlegt werden?', ['yes', 'no']),
      question('fragile_items', 'Sind zerbrechliche Gegenstände dabei?', ['yes', 'no']),
      question('transport_arranged', 'Ist der eigentliche Transport bereits separat organisiert?', ['yes', 'no']),
    ],
    items: [
      item('carrying_and_storage_equipment', 'required', [
        target('cat23', 'Rucksäcke & Koffer'),
        target('cat20', 'Lager'),
      ], {
        assumption: 'Container size, weight rating, stairs, and object dimensions remain unresolved.',
      }),
      item('moving_support_accessories', 'recommended', [target('cat20', 'Zubehör')], {
        assumption: 'Non-consumable support accessories may be useful; exact type and load rating require listing facts.',
      }),
      item('additional_moving_accessory', 'optional', [target('cat20', 'Zubehör')], {
        assumption: 'An additional non-consumable moving accessory may be useful; exact need remains unresolved.',
      }),
      item('basic_disassembly_tools', 'recommended', [target('cat8', 'Handwerkzeuge')], {
        conditions: [when('disassembly', ['yes'])],
        assumption: 'Disassembly was selected; fastener type and reassembly requirements remain unknown.',
      }),
      item('additional_storage_capacity', 'optional', [target('cat20', 'Lager')], {
        conditions: [when('load_size', ['large'])],
        assumption: 'A large load was stated; additional temporary storage equipment may be relevant.',
      }),
    ],
    assumptions: [
      conditionalAssumption('Vehicles, drivers, delivery, shipping, and transport services are not part of this plan.'),
      conditionalAssumption('No transport was confirmed; the plan remains limited to preparation equipment and is not a complete move solution.', [when('transport_arranged', ['no'])]),
      conditionalAssumption('Fragile items were reported; packaging consumables and professional handling remain outside rental inventory resolution.', [when('fragile_items', ['yes'])]),
    ],
    compatibilityRules: [
      'Dimensions, item weight, equipment load rating, stair geometry, and user capacity must be checked against real facts.',
      'The planner never treats a storage or carrying item as authorization for vehicle or paid-delivery use.',
    ],
    safetyRules: [
      'Do not lift beyond personal capacity; secure routes and use qualified help for heavy, awkward, or hazardous loads.',
      'The planner provides no vehicle, driver, transport, rigging, hoisting, or professional moving service.',
    ],
  }),
  template({
    id: 'event_camping',
    title: 'Event oder Camping',
    questions: [
      question('focus', 'Geht es hauptsächlich um Event oder Camping?', ['event', 'camping']),
      question('participants', 'Wie viele Personen sind ungefähr eingeplant?', ['few', 'group', 'large_group']),
      question('environment', 'Findet die Nutzung innen oder außen statt?', ['indoor', 'outdoor']),
      question('overnight', 'Ist eine Übernachtung vorgesehen?', ['yes', 'no']),
      question('power_access', 'Ist ein sicherer Stromanschluss erreichbar?', ['available', 'unavailable']),
    ],
    items: [
      item('event_core_equipment', 'required', [target('cat22', 'Eventtechnik')], {
        conditions: [when('focus', ['event'])],
        assumption: 'An event was selected; venue, power, noise, load, and connector requirements remain unknown.',
      }),
      item('camping_shelter', 'required', [target('cat23', 'Zelte')], {
        conditions: [when('focus', ['camping'])],
        assumption: 'Camping was selected; capacity, weather, site rules, and setup space remain unknown.',
      }),
      item('event_seating_and_tables', 'recommended', [target('cat22', 'Tische & Stühle')], {
        conditions: [when('focus', ['event'])],
        assumption: 'Seating needs are estimated only from the selected participant band.',
      }),
      item('camping_outdoor_accessories', 'recommended', [target('cat23', 'Outdoor-Zubehör')], {
        conditions: [when('focus', ['camping'])],
        assumption: 'Outdoor accessories may be relevant, but exact weather and site requirements remain unknown.',
      }),
      item('camping_sleep_system', 'recommended', [target('cat23', 'Schlafsäcke')], {
        conditions: [when('focus', ['camping']), when('overnight', ['yes'])],
        assumption: 'An overnight stay was selected; temperature rating and personal suitability require verification.',
      }),
      item('event_shelter', 'optional', [target('cat22', 'Pavillons')], {
        conditions: [when('focus', ['event']), when('environment', ['outdoor'])],
        assumption: 'An outdoor event was selected; anchoring, wind, site permission, and dimensions remain unknown.',
      }),
      item('event_decoration', 'optional', [target('cat22', 'Party-Deko')], {
        conditions: [when('focus', ['event'])],
        assumption: 'Decoration is optional and must comply with venue and fire-safety rules.',
      }),
      item('camping_kitchen_equipment', 'optional', [target('cat23', 'Campingküche')], {
        conditions: [when('focus', ['camping'])],
        assumption: 'Equipment only may be searched; fuel, food, fire permission, and staffed service are excluded.',
      }),
    ],
    assumptions: [
      conditionalAssumption('No food, drink, fuel, generator, staffed catering, venue service, or transport is included.'),
      conditionalAssumption('No safe power source was confirmed; powered event results require a separately verified supply.', [when('focus', ['event']), when('power_access', ['unavailable'])]),
      conditionalAssumption('A large group was selected; G4B must verify capacity for every real item rather than infer it from category.', [when('participants', ['large_group'])]),
    ],
    compatibilityRules: [
      'Capacity, dimensions, venue/site rules, weather rating, anchoring, power, connectors, and noise limits require exact facts.',
      'Event and camping equipment may share a project but must still match the selected focus and real availability.',
    ],
    safetyRules: [
      'Outdoor shelter, electrical equipment, cooking equipment, fire, weather, anchoring, and venue rules require user verification.',
      'No food service, staffed catering, fuel, generator, emergency, security, or transport service is recommended.',
    ],
  }),
]);

function conditionsMatch(conditions, answers) {
  return conditions.every((condition) => condition.values.includes(answers[condition.answerId]));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

function templateById(templateId) {
  const id = typeof templateId === 'string' ? templateId.trim() : '';
  const match = plannerTemplates.find((entry) => entry.id === id);
  if (!match) throw new PlannerCoreError('planner_template_not_found');
  return match;
}

function validatedAnswers(source, selectedTemplate) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new PlannerCoreError('planner_answers_required');
  }
  const expected = new Set(selectedTemplate.questions.map((entry) => entry.id));
  if (Object.keys(source).some((key) => !expected.has(key))) {
    throw new PlannerCoreError('planner_answer_not_expected');
  }
  const answers = {};
  for (const entry of selectedTemplate.questions) {
    const value = typeof source[entry.id] === 'string' ? source[entry.id].trim() : '';
    if (!entry.options.includes(value)) {
      throw new PlannerCoreError(`planner_answer_invalid:${entry.id}`);
    }
    answers[entry.id] = value;
  }
  return answers;
}

export function plannerTemplateQuestions(templateId) {
  const selectedTemplate = templateById(templateId);
  return selectedTemplate.questions;
}

/// Public, deterministic question catalog for the closed-pilot client.
/// It deliberately omits rules and assumptions that are only meaningful to
/// the server-side resolver; the resolver remains the source of truth.
export function plannerTemplateCatalog() {
  return deepFreeze({
    plannerVersion: plannerCoreVersion,
    templates: plannerTemplates.map((entry) => ({
      id: entry.id,
      title: entry.title,
      questions: entry.questions.map((questionEntry) => ({
        id: questionEntry.id,
        prompt: questionEntry.prompt,
        type: questionEntry.type,
        options: [...questionEntry.options],
      })),
    })),
    externalGenerativeAiUsed: false,
    serverResolutionRequired: true,
  });
}

export function createDeterministicFirstPlan(templateId, rawAnswers) {
  const selectedTemplate = templateById(templateId);
  const answers = validatedAnswers(rawAnswers, selectedTemplate);
  const items = selectedTemplate.items
    .filter((entry) => conditionsMatch(entry.conditions, answers))
    .map((entry) => ({
      itemType: entry.itemType,
      priority: entry.priority,
      catalogTargets: entry.catalogTargets.map(({ categoryId, subcategory, catalogKey }) => ({
        categoryId,
        subcategory,
        catalogKey,
      })),
      assumption: entry.assumption,
    }));
  if (priorities.some((priority) => !items.some((entry) => entry.priority === priority))) {
    throw new PlannerCoreError('planner_template_result_priority_incomplete');
  }
  const assumptions = selectedTemplate.assumptions
    .filter((entry) => conditionsMatch(entry.conditions, answers))
    .map((entry) => entry.text);
  const plan = {
    plannerVersion: plannerCoreVersion,
    templateId: selectedTemplate.id,
    templateTitle: selectedTemplate.title,
    reviewStatus: selectedTemplate.reviewStatus,
    generationMode: 'deterministic_rules_only',
    externalGenerativeAiUsed: false,
    answers,
    items,
    assumptions,
    compatibilityRules: [...globalCompatibilityRules, ...selectedTemplate.compatibilityRules],
    safetyRules: [...globalSafetyRules, ...selectedTemplate.safetyRules],
    serverTruth: {
      status: 'unresolved_until_g4b',
      requiredFacts: unresolvedServerFacts,
      inventoryQueried: false,
      reservationCreated: false,
    },
  };
  return deepFreeze({ ...plan, planHash: hash(plan) });
}

export function assertPlannerCoreTechnicalAccess(config) {
  if (config?.planner?.enabled !== true
      || config.planner.publicReleaseAllowed !== false
      || config.planner.externalGenerativeAiAllowed !== false
      || config.planner.inventoryResolutionAllowed !== false) {
    throw new PlannerCoreError('planner_core_not_enabled');
  }
  return true;
}
