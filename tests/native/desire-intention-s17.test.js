import { afterEach, expect, jest, test } from '@jest/globals';
import express from 'express';
import supertest from 'supertest';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installIntentionFixture, intentionSchema } from './helpers/intention-fixture.js';
import { informationFixture } from './helpers/information-fixture.js';
import { services } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { informationItemFingerprint } from '../../public/shared/native-cognition-runtime.js';
import { compileNativeContextPlan } from '../../public/scripts/native/context-compiler.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { AgentGoalService } from '../../src/native/agent-intelligence/goal-service.js';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';

afterEach(() => setReadOnly(false));
const project = (f, viewId = 'actor') => projectInformation(f.current(), viewId, { purpose: viewId === 'player' ? 'display' : 'context', includeRollups: false });
const item = (f, id) => project(f).items.find(item => item.id === 'intentions:' + id);
const goalInput = f => ({ subject: { kind: 'actor', actorId: f.actorId }, scope: { domain: 'rp_session', sessionId: f.current().session.sessionId }, intent: '阿岚希望履行还书承诺。',
    criteria: [{ criterionId: 'result', description: 'Physical output alone does not fulfil an Actor desire', selector: { kind: 'message', messageId: f.current().timeline[0].messageId }, path: ['content'], equals: 'Opening' }], invariants: [], budget: null });

test.each(['actor', 'fields', 'schema', 'non-application'])('S17 cognition contract rejects %s without migrating legacy sources', variant => {
    const contract = informationFixture(), domain = contract.lifecycleRuntime.domains.find(domain => domain.id === 'memories');
    domain.recordSchema = intentionSchema(); domain.commands = [];
    domain.initial = { text: 'Desire', actor: contract.informationRuntime.actors[0].id, status: 'active', goalId: '', commitmentIds: [], priority: 50, conflictKey: '', expiresAt: 0,
        basis: { viewId: 'actor', anchor: { sessionId: 'ses_' + 'a'.repeat(32), packageVersionId: 'pkgv_' + 'a'.repeat(32), revisionId: 'rev_' + 'a'.repeat(32), branchId: 'br_' + 'a'.repeat(32), scopeEpochs: { session: 0 } }, sourceRefs: [] } };
    const source = contract.informationRuntime.sources.find(source => source.id === 'memories');
    Object.assign(source, { semantic: 'intention', actorField: 'actor', statusField: 'status', fields: ['text', 'goalId', 'commitmentIds', 'priority', 'conflictKey', 'expiresAt'].map(key => [key]) });
    expect(assertNativeExperienceContract(contract).informationRuntime.sources.find(source => source.id === 'memories').semantic).toBe('intention');
    if (variant === 'actor') delete source.actorField;
    if (variant === 'fields') source.fields = [['text']];
    if (variant === 'schema') domain.recordSchema.properties.priority = { type: 'string', maxLength: 16 };
    if (variant === 'non-application') source.kind = 'world';
    expect(() => assertNativeExperienceContract(contract)).toThrow();
    expect(assertNativeExperienceContract(informationFixture()).informationRuntime.sources.some(source => source.semantic === 'intention')).toBe(false);
});

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S17 ${kind} exact event evidence and original CAS persist desire/intent without World or Actor identity writes`, async () => {
        const h = await make();
        try {
            const f = await installIntentionFixture(h), before = f.current();
            const world = structuredClone(before.states.atri_world_state), actors = structuredClone(before.manifest.actors), timeline = structuredClone(before.timeline);
            await f.plan('long-term', { text: '阿岚希望履行还书承诺。' }, 'desires');
            const base = f.current(); await f.plan('return');
            expect(item(f, 'return').cognition).toEqual({ status: 'active', sourceCurrent: true, selection: 'current' });
            expect(f.current().states.atri_lifecycle.domains.intentions.records[0].value.basis.anchor.revisionId).toBe(base.revision.revisionId);
            const restored = await services(h).core.load(h.handle, base.session.sessionId);
            expect(restored.states.atri_lifecycle.domains).toEqual(f.current().states.atri_lifecycle.domains);
            expect(restored.states.atri_world_state).toEqual(world); expect(restored.manifest.actors).toEqual(actors); expect(restored.timeline).toEqual(timeline);
            expect(JSON.stringify(restored.states.atri_lifecycle.domains.intentions.records[0].value.basis)).not.toContain('归还蓝封面书');
            const value = f.current().states.atri_lifecycle.domains.intentions.records[0].value;
            await expect(f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'stale-cas',
                action: { kind: 'app.command', domainId: 'intentions', recordId: 'return', commandId: 'save', args: value } }, { expectedRevisionId: base.revision.revisionId })).rejects.toThrow('conflict');
        } finally { await h.cleanup(); }
    });

    test(`S17 ${kind} Goal associations consume only explicit player display and cannot complete or execute desires`, async () => {
        const h = await make();
        try {
            const f = await installIntentionFixture(h), service = new AgentGoalService({ engine: h.engine, sessionCore: f.core });
            const input = goalInput(f), goal = await service.create(h.handle, input);
            await f.plan('wish', { goalId: goal.goalId, text: '阿岚希望履约。' }, 'desires');
            await f.plan('return', { goalId: goal.goalId });
            const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
            app.use(createNativeGenerationRouter(() => ({ persistence: { _engine: h.engine }, sessionCore: f.core }), () => null));
            const linked = await supertest(app).post('/goals/associations').send({ goalId: goal.goalId, viewId: 'player' }).expect(200);
            expect(linked.body.links.map(row => row.semantic)).toEqual(['desire', 'intention']);
            expect(linked.body.links[1].commitmentIds).toEqual(['loops:promise']); expect(linked.body.status).toBe('active');
            expect(JSON.stringify(linked.body)).not.toContain('阿岚打算');
            await supertest(app).post('/goals/associations').send({ goalId: goal.goalId, viewId: 'actor' }).expect(409);
            await expect(service.associations('another-owner', { goalId: goal.goalId, viewId: 'player' })).rejects.toThrow();
            const user = await service.create(h.handle, { ...input, subject: { kind: 'user', actorId: null }, budget: { maxRequests: 2, maxTokens: 64000 } });
            await expect(service.associations(h.handle, { goalId: user.goalId, viewId: 'player' })).rejects.toThrow('actor_goal_association_denied');
            expect((await service.evaluate(h.handle, { goalId: goal.goalId, expectedSequence: 0 })).blockers[0].code).toBe('actor_goal_completion_unavailable');
            expect((await service.context(h.handle, { scope: input.scope })).goals.map(goal => goal.goalId)).toEqual([user.goalId]);
            setReadOnly(true);
            expect((await service.associations(h.handle, { goalId: goal.goalId, viewId: 'player' })).readOnly).toBe(true);
        } finally { await h.cleanup(); }
    });
}

test.each(['hash', 'anchor', 'missing-epoch', 'other-view', 'other-source', 'commitment', 'expired', 'actor-change'])('S17 %s adoption fails atomically at original publication', async variant => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installIntentionFixture(h); await f.plan('return');
        const before = f.current(), value = structuredClone(before.states.atri_lifecycle.domains.intentions.records[0].value);
        value.text = 'A changed plan'; value.basis.anchor = project(f).anchor;
        if (variant === 'hash') value.basis.sourceRefs[0].fingerprint = '0'.repeat(64);
        if (variant === 'anchor') value.basis.anchor.revisionId = 'rev_' + '0'.repeat(32);
        if (variant === 'missing-epoch') value.basis.anchor.scopeEpochs = {};
        if (variant === 'other-view') value.basis.viewId = 'other-actor';
        if (variant === 'other-source') value.basis.sourceRefs[0].itemId = 'beliefs:other';
        if (variant === 'commitment') value.commitmentIds = ['loops:missing'];
        if (variant === 'expired') value.expiresAt = before.states.atri_lifecycle.logicalTime + 1;
        if (variant === 'actor-change') { value.actor = f.otherActorId; value.basis.viewId = 'other-actor'; }
        await expect(f.write('intentions', 'return', value)).rejects.toThrow();
        expect((await f.core.load(h.handle, before.session.sessionId)).revision.revisionId).toBe(before.revision.revisionId);
        expect((await f.core.load(h.handle, before.session.sessionId)).states).toEqual(before.states);
    } finally { await h.cleanup(); }
});

test('S17 private evidence can support an Actor plan without acquiring a player disclosure or source-current claim', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installIntentionFixture(h), projection = project(f), privateItem = projection.items.find(item => item.id === 'memories:private');
        await f.plan('private-support', { commitmentIds: [], basis: { viewId: 'actor', anchor: projection.anchor,
            sourceRefs: [{ itemId: privateItem.id, fingerprint: informationItemFingerprint(privateItem) }] } });
        expect(item(f, 'private-support').cognition.status).toBe('active');
        const display = project(f, 'player'), visible = display.items.find(item => item.semantic === 'intention');
        expect(visible.cognition).toEqual({ status: 'stale', sourceCurrent: false, selection: 'none' });
        expect(JSON.stringify(display)).not.toContain('私下曾犹豫');
        const plan = await compileNativeContextPlan(f.current(), { modelContextLimit: 16000, responseReserve: 512 });
        const context = JSON.parse(plan.included.find(item => item.contextItemId.endsWith(':intentions:private-support')).content);
        expect(context.cognition.status).toBe('active'); expect(context.displayGrant.item.cognition.status).toBe('stale');
    } finally { await h.cleanup(); }
});

test('S17 competing plans preserve ties, Actor separation and source revocation; cancelling does not cancel persistent desire', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installIntentionFixture(h);
        await f.plan('wish', { text: '阿岚希望履约。' }, 'desires');
        await f.plan('low', { conflictKey: 'next-step', priority: 20 });
        await f.plan('high', { conflictKey: 'next-step', priority: 80 });
        expect(item(f, 'low').cognition.selection).toBe('deferred'); expect(item(f, 'high').cognition.selection).toBe('current');
        await f.plan('tie', { conflictKey: 'next-step', priority: 80 });
        expect(item(f, 'high').cognition.selection).toBe('conflict'); expect(item(f, 'tie').cognition.selection).toBe('conflict');
        await f.plan('other', { actor: f.otherActorId, conflictKey: 'next-step', priority: 100 });
        expect(project(f).items.some(item => item.recordId === 'other')).toBe(false);
        expect(project(f, 'other-actor').items.some(item => item.recordId === 'high')).toBe(false);
        const old = structuredClone(f.current().states.atri_lifecycle.domains.intentions.records.find(record => record.id === 'high').value);
        await f.write('loops', 'promise', { status: 'closed' });
        expect(item(f, 'high').cognition.status).toBe('stale');
        await f.write('intentions', 'high', { ...old, status: 'cancelled' });
        expect(item(f, 'high').cognition.status).toBe('cancelled');
        expect(f.current().states.atri_lifecycle.domains.desires.records[0].value.status).toBe('active');
        await f.write('beliefs', 'rumor', { text: 'A revised report', status: 'disputed', channel: 'rumor' });
        expect(project(f).items.find(item => item.semantic === 'desire').cognition.sourceCurrent).toBe(false);
    } finally { await h.cleanup(); }
});

test('S17 expiry, original Save restoration and repeated Save restore preserve authored state and rebase support', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installIntentionFixture(h); await f.plan('return', { expiresAt: f.current().states.atri_lifecycle.logicalTime + 3 });
        const base = f.current(), value = structuredClone(base.states.atri_lifecycle.domains.intentions.records[0].value);
        const save = await f.core.createSavePoint(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId });
        await f.write('intentions', 'return', { ...value, status: 'paused' });
        expect(item(f, 'return').cognition.status).toBe('paused');
        const resumed = await f.core.restoreSavePoint(h.handle, base.session.sessionId, save.saveId, { expectedRevisionId: f.current().revision.revisionId });
        expect(resumed.states.atri_lifecycle.domains.intentions.records[0].value).toEqual({ ...value, basis: { ...value.basis, anchor: { ...value.basis.anchor, branchId: resumed.revision.branchId, revisionId: resumed.revision.revisionId } } });
        expect(projectInformation(resumed, 'actor', { purpose: 'context' }).items.find(item => item.semantic === 'intention').cognition.status).toBe('active');
        const forked = await f.core.restoreSavePoint(h.handle, base.session.sessionId, (await f.core.createSavePoint(h.handle, base.session.sessionId, { expectedRevisionId: resumed.revision.revisionId })).saveId, { expectedRevisionId: resumed.revision.revisionId });
        const projected = projectInformation(forked, 'actor', { purpose: 'context' }).items.find(item => item.semantic === 'intention');
        expect(projected.cognition.status).toBe('expired');
        expect(projected.cognition.sourceCurrent).toBe(true);
        expect(forked.states.atri_lifecycle.domains.intentions.records[0].value).toEqual({ ...value, basis: { ...value.basis, anchor: { ...value.basis.anchor, branchId: forked.revision.branchId, revisionId: forked.revision.revisionId } } });
    } finally { await h.cleanup(); }
});

test('S17 read-time availability and Goal race cannot revive support or expose a private association', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installIntentionFixture(h), service = new AgentGoalService({ engine: h.engine, sessionCore: f.core });
        const goal = await service.create(h.handle, goalInput(f)); await f.plan('return', { goalId: goal.goalId });
        await f.write('availability', 'main', { available: false });
        expect(project(f).items).toEqual([]);
        expect((await service.associations(h.handle, { goalId: goal.goalId, viewId: 'player' })).links).toEqual([]);
        await f.write('availability', 'main', { available: true });
        const originalLoad = f.core.load.bind(f.core); let reads = 0;
        f.core.load = jest.fn(async (...args) => {
            const snapshot = await originalLoad(...args);
            if (++reads === 2) return { ...snapshot, revision: { ...snapshot.revision, revisionId: 'rev_' + '0'.repeat(32) } };
            return snapshot;
        });
        await expect(service.associations(h.handle, { goalId: goal.goalId, viewId: 'player' })).rejects.toThrow('actor_goal_association_stale');
        f.core.load = originalLoad;
        const forked = await f.core.restoreSavePoint(h.handle, f.current().session.sessionId, (await f.core.createSavePoint(h.handle, f.current().session.sessionId, { expectedRevisionId: f.current().revision.revisionId })).saveId, { expectedRevisionId: f.current().revision.revisionId });
        expect(projectInformation(forked, 'actor', { purpose: 'context' }).items.find(item => item.semantic === 'intention').cognition.status).toBe('active');
        expect((await service.associations(h.handle, { goalId: goal.goalId, viewId: 'player' })).links).toEqual([]);
        expect((await service.repository.get(h.handle, goal.goalId)).status).toBe('active');
    } finally { await h.cleanup(); }
});

test('S17 an actual declared Task writer must cite its own Actor-bound context, including when withdrawing a plan', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installIntentionFixture(h, { taskWriter: true }); await f.plan('task-plan');
        const before = f.current(), ready = await f.core.applyLifecycleCommand(h.handle, before.session.sessionId,
            { type: 'lifecycle', invocationId: 's17-ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: before.revision.revisionId });
        const queued = ready.states.atri_lifecycle.outbox[0], original = structuredClone(ready.states.atri_lifecycle.domains.intentions.records[0].value);
        const publish = payload => f.core.recordTaskResult(h.handle, ready.session.sessionId,
            { invocationId: queued.invocationId, taskId: queued.taskId, variantId: queued.variantId, payload }, { expectedRevisionId: ready.revision.revisionId });
        await expect(publish({ ...original, status: 'cancelled' })).rejects.toThrow(/exact Task context/);
        const actorProjection = projectInformation(ready, 'actor', { purpose: 'context', includeRollups: false });
        await expect(publish({ ...original, basis: { ...original.basis, anchor: actorProjection.anchor } })).rejects.toThrow(/exact Task context/);
        expect((await f.core.load(h.handle, ready.session.sessionId)).revision.revisionId).toBe(ready.revision.revisionId);
        const taskProjection = projectInformation(ready, 'intent-task', { purpose: 'context', includeRollups: false });
        const accepted = await publish({ ...original, basis: { ...original.basis, viewId: 'intent-task', anchor: taskProjection.anchor } });
        expect(accepted.states.atri_lifecycle.outbox[0].status).toBe('completed');
        expect(accepted.states.atri_lifecycle.domains.intentions.records[0].value.basis.viewId).toBe('intent-task');
        expect(projectInformation(accepted, 'actor', { purpose: 'context' }).items.find(item => item.semantic === 'intention').cognition.status).toBe('active');
    } finally { await h.cleanup(); }
});

test('S17 installed Host and declared Task consume plans through original Information, disclosure, Source and budget', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await installIntentionFixture(h); await f.plan('return'); await f.plan('other', { actor: f.otherActorId });
        const base = f.current(), before = structuredClone(base.states);
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/not-sent' });
        const fetchImpl = jest.fn(() => { throw new Error('No send in preview'); });
        const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller, secretPort: { resolveSecret: async () => 'fixture' },
            providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) } });
        const input = { role: 'narrator', sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: 's17-preview' };
        const result = await host.execute(h.handle, input, undefined, undefined, { preview: true });
        const text = JSON.stringify(result.snapshot.contextPlan.items);
        expect(text).toContain('阿岚打算'); expect(text).not.toContain('沈墨打算');
        expect(text).toContain('A goalId or commitment reference grants no Task');
        const policy = result.snapshot.contextPlan.items.find(item => item.id === 'projection:policy:cognition');
        expect(policy.content).toContain('Do not make the player act');
        expect(policy.content).toContain('describe only the named plan');
        const task = base.manifest.runtime.experienceContract.taskRuntime.tasks[0];
        const planned = await host.execute(h.handle, { ...input, requestId: 's17-task-preview' }, undefined, undefined,
            { preview: true, taskPlan: { task, variant: task.variants[0], slot: base.manifest.runtime.experienceContract.taskRuntime.slots[0], payload: {} } });
        expect(JSON.stringify(planned.snapshot.contextPlan.items)).toContain('阿岚打算');
        expect(JSON.stringify(planned.snapshot.contextPlan.items)).not.toContain('沈墨打算');
        await expect(compileNativeContextPlan(base, { modelContextLimit: 16000, responseReserve: 512, laneCaps: { current_state_event: 1 } })).rejects.toMatchObject({ code: 'native_context_hard_reserve_overflow' });
        expect((await f.core.load(h.handle, base.session.sessionId)).states).toEqual(before); expect(fetchImpl).not.toHaveBeenCalled();
    } finally { await h.cleanup(); }
});
