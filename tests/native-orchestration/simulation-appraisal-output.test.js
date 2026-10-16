import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { appraisalModelFixture } from './helpers/appraisal-model-fixture.js';
import { readBackgroundTaskOutput } from '../../src/native/orchestration/background-task-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
async function fixture(make, { ticks = 1000000, deliberations = 1, jobs = true, usage = true } = {}) {
    return appraisalModelFixture(make, { usage, configureSource: ({ contract }) => {
        contract.capabilities.push({ id: 'world-simulation', version: 1, required: true });
        contract.lifecycleRuntime.advances[0].maxTicks = 1000000;
        contract.taskRuntime.tasks[0].queuePolicy = 'fifo';
        contract.simulationRuntime = { schemaVersion: 1, clockId: 'world', policy: { maxSteps: 8, maxDeliberations: deliberations, maxAdvanceTicks: 1000000 },
            jobs: jobs ? [{ id: 'npc.appraise', scopeId: 'session', reads: [{ id: 'policy', domainId: 'progress', recordId: 'main', fields: ['effectiveTurns'] }],
                enabled: 'reads.policy.effectiveTurns > 0', due: 0, priority: 1, relevance: 'hot',
                action: { kind: 'task', taskId: 'summarize', variantId: 'default', input: { eventItemId: 'events:contact' } } }] : [] };
    }, queueSource: async (product, h) => {
        const current = await product.core.observe(h.handle, product.current().session.sessionId);
        if (!ticks) return current;
        return product.core.applyLifecycleCommand(h.handle, current.session.sessionId,
            { type: 'lifecycle', invocationId: 'v3-simulation-clock', action: { kind: 'clock.advance', commandId: 'advance', ticks } },
            { expectedRevisionId: current.revision.revisionId });
    } });
}
async function command(f, action) {
    const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
    return f.core.applyLifecycleCommand(f.h.handle, current.session.sessionId,
        { type: 'lifecycle', invocationId: 'simulation-' + current.revision.revisionId, action }, { expectedRevisionId: current.revision.revisionId });
}

describe.each(harnesses)('$name original Simulation appraisal through V3', ({ make }) => {
    test('one authored million-tick jump completes the original Actor Task and durable output without moving clock or World again', async () => {
        const f = await fixture(make);
        try {
            const queued = f.base.states.atri_lifecycle.outbox[0];
            expect(queued.simulation).toMatchObject({ jobId: 'npc.appraise', tick: 1000000, dueTick: 0 });
            const outcome = await f.run(), runId = f.effectRef.runId;
            expect(outcome.results[0].authorityReceipt).toMatchObject({ decision: 'cognition.appraise', applied: 2 });
            expect(outcome.snapshot.states.atri_lifecycle.domains.emotions.records[0].value.level).toBe(30);
            expect(outcome.snapshot.states.atri_lifecycle.clocks.world).toBe(1000000);
            expect(outcome.snapshot.timeline).toEqual(f.base.timeline); expect(outcome.snapshot.states.atri_world_state).toEqual(f.base.states.atri_world_state);
            expect(outcome.snapshot.states.atri_lifecycle.outbox.filter(item => item.status === 'pending')).toEqual([]);
            const root = await f.authority.execution.runs.get(f.h.handle, runId);
            expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1);
            const saved = await f.h.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root));
            expect(saved.receipt.costs.closed).toBe(true);
            // A matching terminal intent is insufficient if the immutable source
            // revision no longer proves that this exact job was actually queued.
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const key = { kind: K.sessionState, handle: f.h.handle, sessionId: f.base.session.sessionId, namespace: 'atri_lifecycle', head: f.base.revision.stateHeads.atri_lifecycle };
                const original = await tx.getResource(key), doc = structuredClone(original.doc);
                doc.outbox[0].simulation.jobId = 'foreign.job';
                try {
                    await tx.putResource(key, { ...original, doc, integrity: hash(doc) });
                    await expect(readBackgroundTaskOutput(tx, f.h.handle, root)).rejects.toThrow();
                } finally { await tx.putResource(key, original); }
            });
            await f.cold();
            const cold = await f.authority.execution.runs.get(f.h.handle, runId);
            const reread = await f.host.persistence._engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, cold));
            expect(reread.claim).toEqual(saved.claim); expect((await f.run()).results).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 120000);

    test.each([{ ticks: 0 }, { deliberations: 0 }, { jobs: false }])('read and pump cannot invent background work with %j', async options => {
        const f = await fixture(make, options);
        try {
            expect(f.base.states.atri_lifecycle.outbox).toEqual([]);
            expect((await f.run()).results).toEqual([]);
            const pumped = await command(f, { kind: 'pump' });
            expect(pumped.states.atri_lifecycle.outbox).toEqual([]); expect((await f.run()).results).toEqual([]);
            expect(f.requests).toEqual([]); expect(f.effectRef).toBeUndefined();
            expect(pumped.states.atri_lifecycle.clocks.world).toBe(options.ticks === 0 ? 0 : 1000000);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['clock', 'disabled'])('a late response after original %s change preserves the fee but cannot adopt or finish', async change => {
        const f = await fixture(make, { ticks: 1 });
        f.onResponse(() => command(f, change === 'clock' ? { kind: 'clock.advance', commandId: 'advance', ticks: 1 }
            : { kind: 'app.command', domainId: 'progress', commandId: 'save', recordId: 'main', args: { effectiveTurns: 0 } }));
        try {
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
            const current = await f.core.observe(f.h.handle, f.base.session.sessionId), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(current.states.atri_lifecycle.domains.emotions.records).toEqual([]); expect(current.states.atri_lifecycle.domains.relations.records).toEqual([]);
            expect(current.states.atri_lifecycle.clocks.world).toBe(change === 'clock' ? 2 : 1); expect(root.outputClaims).toEqual([]);
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(bank.operations[root.budgetAuthorityRef.operationId].compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            await f.run(); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['clock', 'disabled'])('direct Task execution still checks the original simulation %s before dispatch', async change => {
        const f = await fixture(make, { ticks: 1 });
        try {
            const current = await command(f, change === 'clock' ? { kind: 'clock.advance', commandId: 'advance', ticks: 1 }
                : { kind: 'app.command', domainId: 'progress', commandId: 'save', recordId: 'main', args: { effectiveTurns: 0 } });
            const item = current.states.atri_lifecycle.outbox.find(item => item.status === 'pending');
            expect(item.simulation.tick).toBe(1);
            await expect(f.host.executeTask(f.h.handle, { sessionId: current.session.sessionId, revisionId: current.revision.revisionId,
                taskId: item.taskId, variantId: item.variantId, invocationId: item.invocationId, input: item.input,
                slotBindings: { structured: { scope: 'player', runtimeRouteId: f.route.runtimeRouteId } } }, undefined, undefined,
            { lifecycleInvocation: true })).rejects.toMatchObject({ code: 'native_orchestration_background_source_stale' });
            expect(f.requests).toEqual([]); expect(f.effectRef).toBeUndefined();
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(Object.values(bank.operations).flatMap(operation => operation.compute?.attempts ?? [])).toEqual([]);
            const after = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(after.revision.revisionId).toBe(current.revision.revisionId); expect(after.states.atri_lifecycle.outbox).toEqual(current.states.atri_lifecycle.outbox);
        } finally { await f.cleanup(); }
    }, 60000);

    test('unknown model usage preserves accepted Actor facts without completing or repeating a simulation Task', async () => {
        const f = await fixture(make, { usage: false });
        try {
            const outcome = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(outcome.snapshot.states.atri_lifecycle.domains.emotions.records[0].value.level).toBe(30);
            expect(root.status).toBe('running'); expect(root.resultRefs).toHaveLength(1); expect(root.outputClaims).toEqual([]);
            expect((await f.run()).results).toEqual([]); expect(f.requests).toHaveLength(1);
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(bank.operations[root.budgetAuthorityRef.operationId].compute.attempts[0].status).toBe('unknown');
        } finally { await f.cleanup(); }
    }, 60000);
});
