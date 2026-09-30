// Package authoring schema only. This does not grant runtime authority.
export const text = { type: 'string', minLength: 1, maxLength: 2048 };
const integer = { type: 'integer', minimum: 1, maximum: 4 };
export const list = (items = text, minItems = 1) => ({ type: 'array', items, minItems, maxItems: 64 });
export const object = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const fields = names => Object.fromEntries(names.split(' ').map(k => [k, text]));
const strings = names => Object.fromEntries(names.split(' ').map(k => [k, list()]));
const relation = object({ actor: text, basis: text });
const actor = { ...fields('identity role affiliation'), competencies: list(), relations: list(relation), availability: object(fields('location pattern')), matters: list(), formalClaims: list(text, 0), promotionHooks: list() };
const publicDescription = object({ publicDescription: text });
const playerDescription = object({ playerDescription: text });
const backgrounds = { canon: object({ ...fields('institution socialAccess startingBelief activation'), ...strings('knowledgeAccess proceduralFamiliarity limits'), relationshipBudget: { type: 'integer', minimum: 1, maximum: 1 } }), perspective: publicDescription };
export const kinds = {
 civic_office: { canon: object(fields('publicFunction parentAuthority liaison jurisdiction')), perspective: publicDescription },
 district: { canon: object(fields('function history jurisdiction')), perspective: publicDescription },
 location: { canon: object({ ...fields('district geographicRelation controller publicFunction specialState availability'), ...strings('accessRules actors artifacts historicalEvents hooks safeGenerationZones') }), perspective: publicDescription },
 institution: { canon: object({ ...fields('publicRole realFunction jurisdiction internalTension eastbank'), ...strings('records actors claimTraditions accessRoutes obligations materialThreats'), agendas: { ...list(object(fields('id objective trigger activation'))), maxItems: 3 } }), perspective: object({ publicDescription: text, ...strings('initialKnowledge knownUnknowns blindSpots') }) },
 actor_a: { canon: object({ ...actor, ...fields('privateMotive'), ...strings('constraints personalAnchors legitimateAccess changeHooks'), agenda: object(fields('objective changeHook')) }), perspective: object({ publicIdentity: text, ...strings('beliefs memories knownSecrets unknowns') }) },
 actor_b: { canon: object(actor), perspective: object({ publicIdentity: text, ...strings('beliefs memories') }) },
 matter_hook: { canon: object(fields('institution trigger activation')), perspective: publicDescription },
 historical_event: { canon: object({ timeScope: text, ...strings('facts limits') }), perspective: publicDescription },
 canon_fragment: { canon: object({ ...fields('subject timeScope epistemicStatus'), ...strings('assertions events holders evidenceGateways projectionRules'), revealLayer: integer, conflictingRecords: list(object(fields('artifact conflict'))) }), perspective: object(fields('currentlySupportable')) },
 canon_index: { canon: object({ fragments: list(), loading: text }), perspective: publicDescription },
 artifact_template: { canon: object({ semanticPayload: object({ ...fields('issuer issueTime subject assertedProposition custody provenance integrity accessRestriction'), names: list(text, 0), dates: list(text, 0), signatures: list(text, 0) }), ...fields('renderedTextPolicy instanceStatus') }), perspective: object(fields('weakerClaim knowledgeStatus')) },
 tradition: { canon: object(strings('anchorPatterns pricePatterns limits')), perspective: publicDescription },
 claim_primitive: { canon: object({ ...fields('effect runtimeStatus'), ...strings('principles hardLimits') }), perspective: playerDescription },
 claim_seed: { canon: object({ ...fields('primitive coreRule condition starterJurisdiction runtimeStatus'), ...strings('principles eligibilityImprints anchorFamilies priceFamilies traditions forbiddenExtensions diagnosticSigns') }), perspective: playerDescription },
 claim_archetype: { canon: object({ ...fields('primitive coreRule conditionFamily baseJurisdiction runtimeStatus'), ...strings('principles anchorPatterns pricePatterns growthDirections incompatibilities failureModes traditions engineeringLimits hardProhibitions') }), perspective: playerDescription },
 anomaly: { canon: object({ ...fields('coreContradiction requiredSubstrate escalation mundaneInteraction claimInteraction'), ...strings('principles observableSigns evidenceSignatures falseExplanations resolutionFamilies hardLimits'), institutionalInterpretations: list(object(fields('institution interpretation'))) }), perspective: publicDescription },
 origin: backgrounds, prior_life: backgrounds, faith: backgrounds,
 public_knowledge: { canon: object(fields('issuer text epistemicStatus')), perspective: publicDescription },
};
export const schemaFor = kind => {
 if (!kinds[kind]) throw new Error('Unknown content kind: ' + kind);
 return object({ ...fields('id kind name purpose authority disclosure generationPolicy'), dependencies: list(text, 0), invariants: list(), generationEnvelope: list(), ...kinds[kind] });
};
export function assertShape(value, schema, at = '$') {
 const fail = message => { throw new Error(at + ': ' + message); };
 if (schema.type === 'object') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected object');
  for (const key of schema.required) if (!Object.hasOwn(value, key)) fail('missing ' + key);
  for (const key of Object.keys(value)) {
   if (!Object.hasOwn(schema.properties, key)) fail('unknown field ' + key);
   assertShape(value[key], schema.properties[key], at + '.' + key);
  }
 } else if (schema.type === 'array') {
  if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) fail('array bounds');
  value.forEach((item, i) => assertShape(item, schema.items, at + '[' + i + ']'));
 } else if (schema.type === 'integer') {
  if (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum) fail('integer bounds');
 } else if (typeof value !== 'string' || value.length < schema.minLength || value.length > schema.maxLength || value.includes('\uFFFD')) fail('string bounds/encoding');
}
