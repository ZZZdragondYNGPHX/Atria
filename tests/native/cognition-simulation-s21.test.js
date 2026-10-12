import { expect, jest, test } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installAppraisalFixture, appraisalCandidate } from './helpers/appraisal-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { services } from './helpers/session-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createAuthorityPublicationBudget } from '../../src/native/authority-transaction.js';
import { prepareWorldSimulation, simulationTaskCurrent } from '../../src/native/simulation-authority.js';
import { assertSimulationRuntime } from '../../public/shared/native-simulation-contract.js';

async function fixture(h, { deliberations = 1, jobs = true } = {}) {
    return installAppraisalFixture(h, { configure: ({ contract }) => {
        contract.capabilities.push({ id: 'world-simulation', version: 1, required: true });
        contract.lifecycleRuntime.advances[0].maxTicks = 1000000;
        contract.taskRuntime.tasks[0].queuePolicy = 'fifo';
        contract.simulationRuntime = { schemaVersion: 1, clockId: 'world', policy: { maxSteps: 8, maxDeliberations: deliberations, maxAdvanceTicks: 1000000 },
            jobs: jobs ? [{ id: 'npc.appraise', scopeId: 'session', reads: [{ id: 'policy', domainId: 'progress', recordId: 'main', fields: ['effectiveTurns'] }],
                enabled: 'reads.policy.effectiveTurns > 0', due: 0, priority: 1, relevance: 'hot',
                action: { kind: 'task', taskId: 'summarize', variantId: 'default', input: { eventItemId: 'events:contact' } } }] : [] };
    } });
}
async function command(h, f, action) {
    const current = await f.core.load(h.handle, f.current().session.sessionId);
    return f.core.applyLifecycleCommand(h.handle, current.session.sessionId,
        { type: 'lifecycle', invocationId: 's21-' + current.revision.revisionId, action }, { expectedRevisionId: current.revision.revisionId });
}
const advance = (h, f, ticks = 1000000) => command(h, f, { kind: 'clock.advance', commandId: 'advance', ticks });
async function runtime(h, f, fetchHook = null, budget = true) {
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/local-stub' });
    if (budget) for (const route of seeded.routes) await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: 64000,
            localWork: { maxJobs: 32, maxItems: 4096, maxInputBytes: 16777216 } } } });
    const fetchImpl = jest.fn(async () => {
        await fetchHook?.();
        return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(appraisalCandidate(f)) }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
        secretPort: { resolveSecret: async () => 's21-synthetic-secret' }, providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) } });
    const input = snapshot => ({ sessionId: snapshot.session.sessionId, revisionId: snapshot.revision.revisionId,
        slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
    return { host, fetchImpl, input, seeded };
}

for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test(`S21 ${kind} an authored million-tick jump admits one sealed background appraisal and preserves accepted state on restart`, async () => {
        const h = await make();
        try {
            const f = await fixture(h); await f.ready(); const queued = await advance(h, f);
            expect(queued.states.atri_lifecycle.clocks.world).toBe(1000000);
            expect(queued.states.atri_lifecycle.outbox).toHaveLength(1);
            expect(queued.states.atri_lifecycle.outbox[0].appraisalEvent).toMatchObject({ eligible: true, eventItemId: 'events:contact' });
            const r = await runtime(h, f), result = await r.host.executeLifecycle(h.handle, r.input(queued));
            expect(r.fetchImpl).toHaveBeenCalledTimes(1); expect(result.results[0].authorityReceipt.applied).toBe(2);
            expect(result.snapshot.states.atri_lifecycle.domains.emotions.records[0].value.appraisal.origin).toBe('model');
            expect(result.snapshot.states.atri_lifecycle.domains.relations.records[0].value.level).toBe(-5);
            expect(result.snapshot.states.atri_world_state).toEqual(queued.states.atri_world_state);
            expect(result.snapshot.timeline).toEqual(queued.timeline);
            expect(result.snapshot.states.atri_lifecycle.clocks.world).toBe(1000000);
            const restored = await services(h).core.load(h.handle, queued.session.sessionId);
            expect(restored.states.atri_lifecycle.domains).toEqual(result.snapshot.states.atri_lifecycle.domains);
            expect((await r.host.executeLifecycle(h.handle, r.input(restored))).results).toEqual([]);
            expect(r.fetchImpl).toHaveBeenCalledTimes(1);
            expect((await f.core.runs.status(h.handle, queued.session.sessionId)).retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 150 });
        } finally { await h.cleanup(); }
    }, 30000);
}

test('S21 no clock movement, read, or pump admits cognition; zero deliberations and no authored job stay silent', async () => {
    for (const options of [{}, { deliberations: 0 }, { jobs: false }]) {
        const h = await makeTempFsEngineHarness();
        try {
            const f = await fixture(h, options), ready = await f.ready();
            const installed = await f.core._openPackage(h.handle, ready.session.packageId, ready.session.packageVersionId, ready.session.entryPointId);
            const unchanged = await prepareWorldSimulation(ready, installed, 0, await createAuthorityPublicationBudget(ready, installed));
            expect(unchanged.states.atri_lifecycle.outbox).toEqual([]);
            const pumped = await command(h, f, { kind: 'pump' }); expect(pumped.states.atri_lifecycle.outbox).toEqual([]);
            const r = await runtime(h, f);
            expect((await r.host.executeLifecycle(h.handle, r.input(pumped))).results).toEqual([]);
            expect(r.fetchImpl).not.toHaveBeenCalled();
            expect((await services(h).core.load(h.handle, ready.session.sessionId)).states.atri_lifecycle.clocks.world).toBe(0);
            const expectedDispatches = options.jobs === false || options.deliberations === 0 ? 0 : 1;
            const jumped = await advance(h, f); expect(jumped.states.atri_lifecycle.outbox).toHaveLength(expectedDispatches);
            expect((await r.host.executeLifecycle(h.handle, r.input(jumped))).results).toHaveLength(expectedDispatches);
            expect(r.fetchImpl).toHaveBeenCalledTimes(expectedDispatches);
        } finally { await h.cleanup(); }
    }
}, 30000);

test.each(['clock', 'closed'])('S21 %s change rejects a queued autonomous task before provider dispatch', async mode => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await fixture(h); await f.ready(); const queued = await advance(h, f, 1);
        const changed = mode === 'clock' ? await advance(h, f, 1)
            : await command(h, f, { kind: 'app.command', domainId: 'progress', commandId: 'save', recordId: 'main', args: { effectiveTurns: 0 } });
        const r = await runtime(h, f), result = await r.host.executeLifecycle(h.handle, r.input(changed));
        expect(r.fetchImpl).not.toHaveBeenCalled(); expect(result.results).toEqual([]);
        expect(result.snapshot.states.atri_lifecycle.outbox).toEqual([]);
        expect(result.snapshot.states.atri_lifecycle.domains.emotions.records).toEqual([]);
        const installed = await f.core._openPackage(h.handle, queued.session.packageId, queued.session.packageVersionId, queued.session.entryPointId);
        const disabled = structuredClone(queued); disabled.manifest.runtime.experienceContract.simulationRuntime.policy.maxDeliberations = 0;
        expect(simulationTaskCurrent(disabled, queued.states.atri_lifecycle.outbox[0], await createAuthorityPublicationBudget(queued, installed))).toBe(false);
    } finally { await h.cleanup(); }
});

test.each(['closed', 'clock'])('S21 a late provider result after %s change cannot publish cognition or world effects', async mode => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await fixture(h); await f.ready(); const queued = await advance(h, f, 1);
        const r = await runtime(h, f, () => mode === 'clock' ? advance(h, f, 1)
            : command(h, f, { kind: 'app.command', domainId: 'progress', commandId: 'save', recordId: 'main', args: { effectiveTurns: 0 } }));
        await expect(r.host.executeLifecycle(h.handle, r.input(queued))).rejects.toThrow();
        expect(r.fetchImpl).toHaveBeenCalledTimes(1);
        const current = await services(h).core.load(h.handle, queued.session.sessionId);
        expect(current.states.atri_lifecycle.domains.emotions.records).toEqual([]);
        expect(current.states.atri_lifecycle.domains.relations.records).toEqual([]);
        expect(current.states.atri_world_state).toEqual(queued.states.atri_world_state);
        expect(current.states.atri_lifecycle.clocks.world).toBe(mode === 'clock' ? 2 : 1);
        const bank = await f.core.runs.status(h.handle, queued.session.sessionId);
        const operation = Object.values(bank.operations).find(op => op.compute?.attempts.length);
        expect(operation.compute.attempts).toHaveLength(1);
        expect(operation.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 150 } });
    } finally { await h.cleanup(); }
});

test('S21 exhausted local work budget preserves pending tick source across Host restart without sending', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await fixture(h); await f.ready(); const queued = await advance(h, f, 1), r = await runtime(h, f);
        const route = await r.seeded.persistence.getRuntimeRoute(h.handle, r.seeded.routes[0].runtimeRouteId);
        await r.seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { ...route.executionPolicy,
            computeBudget: { ...route.executionPolicy.computeBudget, localWork: { ...route.executionPolicy.computeBudget.localWork, maxJobs: 1 } } } });
        const result = await r.host.executeLifecycle(h.handle, r.input(queued));
        expect(result.pending.reason).toBe('native_generation_budget_exhausted');
        const reopened = new NativeGenerationHost({ ...r.host, sessionCore: services(h).core });
        expect((await reopened.executeLifecycle(h.handle, r.input(result.snapshot))).pending.reason).toBe('native_generation_budget_exhausted');
        expect(r.fetchImpl).not.toHaveBeenCalled();
        const current = await f.core.load(h.handle, queued.session.sessionId);
        expect(current.revision.revisionId).toBe(queued.revision.revisionId);
        expect(current.states).toEqual(queued.states);
        const bank = await f.core.runs.status(h.handle, queued.session.sessionId);
        const operation = Object.values(bank.operations).find(op => op.compute);
        expect(operation.compute.localWork).toHaveLength(1);
        expect(operation.compute.attempts).toEqual([]);
    } finally { await h.cleanup(); }
});

test('S21 missing local appraisal budget preserves exact pending source without sending', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await fixture(h); await f.ready(); const queued = await advance(h, f, 1), r = await runtime(h, f, null, false);
        const result = await r.host.executeLifecycle(h.handle, r.input(queued));
        expect(result.pending.reason).toBe('appraisal_budget_unavailable'); expect(r.fetchImpl).not.toHaveBeenCalled();
        expect(result.snapshot.states.atri_lifecycle.outbox).toEqual(queued.states.atri_lifecycle.outbox);
        expect(result.snapshot.states.atri_lifecycle.domains.emotions.records).toEqual([]);
    } finally { await h.cleanup(); }
});

test('S21 real save export/import resumes pending exact tick work in a fresh store', async () => {
    const h = await makeTempFsEngineHarness(); let target;
    try {
        const f = await fixture(h); await f.ready(); const queued = await advance(h, f, 1), svc = services(h);
        const save = await svc.saveSystem.manualSave(h.handle, queued.session.sessionId);
        const exported = await svc.saveSystem.exportSnapshot(h.handle, queued.session.sessionId, save.saveId);
        const packageArchive = await f.assetStore.readBlob(h.handle, queued.session.packageContentHash);
        target = await makeTempFsEngineHarness(); const fresh = services(target);
        await fresh.packageInstaller.install(target.handle, packageArchive);
        const restored = await fresh.saveSystem.importSave(target.handle, exported.archive);
        expect(restored.states.atri_lifecycle.outbox).toEqual(queued.states.atri_lifecycle.outbox);
        expect(restored.states.atri_lifecycle.clocks.world).toBe(1);
        const r = await runtime(target, { ...f, core: fresh.core, packageInstaller: fresh.packageInstaller });
        const result = await r.host.executeLifecycle(target.handle, r.input(restored));
        expect(r.fetchImpl).toHaveBeenCalledTimes(1); expect(result.results[0].authorityReceipt.applied).toBe(2);
    } finally { await target?.cleanup(); await h.cleanup(); }
}, 30000);

test('S21 rollback retains historical pending evidence but its old branch cannot authorize a new appraisal', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await fixture(h); await f.ready(); const queued = await advance(h, f, 1);
        const saved = await f.core.createSavePoint(h.handle, queued.session.sessionId);
        const advanced = await advance(h, f, 1);
        const restored = await f.core.restoreSavePoint(h.handle, queued.session.sessionId, saved.saveId, { expectedRevisionId: advanced.revision.revisionId });
        expect(restored.revision.branchId).not.toBe(queued.revision.branchId);
        expect(restored.states.atri_lifecycle.clocks.world).toBe(1);
        expect(restored.states.atri_lifecycle.outbox).toEqual(queued.states.atri_lifecycle.outbox);
        const r = await runtime(h, f), result = await r.host.executeLifecycle(h.handle, r.input(restored));
        expect(result.pending.reason).toBe('appraisal_event_or_state_stale'); expect(r.fetchImpl).not.toHaveBeenCalled();
        expect(result.snapshot.states.atri_lifecycle.domains.emotions.records).toEqual([]);
        expect((await f.core.load(h.handle, queued.session.sessionId, { revisionId: queued.revision.revisionId })).states).toEqual(queued.states);
    } finally { await h.cleanup(); }
});

test('S21 autonomous appraisal declarations retain FIFO, projection, and same-scope authority constraints', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const f = await fixture(h), valid = f.manifest.runtime.experienceContract;
        for (const alter of [
            c => { c.taskRuntime.tasks[0].queuePolicy = 'latest'; },
            c => { c.taskRuntime.tasks[0].context = ['input']; },
            c => { c.lifecycleRuntime.scopes.push({ id: 'other', kind: 'session' }); c.lifecycleRuntime.domains.find(d => d.id === 'relations').scopeId = 'other'; },
        ]) {
            const changed = structuredClone(valid); alter(changed);
            expect(() => assertSimulationRuntime(changed.simulationRuntime, changed.lifecycleRuntime, changed.taskRuntime, changed.authorityRuntime)).toThrow();
        }
    } finally { await h.cleanup(); }
});
