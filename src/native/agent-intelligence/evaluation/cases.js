import { createHash } from 'node:crypto';

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
    const names = promotion ? ['Mira', 'Tidal Archive', 'Sea Lantern'] : ['Eren', 'Forest Workshop', 'Cedar Compass'];
    return {
        family, actor: names[0], projectName: names[1], proposedName: names[2],
        input: family.startsWith('rp_') ? `The player pauses at the ${promotion ? 'harbor' : 'forest'} gate. ${names[0]} may react; the player's next action is undecided.` : `Rename ${names[1]} to ${names[2]} through a reviewed metadata proposal.`,
        memory: {
            visible: [{ id: 'promise', revision: 1, text: `Meet at ${promotion ? 'dusk' : 'dawn'}.` }, { id: 'promise', revision: 2, text: `Revision: meet at ${promotion ? 'noon' : 'midnight'} instead.` }],
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
        fixtureRef: `synthetic:v1:${family}:${split}`, fixtureHash: hash(data), inputHash: hash(data.input),
        rubricRevision: hash({ invariants: spec.invariants, dimensions: spec.dimensions, grading: 'ungraded scripted baseline v1' }),
        requiredCapabilities: [...spec.capabilities], limits: { maxRequests: 6, maxRepairRounds: 2 },
        expectedInvariants: [...spec.invariants], behaviorDimensions: [...spec.dimensions],
    };
    return { ...entry, caseRevision: hash(entry) };
}
export function validateCase(entry) {
    const expected = Object.keys(families).flatMap(family => ['development', 'promotion'].map(split => makeCase(family, split))).find(item => item.caseId === entry?.caseId);
    if (!expected || canonical(entry) !== canonical(expected)) throw new Error('Case identity/revision/schema drift');
    return entry;
}
function freezeTree(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freezeTree); Object.freeze(value); }
    return value;
}
export const CASES = freezeTree(Object.keys(families).flatMap(family => ['development', 'promotion'].map(split => makeCase(family, split))));
export const CASE_SET_REVISION = hash(CASES);

// Extraction sees development only. Evaluation must explicitly select a split;
// no consumer is handed a mixed corpus by default.
export function selectCases({ purpose, split }) {
    if (!['extraction', 'evaluation'].includes(purpose) || !['development', 'promotion'].includes(split)) throw new Error('Explicit purpose/split required');
    if (purpose === 'extraction' && split !== 'development') throw new Error('Promotion split is evaluator-only');
    return CASES.filter(entry => entry.split === split);
}
export function loadFixture(entry, { purpose }) {
    validateCase(entry);
    selectCases({ purpose, split: entry.split });
    return fixture(entry.caseId.replace(/_[dp]1$/, ''), entry.split === 'promotion');
}

export function publicCaseScenario(entry) { const value = loadFixture(entry, { purpose: 'evaluation' }); return { input: value.input, actor: value.actor, visibleMemory: value.memory.visible }; }
