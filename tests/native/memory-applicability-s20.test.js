import { expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installMemoryFixture } from './helpers/memory-fixture.js';
import { projectInformation, informationContext, memoryEvidenceApplicability } from '../../public/shared/native-information-runtime.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { recallNativePackageTurnMemory } from '../../public/scripts/native/experience/llm/memory-bridge.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { services } from './helpers/session-fixture.js';

const projection = snapshot => projectInformation(snapshot, 'actor', { purpose: 'context', includeRollups: false });
const find = (snapshot, id) => projection(snapshot).items.find(item => item.id === id);
const advance = async (h, f, ticks) => {
    const base = await f.load();
    return f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 's20-tick-' + base.revision.revisionId,
        action: { kind: 'clock.advance', commandId: 'advance', ticks } }, { expectedRevisionId: base.revision.revisionId });
};
const packet = snapshot => ({ memoryId: 'retrieved-promise', content: snapshot.timeline[0].content,
    sourceRefs: [{ kind: 'timeline', messageId: snapshot.timeline[0].messageId, revisionId: snapshot.revision.revisionId, branchId: snapshot.revision.branchId }] });

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S20 ${kind} event appraisal intention formal action source chain persists and invalidates explanation only`, async () => {
        const h = await make();
        try {
            const f = await installMemoryFixture(h); await f.appraise();
            const plan = await f.write('intentions', 'respond', { text: '阿岚打算在下次被问到时回应还书承诺。', basis: await f.basis(['emotions:relief']), commitmentIds: [], priority: 50 });
            expect(find(plan, 'intentions:respond').cognition).toMatchObject({ status: 'active', sourceCurrent: true });
            const action = await f.write('actions', 'acknowledge', { text: '阿岚确认了仍待履行的还书承诺。', basis: await f.basis(['intentions:respond']) });
            expect(find(action, 'actions:acknowledge').causality.sourceCurrent).toBe(true);
            expect(action.states.atri_lifecycle.domains.loops.records[0].value.status).toBe('open');
            const before = JSON.stringify(action.states.atri_lifecycle.domains.actions);
            const edited = await f.write('events', 'contact', { text: '旧澄清内容被作者修订。', importance: 'high' });
            expect(find(edited, 'emotions:relief').cognition.status).toBe('stale');
            expect(find(edited, 'intentions:respond').cognition.status).toBe('stale');
            expect(find(edited, 'actions:acknowledge')).toMatchObject({ data: { text: '阿岚确认了仍待履行的还书承诺。' }, causality: { status: 'stale' } });
            expect(JSON.stringify(edited.states.atri_lifecycle.domains.actions)).toBe(before);
            expect(projection(await services(h).core.load(h.handle, edited.session.sessionId))).toEqual(projection(edited));
        } finally { await h.cleanup(); }
    });
}

test('S20 light fading protects identity commitments relationships key events and read is pure', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installMemoryFixture(h);
        for (const role of ['detail', 'identity', 'commitment', 'relationship', 'key_event']) await f.memory(role, { role });
        const before = await f.load(), raw = JSON.stringify(before.states.atri_lifecycle.domains.experiences);
        const aged = await advance(h, f, 3), serialized = JSON.stringify(aged);
        expect(find(aged, 'experiences:detail').memory).toMatchObject({ clarity: 'blurred', use: 'reluctant', applicability: 'applicable' });
        for (const role of ['identity', 'commitment', 'relationship', 'key_event']) expect(find(aged, 'experiences:' + role).memory).toMatchObject({ clarity: 'clear', use: 'willing' });
        expect(JSON.stringify(aged.states.atri_lifecycle.domains.experiences)).toBe(raw);
        expect(JSON.stringify(aged)).toBe(serialized);
        const publicItem = projectInformation(aged, 'player').items.find(item => item.id === 'public-experiences:detail');
        expect(publicItem.memory).toEqual({ status: 'active', sourceCurrent: true, applicability: 'unknown' });
        const deep = { ...aged.states.atri_lifecycle.domains.experiences.records[0].value, clarity: 'forgotten', use: 'unavailable', basis: await f.basis(['history:' + aged.timeline[0].messageId]) };
        await expect(f.write('experiences', 'detail', deep)).rejects.toThrow(/Memory state|Authority publication/);
    } finally { await h.cleanup(); }
});

test('S20 deep forgetting requires explicit work policy and remains sourced withdrawn history', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installMemoryFixture(h, { mode: 'deep' });
        const saved = await f.memory('detail', { clarity: 'forgotten', use: 'unavailable' });
        expect(find(saved, 'experiences:detail').memory).toMatchObject({ clarity: 'forgotten', use: 'unavailable' });
        await expect(f.memory('protected', { role: 'commitment', clarity: 'blurred' })).rejects.toThrow(/Memory state|Authority publication/);
        const restored = await f.memory('detail', { clarity: 'reconstructed', use: 'reluctant' });
        expect(find(restored, 'experiences:detail').memory.clarity).toBe('reconstructed');
        const old = restored.states.atri_lifecycle.domains.experiences.records[0].value;
        const withdrawn = await f.write('experiences', 'detail', { ...old, status: 'withdrawn' });
        expect(find(withdrawn, 'experiences:detail').memory.status).toBe('withdrawn');
        expect(withdrawn.timeline[0].content).toBe(saved.timeline[0].content);
        expect((await f.core.load(h.handle, saved.session.sessionId, { revisionId: saved.revision.revisionId })).states.atri_lifecycle.domains.experiences.records[0].value.clarity).toBe('forgotten');
    } finally { await h.cleanup(); }
});

test('S20 applicability time goal exceptions and hidden conditions fail closed without erasing historical source', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installMemoryFixture(h), goalId = 'goal_' + 'c'.repeat(32);
        await f.write('intentions', 'goal', { text: '阿岚打算回应借书询问。', goalId, basis: await f.basis(['loops:promise']), commitmentIds: ['loops:promise'] });
        const basis = await f.basis(['events:contact']);
        const current = await f.memory('conditional', { applicability: { goalId, until: 3, exceptionRefs: basis.sourceRefs } }, ['events:contact']);
        expect(find(current, 'experiences:conditional').memory.applicability).toBe('applicable');
        const aged = await advance(h, f, 3);
        expect(find(aged, 'experiences:conditional').memory.applicability).toBe('inapplicable');
        const missing = await f.memory('missing-goal', { applicability: { goalId: 'goal_' + 'd'.repeat(32), until: 0, exceptionRefs: [] } });
        expect(find(missing, 'experiences:missing-goal').memory.applicability).toBe('unknown');
        const edited = await f.write('events', 'contact', { text: '作者修订适用例外。', importance: 'high' });
        expect(find(edited, 'experiences:conditional').memory).toMatchObject({ status: 'stale', applicability: 'inapplicable' });
        expect(edited.timeline[0].content).toBe(current.timeline[0].content);
    } finally { await h.cleanup(); }
});

test('S20 original recall bridge compiler and Host admission share source-current applicability and disclosure', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installMemoryFixture(h);
        let base = await f.load();
        expect(memoryEvidenceApplicability(base, informationContext(base, { kind: 'narrator' }), packet(base)).status).toBe('unknown');
        base = await f.memory('promise', { role: 'commitment' });
        const context = informationContext(base, { kind: 'narrator' });
        expect(memoryEvidenceApplicability(base, context, packet(base))).toMatchObject({ status: 'applicable', memories: [expect.objectContaining({ id: 'experiences:promise' })] });
        const api = { openSession: async () => ({ recallMemory: async () => ({ evidence: [{ id: 'promise', content: base.timeline[0].content, sourceMessageIds: [base.timeline[0].messageId] }] }) }) };
        const recalled = await recallNativePackageTurnMemory({ snapshot: base, memoryApi: api });
        expect(recalled.evidence).toHaveLength(1);
        const before = JSON.stringify(base);
        const plan = await compileNativeContextPlan(base, { modelContextLimit: 24000, responseReserve: 1000, memoryEvidence: recalled.evidence });
        const item = plan.included.find(item => item.contextItemId.startsWith('memory:'));
        expect(JSON.parse(item.content)).toMatchObject({ applicability: { status: 'applicable' }, displayGrant: { item: null } });
        expect(JSON.stringify(plan)).toContain('memoryApplicabilityUse');
        expect(JSON.stringify(base)).toBe(before);
        const withdrawn = await f.write('experiences', 'promise', { ...base.states.atri_lifecycle.domains.experiences.records[0].value, status: 'withdrawn' });
        expect((await recallNativePackageTurnMemory({ snapshot: withdrawn, memoryApi: api })).evidence).toEqual([]);
        const filtered = await compileNativeContextPlan(withdrawn, { modelContextLimit: 24000, responseReserve: 1000, memoryEvidence: [packet(withdrawn)] });
        expect(filtered.included.some(item => item.contextItemId.startsWith('memory:'))).toBe(false);
    } finally { await h.cleanup(); }
});

test('S20 publication rejects hidden foreign self stale dependencies and immutable Memory protection', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installMemoryFixture(h); await f.appraise();
        const basis = await f.basis(['emotions:relief']);
        await expect(f.write('actions', 'foreign', { actor: f.otherActorId, basis })).rejects.toThrow(/Actor|grant/);
        await expect(f.write('actions', 'hidden', { basis: { ...basis, sourceRefs: [{ itemId: 'beliefs:other', fingerprint: 'a'.repeat(64) }] } })).rejects.toThrow(/denied/);
        await f.write('intentions', 'first', { basis, commitmentIds: [] });
        await expect(f.write('intentions', 'first', { basis: await f.basis(['intentions:first']), commitmentIds: [] })).rejects.toThrow(/cycle/);
        await f.write('intentions', 'second', { basis: await f.basis(['intentions:first']), commitmentIds: [] });
        await expect(f.write('intentions', 'first', { basis: await f.basis(['intentions:second']), commitmentIds: [] })).rejects.toThrow(/cycle/);
        const saved = await f.memory('identity', { role: 'identity' });
        await expect(f.memory('identity', { role: 'detail' })).rejects.toThrow(/immutable/);
        await expect(f.memory('future', { recordedAt: 1 })).rejects.toThrow(/future/);
        expect((await f.load()).revision.revisionId).toBe(saved.revision.revisionId);
    } finally { await h.cleanup(); }
});

test('S20 memory and causal aliases require consistent policy and original legacy Memory remains compatible', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installMemoryFixture(h), contract = structuredClone((await f.load()).manifest.runtime.experienceContract);
        const source = contract.informationRuntime.sources.find(source => source.id === 'public-experiences');
        source.memoryPolicy.mode = 'deep';
        expect(() => assertNativeExperienceContract(contract)).toThrow(/aliases/);
        expect(find(await f.load(), 'memories:private').data.text).toBe('阿岚私下曾犹豫是否履约。');
    } finally { await h.cleanup(); }
});


test('S20 own applicable Memory supports intention but withdrawal and resolved competition revoke downstream explanation', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installMemoryFixture(h); const memory = await f.memory('promise', { role: 'commitment' });
        await f.write('intentions', 'low', { text: '阿岚准备回应还书询问。', priority: 10, conflictKey: 'reply', commitmentIds: [], basis: await f.basis(['experiences:promise']) });
        const action = await f.write('actions', 'response', { text: '阿岚确认了还书约定。', basis: await f.basis(['intentions:low']) });
        expect(find(action, 'actions:response').causality.status).toBe('current');
        const competition = await f.write('intentions', 'high', { text: '阿岚优先考虑核对传闻。', priority: 90, conflictKey: 'reply', commitmentIds: [], basis: await f.basis(['events:contact']) });
        expect(find(competition, 'intentions:low').cognition.selection).toBe('deferred');
        expect(find(competition, 'actions:response').causality.status).toBe('stale');
        const withdrawn = await f.write('experiences', 'promise', { ...memory.states.atri_lifecycle.domains.experiences.records[0].value, status: 'withdrawn' });
        expect(find(withdrawn, 'intentions:low').cognition.status).toBe('stale');
        expect(withdrawn.states.atri_lifecycle.domains.actions.records[0].value.text).toBe(action.states.atri_lifecycle.domains.actions.records[0].value.text);
    } finally { await h.cleanup(); }
});

test('S20 dependency expansion is bounded and cannot use hidden aliases or manufacture future Memory exposure', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installMemoryFixture(h); await f.appraise();
        let ref = 'emotions:relief';
        for (let i = 0; i < 3; i++) {
            await f.write('intentions', 'depth-' + i, { text: '阿岚保留一个有来源的计划。', commitmentIds: [], basis: await f.basis([ref]) }); ref = 'intentions:depth-' + i;
        }
        const before = await f.load();
        await expect(f.write('actions', 'too-deep', { basis: await f.basis([ref]) })).rejects.toThrow(/depth|denied/);
        const privateMemory = await f.memory('private', { role: 'detail' });
        const hidden = structuredClone(privateMemory);
        hidden.manifest.runtime.experienceContract.informationRuntime.views.find(view => view.id === 'actor').sources = ['experiences'];
        expect(find(hidden, 'experiences:private').memory).toMatchObject({ status: 'stale', applicability: 'unknown' });
        expect(before.states.atri_lifecycle.domains.actions.records).toEqual([]);
    } finally { await h.cleanup(); }
});

test('S20 actual original Host rejects retrieved Memory after withdrawal before any model admission', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installMemoryFixture(h, { configure: ({ contract }) => { contract.taskRuntime.turn = { policy: 'authority-first', stages: [] }; } });
        const saved = await f.memory('promise', { role: 'commitment' });
        const base = await f.write('experiences', 'promise', { ...saved.states.atri_lifecycle.domains.experiences.records[0].value, status: 'withdrawn' });
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/s20-local-stub', roles: ['narrator', 'intent_resolver'] }), fetchImpl = jest.fn();
        const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller, secretPort: { resolveSecret: async () => 's20-synthetic-secret' },
            providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) } });
        await expect(host.executeTurn(h.handle, { sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
            invocationId: 's20-denied-memory', hostMemoryEvidence: [packet(base)] })).rejects.toMatchObject({ code: 'native_turn_memory_evidence_inapplicable' });
        expect(fetchImpl).not.toHaveBeenCalled();
        expect((await f.load()).revision.revisionId).toBe(base.revision.revisionId);
    } finally { await h.cleanup(); }
});


test('S20 a partial Memory grant cannot treat hidden deep use as current intention evidence', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installMemoryFixture(h, { mode: 'deep', configure: ({ contract }) => {
            contract.informationRuntime.sources.find(source => source.id === 'experiences').fields = [['text'], ['applicability']];
        } });
        const saved = await f.memory('detail', { clarity: 'forgotten', use: 'unavailable' });
        const item = find(saved, 'experiences:detail');
        expect(item.memory.applicability).toBe('applicable');
        expect(Object.hasOwn(item.memory, 'use')).toBe(false);
        await expect(f.write('intentions', 'hidden-use', { commitmentIds: [], basis: await f.basis(['experiences:detail']) })).rejects.toThrow(/denied/);
        expect((await f.load()).revision.revisionId).toBe(saved.revision.revisionId);
    } finally { await h.cleanup(); }
});
