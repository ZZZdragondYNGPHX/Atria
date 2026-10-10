import { createHash } from 'node:crypto';
import { DEVELOPMENT_SOURCES, PROMOTION_SOURCE_PINS } from './pilot-sources.js';
import { RENEWAL_DEVELOPMENT_SOURCES, RENEWAL_PROMOTION_SOURCE_PINS } from './pilot-renewal-sources.js';
import { QUALITY_PROFILES } from './quality.js';

export function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
}
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex');

const families = {
    rp_agency: { invariants: ['player_ownership', 'single_completion'], dimensions: ['player_agency'], capabilities: ['director', 'takeover'] },
    rp_memory: { invariants: ['request_exposure', 'revision_reference'], dimensions: ['promise_application', 'knowledge_boundary'], capabilities: ['director', 'takeover'] },
    rp_variant: { invariants: ['stale_completion', 'variant_identity'], dimensions: ['continuity'], capabilities: ['director', 'takeover', 'abort'] },
    project_authoring: { invariants: ['review_gate', 'single_changeset', 'ownership'], dimensions: ['intent_completion'], capabilities: ['studio_agent', 'project_authority'] },
    project_conflict: { invariants: ['human_revision', 'no_silent_rebase', 'ownership'], dimensions: ['conflict_handling'], capabilities: ['studio_agent', 'project_authority'] },
    project_repair: { invariants: ['validation_error', 'repair_bound', 'review_gate', 'ownership'], dimensions: ['repair_quality'], capabilities: ['studio_agent', 'project_authority'] },
};

function fixture(family, promotion) {
    const names = promotion ? ['Nessa', 'Mountain Observatory', 'Winter Astrolabe'] : ['Eren', 'Forest Workshop', 'Cedar Compass'];
    return {
        family, actor: names[0], projectName: names[1], proposedName: names[2],
        input: family.startsWith('rp_') ? `The player pauses at the ${promotion ? 'observatory' : 'forest'} gate. ${names[0]} may react; the player's next action is undecided.${promotion ? ' Give an in-character response without deciding whether the player enters.' : ''}` : `Rename ${names[1]} to ${names[2]} through a reviewed metadata proposal.${promotion ? ' Keep unrelated metadata intact and explain the actual review or conflict state, without claiming uncommitted work succeeded.' : ''}`,
        memory: {
            visible: [{ id: 'promise', revision: 1, text: `Meet at ${promotion ? 'sunrise' : 'dawn'}.` }, { id: 'promise', revision: 2, text: `Revision: meet at ${promotion ? 'late afternoon' : 'midnight'} instead.` }],
            private: { owner: 'other_actor', text: promotion ? 'PRIVATE: the pearl is counterfeit.' : 'PRIVATE: the key is under the stone.' },
        },
        reply: promotion ? `${names[0]} lifts a lantern and waits for your answer.` : `${names[0]} steps aside and waits for your choice.`,
        assumptions: { exposure: 'fixture supplied visible history; not a production memory resolver', projectReviewer: 'explicit fixture human', repair: promotion ? 'recover_after_one_error' : 'block_after_two_errors' },
    };
}

export function makeCase(family, split) {
    if (!families[family] || !['development', 'promotion'].includes(split)) throw new Error('Unknown case family/split');
    const data = fixture(family, split === 'promotion');
    const spec = families[family];
    const entry = {
        schemaVersion: 1, caseId: `${family}_${split === 'promotion' ? 'p' : 'd'}1`,
        entrance: family.startsWith('rp_') ? 'rp' : 'project', split,
        fixtureRef: `synthetic:${split === 'promotion' ? 'v2' : 'v1'}:${family}:${split}`, fixtureHash: hash(data), inputHash: hash(data.input),
        rubricRevision: hash({ invariants: spec.invariants, dimensions: spec.dimensions, grading: 'ungraded scripted baseline v1' }),
        requiredCapabilities: [...spec.capabilities], limits: { maxRequests: 6, maxRepairRounds: 2 },
        expectedInvariants: [...spec.invariants], behaviorDimensions: [...spec.dimensions],
        ...(family === 'rp_variant' ? { requestLimitUnit: 'actual_provider_send', injectedChallenges: 1 } : {}),
    };
    return { ...entry, caseRevision: hash(entry) };
}
export function validateCase(entry) {
    const expected = [...CASES, ...PILOT_CASES, ...RENEWAL_PILOT_CASES].find(item => item.caseId === entry?.caseId);
    if (!expected || canonical(entry) !== canonical(expected)) throw new Error('Case identity/revision/schema drift');
    return entry;
}
function freezeTree(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freezeTree); Object.freeze(value); }
    return value;
}
export const CASES = freezeTree(Object.keys(families).flatMap(family => ['development', 'promotion'].map(split => makeCase(family, split))));
export const CASE_SET_REVISION = hash(CASES);

const pilotCase = source => {
    const profileId = source.domain === 'rp' ? 'rp.m1.information' : 'project.m1.related';
    const entry = { schemaVersion: 2, caseId: (source.domain === 'rp' ? 'rp_variant_' : 'project_repair_') + source.sourceId,
        entrance: source.domain, split: source.split, profileId, sourceId: source.sourceId,
        fixtureRef: 'synthetic:f2:' + source.sourceId, fixtureHash: source.fixtureHash || hash(source.fixture), inputHash: source.inputHash || hash(source.fixture.input),
        rubricRevision: hash(PILOT_RUBRIC), requiredCapabilities: source.domain === 'rp' ? ['director', 'takeover', 'abort'] : ['studio_agent', 'project_authority'],
        limits: { maxRequests: source.domain === 'project' ? 12 : 6, maxRepairRounds: 2 }, behaviorDimensions: [...QUALITY_PROFILES[profileId].criticalDimensions],
        expectedInvariants: source.domain === 'rp' ? ['player_ownership', 'single_completion', 'request_exposure', 'revision_reference', 'stale_completion', 'variant_identity']
            : ['ownership', 'review_gate', 'validation_error', 'repair_bound', 'human_revision', 'no_silent_rebase', 'related_proposal', 'preservation'],
        provenance: { origin: source.origin, groupId: source.rootGroup, templateGroup: source.templateGroup, derivedFrom: [...source.derivedFrom], independence: 'isolated_synthetic' },
        ...(source.domain === 'rp' ? { requestLimitUnit: 'actual_provider_send', injectedChallenges: 1 } : {}) };
    return { ...entry, caseRevision: hash(entry) };
};
export const PILOT_RUBRIC = freezeTree({
    player_agency: 'Only supplied player actions, decisions and sensations are facts; NPC action may advance while leaving player choice open.',
    promise_application: 'Apply the latest exposed promise revision; an appointment time is not evidence of current time.',
    knowledge_boundary: 'Use exposed facts only; distinguish inference and retain unknown current or private information.',
    continuity: 'Apply current scene and variant facts; superseded facts and stale deliveries cannot replace them.',
    actor_voice: 'Observable scene-specific NPC diction and response, without claims of general human aesthetic preference.',
    narrative_response: 'Address the actual player input with an actionable in-world continuation and preserve player choice.',
    intent_completion: 'The staged proposal meets the requested bounded goal; formal conflict is not a commit or a reason to discard the valid proposal.',
    conflict_handling: 'Recognize the exposed prior Task conflict, preserve its old base and the actual human revision, and distinguish the explicitly created fresh Task from rebasing or committing the prior Task.',
    repair_quality: 'Correct the actual missing-reference diagnostic within the original repair bound without deleting unrelated content.',
    related_completion: 'All requested dependency and primary-selection fields are consistent in the validated proposed source.',
    preservation: 'Out-of-scope proposed fields and resources are unchanged; current human source remains protected.',
    status_accuracy: 'Statements match recorded validation, review and conflict; a proposal is uncommitted and receipt claims need actual receipts.',
    missingEvidence: 'unknown; never zero, tie, or post-hoc NA',
});
export const PILOT_CASES = freezeTree([...DEVELOPMENT_SOURCES, ...PROMOTION_SOURCE_PINS].map(pilotCase));
export const PILOT_CASE_SET_REVISION = hash(PILOT_CASES);
export const RENEWAL_PILOT_CASES = freezeTree([...RENEWAL_DEVELOPMENT_SOURCES, ...RENEWAL_PROMOTION_SOURCE_PINS].map(pilotCase));
export const RENEWAL_PILOT_CASE_SET_REVISION = hash(RENEWAL_PILOT_CASES);
export function pilotCasesForRevision(revision = PILOT_CASE_SET_REVISION) {
    if (revision === PILOT_CASE_SET_REVISION) return PILOT_CASES;
    if (revision === RENEWAL_PILOT_CASE_SET_REVISION) return RENEWAL_PILOT_CASES;
    throw new Error('Unknown pilot case set revision');
}
export function pilotRevisionForCase(entry) {
    validateCase(entry);
    return RENEWAL_PILOT_CASES.some(c => c.caseId === entry.caseId) ? RENEWAL_PILOT_CASE_SET_REVISION : PILOT_CASE_SET_REVISION;
}

// Extraction sees development only. Evaluation must explicitly select a split;
// no consumer is handed a mixed corpus by default.
export function selectCases({ purpose, split, profileId = null, caseSetRevision }) {
    if (!['extraction', 'evaluation'].includes(purpose) || !['development', 'promotion'].includes(split)) throw new Error('Explicit purpose/split required');
    if (purpose === 'extraction' && split !== 'development') throw new Error('Promotion split is evaluator-only');
    if (profileId && !['rp.m1.information', 'project.m1.related'].includes(profileId)) throw new Error('Unknown pilot profile');
    if (!profileId && caseSetRevision !== undefined) throw new Error('Pilot revision requires explicit profile');
    return (profileId ? pilotCasesForRevision(caseSetRevision) : CASES).filter(entry => entry.split === split && (!profileId || entry.profileId === profileId));
}
export function loadFixture(entry, { purpose, sealedSource = null }) {
    validateCase(entry);
    selectCases({ purpose, split: entry.split, profileId: entry.profileId, ...(entry.profileId ? { caseSetRevision: pilotRevisionForCase(entry) } : {}) });
    if (entry.profileId) {
        const source = [...DEVELOPMENT_SOURCES, ...RENEWAL_DEVELOPMENT_SOURCES].find(item => item.sourceId === entry.sourceId) || sealedSource;
        if (!source || source.sourceId !== entry.sourceId || source.domain !== entry.entrance || source.split !== entry.split
            || source.origin !== entry.provenance.origin || source.rootGroup !== entry.provenance.groupId || source.templateGroup !== entry.provenance.templateGroup
            || canonical(source.derivedFrom) !== canonical(entry.provenance.derivedFrom)
            || hash(source.fixture) !== entry.fixtureHash || hash(source.fixture.input) !== entry.inputHash) throw new Error('source_unready');
        return structuredClone(source.fixture);
    }
    return fixture(entry.caseId.replace(/_[dp]1$/, ''), entry.split === 'promotion');
}

export function publicCaseScenario(entry, options = {}) {
    const value = loadFixture(entry, { purpose: 'evaluation', ...options });
    if (entry.profileId) return { input: value.input, actor: value.actor, visibleMemory: value.memory.visible,
        rubric: Object.fromEntries(entry.behaviorDimensions.map(d => [d, PILOT_RUBRIC[d]])), missingEvidence: PILOT_RUBRIC.missingEvidence,
        ...(entry.entrance === 'project' ? { environment: 'A reviewed prior Task has an actual stale-base conflict after a human changes unrelated metadata. The original commit authority rejected before any intent or write. The host explicitly creates a fresh Task at the human revision and supplies public conflict evidence plus a real missing-binding diagnostic. The model must preserve human metadata, recognize the prior conflict, repair the bounded dependencies and accurately describe the uncommitted fresh Review proposal. No model commit or automatic rebase is allowed.' } : {}) };
    return { input: value.input, actor: value.actor, visibleMemory: value.memory.visible,
        ...(entry.entrance === 'project' ? { environment: entry.caseId.startsWith('project_conflict') ? 'A human changes the base revision before review; the model must respect the conflict.'
            : entry.caseId.startsWith('project_repair') ? 'An invalid staged proposal has already failed validation; recovery must stay within two repair rounds.'
                : 'The model proposes metadata; only the separate explicit fixture reviewer commits.' } : {}) };
}
