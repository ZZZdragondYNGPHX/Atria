import { test, expect } from '@jest/globals';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { assertInformationClosure } from '../../public/shared/native-information-contract.js';
import { informationContext, projectInformation } from '../../public/shared/native-information-runtime.js';
import { deriveExpressionPlan, expressionPlanCurrent } from '../../public/shared/native-expression-runtime.js';
import { informationItemFingerprint } from '../../public/shared/native-cognition-runtime.js';
import { appraisalStateSchema } from '../../public/shared/native-appraisal-contract.js';
import { memoryStateSchema } from '../../public/shared/native-memory-contract.js';
import { informationFixture, informationSnapshot, informationActor, informationOtherActor, addInformationRecord } from './helpers/information-fixture.js';

function declaration(mode = 'limited') {
    const contract = informationFixture(), info = contract.informationRuntime;
    info.graphs = [];
    info.views.find(view => view.id === 'player').sources = ['beliefs'];
    info.narration = { mode, contextViewId: 'pov', disclosureViewId: 'player', expression: { actorId: informationActor, intent: 'inform', sourceIds: ['beliefs'] } };
    return contract;
}
function snapshot() {
    const base = informationSnapshot(); base.manifest = structuredClone(base.manifest);
    base.manifest.runtime.experienceContract = structuredClone(assertNativeExperienceContract(declaration()));
    base.manifest.actors = [{ actorId: informationActor }, { actorId: informationOtherActor }];
    base.session.sessionId = 'ses_' + 'a'.repeat(32); base.session.packageVersionId = 'pkgv_' + 'b'.repeat(32);
    base.revision.revisionId = 'rev_' + 'c'.repeat(32); base.revision.branchId = 'br_' + 'd'.repeat(32);
    return base;
}
const information = base => informationContext(base, { kind: 'narrator' }, undefined, { includeRollups: false });

test('optional expression declaration uses only an existing Actor and intersected context/display grants', () => {
    for (const intent of ['inform', 'ask', 'reassure', 'decline', 'reflect']) {
        const contract = declaration(); contract.informationRuntime.narration.expression.intent = intent;
        expect(assertNativeExperienceContract(contract).informationRuntime.narration.expression.intent).toBe(intent);
    }
    for (const mutate of [
        expression => { expression.intent = 'perform_action'; }, expression => { expression.actorId = informationOtherActor; },
        expression => { expression.sourceIds = []; }, expression => { expression.sourceIds = ['beliefs', 'beliefs']; },
        expression => { expression.sourceIds = ['memories']; }, expression => { expression.sourceIds = ['missing']; },
        expression => { expression.sourceIds = Array.from({ length: 9 }, (_, i) => 'source' + i); }, expression => { expression.text = 'caller prose'; },
    ]) {
        const contract = declaration(); mutate(contract.informationRuntime.narration.expression);
        expect(() => assertNativeExperienceContract(contract)).toThrow();
    }
    const foreign = declaration(); foreign.informationRuntime.actors.push({ id: informationOtherActor, scopeId: 'session' });
    foreign.informationRuntime.narration.expression.actorId = informationOtherActor;
    expect(() => assertNativeExperienceContract(foreign)).toThrow(/Perspective Actor/);
    const def = assertNativeExperienceContract(declaration()).informationRuntime;
    expect(() => assertInformationClosure(def, { actors: [], worlds: [{ world: { worldId: def.sources.find(source => source.kind === 'world').worldId } }] })).toThrow(/exact Package/);
});

test('text plan preserves public belief qualifiers, excludes other Actors and private context, and never mutates the snapshot', () => {
    const base = snapshot(), before = structuredClone(base), info = information(base);
    const plan = deriveExpressionPlan(base, info);
    expect(plan).toMatchObject({ schemaVersion: 1, kind: 'expression_plan', mode: 'text', status: 'ready', intent: 'inform', actorId: informationActor });
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ semantic: 'belief', epistemicStatus: 'believed', channel: 'rumor' });
    expect(plan.sourceRefs).toEqual([{ itemId: plan.items[0].id, fingerprint: informationItemFingerprint(plan.items[0]) }]);
    for (const secret of ['OTHER BELIEF', 'OTHER THREAD', 'WORLD SECRET', 'PRIVATE RAW HISTORY', 'Visited yesterday']) expect(JSON.stringify(plan)).not.toContain(secret);
    expect(base).toEqual(before); expect(expressionPlanCurrent(base, info, plan)).toBe(true);
    const forged = structuredClone(plan); forged.intent = 'decline'; expect(expressionPlanCurrent(base, info, forged)).toBe(false);
});

test('legacy narration has no plan and caller expression or fabricated disclosure cannot acquire grants', () => {
    const base = snapshot(), info = information(base);
    info.narration.expression = { actorId: informationOtherActor, intent: 'decline', sourceIds: ['memories'] };
    expect(deriveExpressionPlan(base, info).intent).toBe('inform');
    info.disclosure.items.push({ id: 'fake', sourceId: 'beliefs', recordId: 'fake', semantic: 'truth', data: { text: 'SECRET INJECTION' } });
    expect(deriveExpressionPlan(base, info)).toMatchObject({ status: 'fallback', reason: 'display_grant_changed' });
    delete base.manifest.runtime.experienceContract.informationRuntime.narration.expression;
    expect(deriveExpressionPlan(base, info)).toBeNull();
});

test('truncation, missing source, inactive scopes and old anchors fall back to the original text path', () => {
    const base = snapshot(), old = information(base);
    const truncated = structuredClone(old); truncated.disclosure.truncated = true;
    expect(deriveExpressionPlan(base, truncated)).toMatchObject({ status: 'fallback', reason: 'truncated' });
    base.states.atri_lifecycle.domains.beliefs.records = [];
    expect(deriveExpressionPlan(base, information(base))).toMatchObject({ status: 'fallback', reason: 'source_unavailable' });
    base.states.atri_lifecycle.scopes.session.status = 'suspended';
    expect(deriveExpressionPlan(base, old)).toMatchObject({ status: 'fallback', reason: 'scope_unavailable' });
    const moved = snapshot(); moved.revision.revisionId = 'rev_' + 'e'.repeat(32);
    expect(deriveExpressionPlan(moved, old)).toMatchObject({ status: 'fallback', reason: 'stale' });
});

test('expression uses the original bounded scan callback', () => {
    const base = snapshot(); let scanned = 0;
    const plan = deriveExpressionPlan(base, information(base), { onScan: count => { scanned += count; } });
    expect(plan.status).toBe('ready'); expect(scanned).toBe(2);
});

test('original scan guard failure propagates instead of granting a text fallback after budget exhaustion', () => {
    const base = snapshot(), guard = new Error('Original scan quota exhausted');
    expect(() => deriveExpressionPlan(base, information(base), { onScan: () => { throw guard; } })).toThrow(guard);
});

test('public plan has strict item and UTF-8 byte bounds instead of silently dropping selected evidence', () => {
    const base = snapshot(); for (let i = 0; i < 8; i++) addInformationRecord(base, 'beliefs', 'more-' + i, { text: 'Another public belief' });
    expect(deriveExpressionPlan(base, information(base))).toMatchObject({ status: 'fallback', reason: 'item_limit' });
    const large = snapshot(); large.states.atri_lifecycle.domains.beliefs.records.find(row => row.id === 'rumor').value.text = '公开证据'.repeat(1000);
    expect(deriveExpressionPlan(large, information(large))).toMatchObject({ status: 'fallback', reason: 'byte_limit' });
});

test('causal public source freshness comes from the original projection and hidden basis never becomes public expression data', () => {
    const base = snapshot(), def = base.manifest.runtime.experienceContract.informationRuntime;
    const selected = projectInformation(base, 'player', { includeRollups: false }), leaf = selected.items.find(item => item.id === 'beliefs:rumor');
    def.sources.push({ id: 'public-action', kind: 'application', semantic: 'truth', scopeId: 'session', domainId: 'actions', actorField: 'actor', fields: [['text']], causalBasis: true });
    for (const view of def.views.filter(view => ['pov', 'player'].includes(view.id))) view.sources.push('public-action');
    def.narration.expression.sourceIds = ['public-action'];
    base.states.atri_lifecycle.domains.actions = { records: [{ id: 'action', value: { actor: informationActor, text: 'Public sourced explanation',
        basis: { viewId: 'player', anchor: selected.anchor, sourceRefs: [{ itemId: leaf.id, fingerprint: informationItemFingerprint(leaf) }] } } }] };
    const plan = deriveExpressionPlan(base, information(base));
    expect(plan.items[0]).toMatchObject({ data: { text: 'Public sourced explanation' }, causality: { sourceCurrent: true } });
    expect(JSON.stringify(plan)).not.toContain('basis');
    base.states.atri_lifecycle.domains.beliefs.records.find(row => row.id === 'rumor').value.text = 'Changed public source';
    expect(deriveExpressionPlan(base, information(base))).toMatchObject({ status: 'fallback', reason: 'source_unavailable' });
});

function addDerivedDomain(base, id, schema, value, sources) {
    const contract = base.manifest.runtime.experienceContract, definition = contract.informationRuntime;
    contract.lifecycleRuntime.domains.push({ id, scopeId: 'session', schemaVersion: 1, recordSchema: schema, initial: value, commands: [],
        retention: { maxItems: 32, maxLogicalBytes: 262144, keepPinned: true, keepReferenced: true } });
    base.states.atri_lifecycle.domains[id] = { records: [{ id: 'main', value }] };
    definition.sources.push(...sources);
    definition.views.find(view => view.id === 'pov').sources.push(...sources.map(source => source.id));
    definition.views.find(view => view.id === 'player').sources.push(sources[0].id);
    definition.narration.expression.sourceIds = [sources[0].id];
    assertNativeExperienceContract(contract);
}
function publicBasis(base) {
    const selected = projectInformation(base, 'player', { includeRollups: false }), item = selected.items.find(item => item.id === 'beliefs:rumor');
    return { viewId: 'player', anchor: selected.anchor, sourceRefs: [{ itemId: item.id, fingerprint: informationItemFingerprint(item) }] };
}

test('public emotion text keeps derived qualifiers without borrowing private intensity, rationale or appraisal provenance', () => {
    const base = snapshot(), appraisal = Object.fromEntries(['invocationId', 'taskId', 'variantId', 'profileId', 'profileRevision', 'modelProfileId',
        'promptId', 'promptRevision', 'generationId', 'generationRevision'].map(field => [field, 'author-source']));
    Object.assign(appraisal, { origin: 'author', modelProfileHash: 'a'.repeat(64), requestSnapshotHash: 'b'.repeat(64), previousHash: 'c'.repeat(64) });
    const value = { actor: informationActor, target: '', dimension: 'relief', level: 87, status: 'active', text: 'A public expression of relief',
        rationale: 'PRIVATE EMOTION RATIONALE', basis: publicBasis(base), appraisal };
    const source = { id: 'public-emotion', kind: 'application', semantic: 'emotion', scopeId: 'session', domainId: 'emotions', actorField: 'actor', statusField: 'status', fields: [['text']] };
    addDerivedDomain(base, 'emotions', appraisalStateSchema(), value, [source, { ...source, id: 'private-emotion', fields: [['text'], ['level'], ['rationale']] }]);
    const plan = deriveExpressionPlan(base, information(base));
    expect(plan).toMatchObject({ status: 'ready', items: [{ semantic: 'emotion', appraisalStatus: 'active', cognition: { status: 'active', sourceCurrent: true } }] });
    expect(plan.items[0].data).toEqual({ text: 'A public expression of relief' });
    expect(JSON.stringify(plan)).not.toContain('PRIVATE EMOTION RATIONALE'); expect(JSON.stringify(plan)).not.toContain('level');
    value.status = 'withdrawn'; expect(deriveExpressionPlan(base, information(base))).toMatchObject({ status: 'fallback', reason: 'source_unavailable' });
});

test('managed public Memory must be current, applicable and usable using its original projected qualifiers', () => {
    const base = snapshot(), value = { actor: informationActor, text: 'Attributed historical memory', status: 'active', recordedAt: 0,
        role: 'detail', clarity: 'clear', use: 'willing', applicability: { goalId: '', until: 0, exceptionRefs: [] }, basis: publicBasis(base) };
    const source = { id: 'public-memory', kind: 'application', semantic: 'memory', scopeId: 'session', domainId: 'managed', actorField: 'actor', statusField: 'status',
        fields: ['text', 'role', 'recordedAt', 'clarity', 'use', 'applicability'].map(field => [field]), memoryPolicy: { id: 'memory', revision: 'v1', mode: 'deep', clockId: 'world', fadeAfter: 10 } };
    addDerivedDomain(base, 'managed', memoryStateSchema(), value, [source]);
    expect(deriveExpressionPlan(base, information(base)).items[0]).toMatchObject({ semantic: 'memory', memory: { sourceCurrent: true, applicability: 'applicable', use: 'willing' } });
    value.use = 'unavailable'; expect(deriveExpressionPlan(base, information(base))).toMatchObject({ status: 'fallback', reason: 'source_unavailable' });
    value.use = 'willing'; value.applicability.until = 1; base.states.atri_lifecycle.clocks.world = 1;
    expect(deriveExpressionPlan(base, information(base))).toMatchObject({ status: 'fallback', reason: 'source_unavailable' });
});
