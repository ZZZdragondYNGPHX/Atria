import { jest } from '@jest/globals';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { assertInformationClosure } from '../../public/shared/native-information-contract.js';
import { projectInformation, queryInformationGraph, actorAvailability, informationContext, assertInformationAnchor } from '../../public/shared/native-information-runtime.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { prepareInformationRollup } from '../../src/native/information-authority.js';
import { informationFixture, informationSnapshot, informationActor, informationOtherActor, addInformationRecord } from './helpers/information-fixture.js';

const definition = snapshot => snapshot.manifest.runtime.experienceContract.informationRuntime;
const record = (snapshot, domain, id) => snapshot.states.atri_lifecycle.domains[domain].records.find(item => item.id === id);
const rollup = (snapshot, overrides = {}) => ({ kind: 'information.rollup', id: 'scene', viewId: 'pov', anchor: projectInformation(snapshot, 'pov').anchor,
    level: 'scene', sourceIds: ['beliefs:rumor', 'threads:mine'], childIds: [], openLoopRefs: ['loops:promise'], content: 'The actor heard a rumor and received a greeting.', ...overrides });

test('versioned contract freezes projections and does not introduce a World clone', () => {
    const contract = assertNativeExperienceContract(informationFixture());
    expect(Object.isFrozen(contract.informationRuntime.views)).toBe(true);
    const snapshot = informationSnapshot(); const before = structuredClone(snapshot);
    projectInformation(snapshot, 'pov'); expect(snapshot).toEqual(before);
});
test.each([
    value => { value.schemaVersion = 2; },
    value => { value.sources[0].url = 'remote'; },
    value => { value.sources[0].fields = [['constructor']]; },
    value => { value.sources[0].fields = [['missing']]; },
    value => { value.sources[0].scopeId = 'missing'; },
    value => { value.sources[0].domainId = 'missing'; },
    value => { delete value.sources[0].actorField; },
    value => { delete value.sources[1].participantsField; },
    value => { delete value.sources[2].statusField; },
    value => { value.sources.push(value.sources[0]); },
    value => { value.views[0].maxItems = 129; },
    value => { value.views[0].maxCharacters = 32769; },
    value => { value.views[0].actorId = informationOtherActor; },
    value => { value.views[0].sources = ['unknown']; },
    value => { value.views[0].knowledge = undefined; },
    value => { value.views[2].exposure.push('context'); },
    value => { value.views.push({ ...value.views[0], id: 'duplicate-context' }); },
    value => { value.graphs[0].maxDepth = 5; },
    value => { value.graphs[0].maxEdges = 257; },
    value => { value.graphs[0].fromField = 'private'; },
    value => { value.actors[0].availability.field = 'text'; },
])('rejects invalid information declaration %#', mutate => {
    const contract = informationFixture(); mutate(contract.informationRuntime);
    expect(() => assertNativeExperienceContract(contract)).toThrow();
});
test('Actor and World references close over the exact Package', () => {
    const contract = assertNativeExperienceContract(informationFixture()).informationRuntime;
    expect(() => assertInformationClosure(contract, { actors: [], worlds: [] })).toThrow(/exact Package/);
});
test('Perspective preserves false belief as belief and isolates private participants', () => {
    const result = projectInformation(informationSnapshot(), 'pov'); const text = JSON.stringify(result);
    expect(text).toContain('The king escaped'); expect(text).toContain('believed'); expect(text).toContain('rumor');
    for (const secret of ['OTHER BELIEF', 'OTHER THREAD', 'WORLD SECRET', 'PRIVATE RAW HISTORY']) expect(text).not.toContain(secret);
    expect(result.items.find(item => item.semantic === 'open_loop').status).toBe('open');
});
test('player-only display has no implicit context grant', () => {
    const snapshot = informationSnapshot();
    expect(projectInformation(snapshot, 'player').items.some(item => item.sourceId === 'world')).toBe(true);
    expect(projectInformation(snapshot, 'player').items.find(item => item.sourceId === 'history').semantic).toBe('narrative');
    expect(() => projectInformation(snapshot, 'player', { purpose: 'context' })).toThrow(/denied/);
    expect(informationContext(snapshot, { kind: 'agent', id: 'unknown' }).items).toEqual([]);
});
test.each(['suspended', 'archived'])('inactive scope %s suppresses Actor participation and data', status => {
    const snapshot = informationSnapshot(); snapshot.states.atri_lifecycle.scopes.session.status = status;
    expect(actorAvailability(snapshot, informationActor).available).toBe(false);
    expect(projectInformation(snapshot, 'pov').items).toEqual([]);
});
test('Actor availability is a projection of an existing typed boolean', () => {
    const snapshot = informationSnapshot(); record(snapshot, 'availability', 'main').value.available = false;
    expect(projectInformation(snapshot, 'pov').items).toEqual([]);
    expect(actorAvailability(snapshot, informationOtherActor).reason).toBe('undeclared');
});
test('bounded BFS handles cycles and excludes dangling/hidden endpoints', () => {
    const result = queryInformationGraph(informationSnapshot(), 'relations', 'a');
    expect(result.nodes.map(item => item.recordId)).toEqual(['a', 'b']);
    expect(result.edges.map(item => item.recordId)).toEqual(['ab', 'ba']);
    expect(queryInformationGraph(informationSnapshot(), 'relations', 'missing').nodes).toEqual([]);
    expect(() => queryInformationGraph(informationSnapshot(), 'relations', 'a', { depth: 5 })).toThrow();
});
test('graph work and projection output limits report truncation', () => {
    const snapshot = informationSnapshot(); snapshot.manifest = structuredClone(snapshot.manifest);
    definition(snapshot).graphs[0].maxEdges = 1;
    expect(queryInformationGraph(snapshot, 'relations', 'a').truncated).toBe(true);
    definition(snapshot).views[0].maxItems = 1;
    expect(projectInformation(snapshot, 'pov')).toMatchObject({ truncated: true, items: [expect.any(Object)] });
});
test('snapshot reads and source scans are bounded', () => {
    const snapshot = informationSnapshot();
    snapshot.states.atri_lifecycle.domains.beliefs.records = Array(4097).fill(record(snapshot, 'beliefs', 'rumor'));
    expect(() => projectInformation(snapshot, 'pov')).toThrow(/scan budget/);
});
test.each(['revisionId', 'branchId', 'sessionId', 'packageVersionId'])('late result with changed %s fails closed', key => {
    const snapshot = informationSnapshot(); const anchor = projectInformation(snapshot, 'pov').anchor; anchor[key] = 'changed';
    expect(() => assertInformationAnchor(snapshot, anchor)).toThrow(/stale/);
});
test('scope thaw does not revive prior-epoch results', () => {
    const snapshot = informationSnapshot(); const anchor = projectInformation(snapshot, 'pov').anchor;
    snapshot.states.atri_lifecycle.scopes.session.epoch++;
    expect(() => assertInformationAnchor(snapshot, anchor)).toThrow(/stale/);
});
test('actual Context compiler excludes raw, provider, player and ungranted Memory paths', async () => {
    const snapshot = informationSnapshot();
    const provider = jest.fn(() => [{ id: 'unsafe', lane: 'memory', content: 'PROVIDER SECRET' }]);
    const plan = await compileNativeContextPlan(snapshot, { modelContextLimit: 16000, responseReserve: 1000,
        memoryEvidence: [{ memoryId: 'secret', content: 'MEMORY SECRET' }], providers: [{ providerId: 'probe', provide: provider }] });
    const text = JSON.stringify(plan.included);
    expect(provider).not.toHaveBeenCalled();
    expect(text).toContain('The king escaped'); expect(text).toContain('Return tomorrow');
    for (const secret of ['WORLD SECRET', 'PRIVATE RAW HISTORY', 'OTHER THREAD', 'PROVIDER SECRET', 'MEMORY SECRET']) expect(text).not.toContain(secret);
    expect(plan.included.find(item => item.content.includes('Return tomorrow')).lane).toBe('commitments');
    expect(plan.included.find(item => item.content.includes('Visited yesterday')).lane).toBe('memory');
});
test('rollups retain hierarchy/provenance without advancing authority or memory coverage', () => {
    const snapshot = informationSnapshot(); const world = structuredClone(snapshot.states.atri_world_state);
    prepareInformationRollup(snapshot, rollup(snapshot));
    prepareInformationRollup(snapshot, rollup(snapshot, { id: 'chapter', level: 'chapter', sourceIds: [], childIds: ['scene'] }));
    const derived = snapshot.states.atri_context_derived;
    expect(derived.narrative.map(item => item.level)).toEqual(['scene', 'chapter']);
    expect(derived.narrative[1].projection.openLoopRefs).toEqual(['loops:promise']);
    expect(derived.coverage.memoryThroughSequence).toBe(-1);
    expect(snapshot.states.atri_world_state).toEqual(world);
    expect(projectInformation(snapshot, 'pov').items.filter(item => item.semantic === 'rollup')).toHaveLength(1);
});
test.each(['branch', 'source', 'epoch', 'removed'])('rollup cannot recall stale %s evidence', reason => {
    const snapshot = informationSnapshot(); prepareInformationRollup(snapshot, rollup(snapshot));
    if (reason === 'branch') snapshot.revision.branchId = 'fork';
    if (reason === 'source') record(snapshot, 'beliefs', 'rumor').value.text = 'Changed';
    if (reason === 'epoch') snapshot.states.atri_lifecycle.scopes.session.epoch++;
    if (reason === 'removed') snapshot.states.atri_lifecycle.domains.beliefs.records = [];
    expect(projectInformation(snapshot, 'pov').items.some(item => item.semantic === 'rollup')).toBe(false);
});
test.each([
    { sourceIds: ['loops:promise'] }, { sourceIds: ['beliefs:private'] }, { sourceIds: ['missing'] },
    { level: 'chapter', sourceIds: [], childIds: ['missing'] }, { openLoopRefs: ['memories:past'] },
    { taskInvocationId: 'missing' }, { content: '' },
])('rollup rejects invalid source/compression request %#', extra => {
    const snapshot = informationSnapshot(); expect(() => prepareInformationRollup(snapshot, rollup(snapshot, extra))).toThrow();
    expect(snapshot.states.atri_context_derived).toBeUndefined();
});
test('closed Open Loops leave their lane and never become Memory', () => {
    const snapshot = informationSnapshot(); record(snapshot, 'loops', 'promise').value.status = 'closed';
    expect(projectInformation(snapshot, 'pov').items.some(item => item.recordId === 'promise')).toBe(false);
    addInformationRecord(snapshot, 'loops', 'plan', { status: 'open', text: 'Future plan' });
    expect(projectInformation(snapshot, 'pov').items.find(item => item.recordId === 'plan').semantic).toBe('open_loop');
});
test('existing Memory evidence requires explicit exposure and exact visible Timeline provenance', async () => {
    const snapshot = informationSnapshot(); snapshot.manifest = structuredClone(snapshot.manifest);
    definition(snapshot).views[0].sources.push('history'); definition(snapshot).views[0].memory = true;
    const refs = [{ kind: 'timeline', messageId: 'message-one', revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId }];
    const options = { modelContextLimit: 16000, responseReserve: 1000, memoryEvidence: [
        { memoryId: 'visible', content: 'CURRENT RECALL', sourceRefs: refs },
        { memoryId: 'old', content: 'OLD RECALL', sourceRefs: [{ ...refs[0], revisionId: 'old' }] },
        { memoryId: 'other', content: 'PRIVATE RECALL', sourceRefs: [{ ...refs[0], messageId: 'hidden' }] },
        { memoryId: 'unknown', content: 'UNPROVEN RECALL' },
    ] };
    const plan = await compileNativeContextPlan(snapshot, options);
    const content = JSON.stringify(plan.included);
    expect(content).toContain('CURRENT RECALL');
    for (const value of ['OLD RECALL', 'PRIVATE RECALL', 'UNPROVEN RECALL']) expect(content).not.toContain(value);
    definition(snapshot).views[0].memory = false;
    expect(JSON.stringify((await compileNativeContextPlan(snapshot, options)).included)).not.toContain('CURRENT RECALL');
});
test('Timeline-backed rollup invalidates on selected Variant change even if prose is unchanged', () => {
    const snapshot = informationSnapshot(); snapshot.manifest = structuredClone(snapshot.manifest); definition(snapshot).views[0].sources.push('history');
    prepareInformationRollup(snapshot, rollup(snapshot, { sourceIds: ['history:message-one'] }));
    expect(snapshot.states.atri_context_derived.narrative[0].coverage.messageIds).toEqual(['message-one']);
    snapshot.timeline[0].activeVariantId = 'new-variant';
    expect(projectInformation(snapshot, 'pov').items.some(item => item.semantic === 'rollup')).toBe(false);
});
test('strict declaration rejects getters without executing them', () => {
    const value = informationFixture(); const getter = jest.fn();
    Object.defineProperty(value.informationRuntime.views[0], 'malicious', { get: getter, enumerable: true });
    expect(() => assertNativeExperienceContract(value)).toThrow(); expect(getter).not.toHaveBeenCalled();
});
test('hidden graph endpoints never expose adjacent edge data', () => {
    const snapshot = informationSnapshot(); snapshot.manifest = structuredClone(snapshot.manifest);
    const def = definition(snapshot);
    def.views[2].actorId = informationActor;
    def.sources.find(source => source.id === 'nodes').actorField = 'actor';
    record(snapshot, 'nodes', 'b').value.actor = informationOtherActor;
    const graph = queryInformationGraph(snapshot, 'relations', 'a');
    expect(graph.nodes.map(item => item.recordId)).toEqual(['a']); expect(graph.edges).toEqual([]);
});
test('hierarchical recall selects the highest current artifact and keeps loop status separate', () => {
    const snapshot = informationSnapshot(); prepareInformationRollup(snapshot, rollup(snapshot));
    prepareInformationRollup(snapshot, rollup(snapshot, { id: 'chapter', level: 'chapter', sourceIds: [], childIds: ['scene'] }));
    record(snapshot, 'loops', 'promise').value.status = 'closed';
    const recall = projectInformation(snapshot, 'pov').items.filter(item => item.semantic === 'rollup');
    expect(recall).toHaveLength(1); expect(recall[0].data.level).toBe('chapter');
    expect(recall[0].data.openLoopRefs).toEqual([{ id: 'loops:promise', status: 'closed_or_unavailable' }]);
});
