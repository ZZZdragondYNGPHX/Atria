import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { appraisalModelFixture } from './helpers/appraisal-model-fixture.js';
import { readBackgroundTaskOutput, readBackgroundTaskDelivery } from '../../src/native/orchestration/background-task-output-contracts.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { createNativeId } from '../../src/native/identity.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
describe.each(harnesses)('$name original bounded appraisal output', ({ make }) => {
    test('one original pending appraisal updates only its authored Actor domains and closes the real Root with charged finalizer work', async () => {
        const f = await appraisalModelFixture(make);
        try {
            const outcome = await f.run();
            expect(f.requests).toHaveLength(1);
            const result = outcome.results[0]; expect(result.authorityReceipt).toMatchObject({ decision: 'cognition.appraise', applied: 2 });
            const state = outcome.snapshot.states.atri_lifecycle.domains;
            expect(state.emotions.records[0].value).toMatchObject({ actor: f.actorId, level: 30, appraisal: { origin: 'model' } });
            expect(state.relations.records[0].value).toMatchObject({ actor: f.actorId, target: f.otherActorId, level: -5 });
            expect(outcome.snapshot.timeline).toEqual(f.base.timeline); expect(outcome.snapshot.states.atri_world_state).toEqual(f.base.states.atri_world_state);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(root.status).toBe('completed'); expect(root.outputClaims).toHaveLength(1);
            const facts = await f.h.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root));
            expect(facts.receipt.costs.closed).toBe(true);
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId), rows = bank.operations[root.budgetAuthorityRef.operationId].compute.localWork;
            expect(rows.filter(row => ['appraisal_parse', 'appraisal_adopt'].includes(row.kind)).map(row => [row.kind, row.status, row.orchestration.effectId]))
                .toEqual([['appraisal_parse', 'settled', f.effectRef.effectId], ['appraisal_adopt', 'settled', f.effectRef.effectId]]);
            const player = JSON.stringify(projectInformation(outcome.snapshot, 'player', { purpose: 'display' }));
            expect(player).not.toContain('modelProfileHash'); expect(player).not.toContain('"level"');
            const other = projectInformation(outcome.snapshot, 'other-actor', { purpose: 'context' });
            expect(other.items.some(item => item.semantic === 'relationship')).toBe(false);
            expect(JSON.stringify(f.requests[0])).not.toContain('沈墨怀疑有人跟踪自己。');
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const key = { kind: K.runControl, handle: f.h.handle, sessionId: f.base.session.sessionId }, saved = await tx.getResource(key);
                for (const change of ['missing', 'foreign', 'failed']) {
                    const doc = structuredClone(saved.doc), compute = doc.operations[root.budgetAuthorityRef.operationId].compute;
                    const row = compute.localWork.find(row => row.kind === 'appraisal_parse');
                    if (change === 'missing') compute.localWork = compute.localWork.filter(item => item !== row);
                    if (change === 'foreign') row.targetFingerprint = hash('foreign-appraisal-parse');
                    if (change === 'failed') row.usage.outcome = 'failed';
                    try {
                        await tx.putResource(key, { ...saved, doc, integrity: hash(doc) });
                        await expect(readBackgroundTaskDelivery(tx, f.h.handle, root, f.effectRef.effectId, facts.claim.domainReceiptRef)).rejects.toThrow();
                    } finally { await tx.putResource(key, saved); }
                }
            });
            expect((await f.run()).results).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('copied lanes, work outside finalization and duplicate parse cannot obtain another original writer callback', async () => {
        const f = await appraisalModelFixture(make), original = f.authority.runBackgroundTaskWork.bind(f.authority);
        let lane, callbacks = 0, copied, premature, repeated;
        f.authority.runBackgroundTaskWork = async args => {
            lane = args.lanePlan;
            const result = await original(args);
            if (args.kind === 'appraisal_parse') repeated = await original({ ...args, operation: async () => { callbacks++; } })
                .then(value => ({ value }), error => ({ error: error.code }));
            return result;
        };
        f.onResponse(async () => {
            copied = await original({ host: f.host, handle: f.h.handle, lanePlan: { ...lane }, kind: 'appraisal_adopt', value: {}, operation: async () => { callbacks++; } });
            premature = await original({ host: f.host, handle: f.h.handle, lanePlan: lane, kind: 'appraisal_adopt', value: {}, operation: async () => { callbacks++; } })
                .then(value => ({ value }), error => ({ error: error.code }));
        });
        try {
            await f.run();
            expect(copied).toEqual({ handled: false }); expect(premature).toEqual({ error: 'native_orchestration_background_producer_denied' });
            expect(repeated).toEqual({ error: 'native_orchestration_background_producer_denied' }); expect(callbacks).toBe(0);
            expect((await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId)).status).toBe('completed'); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('uncited private Actor candidates stay rejected by the original appraisal authority', async () => {
        const f = await appraisalModelFixture(make, { mutateCandidate: value => ({ ...value,
            updates: value.updates.map(update => ({ ...update, sourceItemIds: ['beliefs:other-private'] })) }) });
        try {
            const outcome = await f.run();
            expect(outcome.results[0].authorityReceipt).toMatchObject({ decision: 'cognition.appraise', applied: 0 });
            expect(outcome.results[0].authorityReceipt.decisions.map(row => row.status)).toEqual(['rejected', 'rejected']);
            expect(outcome.snapshot.states.atri_lifecycle.domains.emotions.records).toEqual([]);
            expect(outcome.snapshot.states.atri_lifecycle.domains.relations.records).toEqual([]);
            expect((await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId)).status).toBe('completed');
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('unknown usage retains the actual Actor adoption and a bounded Result without a completed Root', async () => {
        const f = await appraisalModelFixture(make, { usage: false });
        try {
            const outcome = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(outcome.snapshot.states.atri_lifecycle.domains.emotions.records[0].value.level).toBe(30);
            expect(root.status).toBe('running'); expect(root.resultRefs).toHaveLength(1); expect(root.outputClaims).toEqual([]);
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(bank.operations[root.budgetAuthorityRef.operationId].compute.attempts[0].status).toBe('unknown');
            expect((await f.run()).results).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('Actor availability withdrawn after send refuses appraisal adoption and preserves the original Model cost', async () => {
        const f = await appraisalModelFixture(make);
        f.onResponse(async () => {
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            const domain = snapshot.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(item => item.id === 'availability');
            await f.core.applyLifecycleCommand(f.h.handle, snapshot.session.sessionId, { type: 'lifecycle', invocationId: 'revoke-appraisal-actor',
                action: { kind: 'app.command', domainId: 'availability', commandId: 'save', recordId: 'main', args: { ...domain.initial, available: false } } },
            { expectedRevisionId: snapshot.revision.revisionId });
        });
        try {
            await expect(f.run()).rejects.toThrow();
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(snapshot.states.atri_lifecycle.domains.availability.records.find(item => item.id === 'main').value.available).toBe(false);
            expect(snapshot.states.atri_lifecycle.domains.emotions.records).toEqual([]);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(1);
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(bank.operations[root.budgetAuthorityRef.operationId].compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { await f.cleanup(); }
    }, 60000);

    test('cancel during final closure preserves the exact adopted Actor state and refuses V3 completion', async () => {
        const f = await appraisalModelFixture(make), bank = f.authority.execution.budgetPort, observe = bank.observeEffectClosure.bind(bank);
        let cancelled = false;
        bank.observeEffectClosure = async (...args) => {
            const costs = await observe(...args), snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            if (!cancelled && snapshot.states.atri_lifecycle.domains.emotions.records.length) {
                cancelled = true;
                const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
                await f.authority.execution.runs.cancel(f.h.handle, createNativeId('orchestrationCommand'), { ...runGuard(root), reasonCode: 'cancel_appraisal_output' });
            }
            return costs;
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(cancelled).toBe(true);
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(snapshot.states.atri_lifecycle.domains.emotions.records[0].value.level).toBe(30);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(root.cancelRequested).toBe(true); expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each([false, true])('adoption ACK saved=%s never creates a second Actor update or Model send', async saved => {
        const f = await appraisalModelFixture(make), transaction = f.h.engine.withTransaction.bind(f.h.engine);
        let injected = false;
        const matches = value => Boolean(value?.value?.snapshot?.states.atri_lifecycle.domains.emotions.records.length);
        f.h.engine.withTransaction = async (handle, callback, ...options) => {
            const value = await transaction(handle, async tx => {
                const result = await callback(tx);
                if (!injected && matches(result) && !saved) { injected = true; throw new StorageCommitUnknownError(new Error('Before appraisal closure save')); }
                return result;
            }, ...options);
            if (!injected && matches(value) && saved) { injected = true; throw new StorageCommitUnknownError(new Error('After appraisal closure save')); }
            return value;
        };
        try {
            const outcome = await f.run().then(value => ({ value }), error => ({ error }));
            expect(injected).toBe(true); expect(outcome.error?.code ?? null).toBe(saved ? null : 'storage_commit_unknown');
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(snapshot.states.atri_lifecycle.domains.emotions.records).toHaveLength(saved ? 1 : 0);
            expect(snapshot.states.atri_lifecycle.domains.relations.records).toHaveLength(saved ? 1 : 0);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            const bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const phases = bank.operations[root.budgetAuthorityRef.operationId].compute.localWork.filter(row => ['appraisal_parse', 'appraisal_adopt'].includes(row.kind));
            expect(phases).toHaveLength(2); expect(phases.every(row => row.status === 'settled' && row.usage.outcome === 'completed')).toBe(true);
            expect(f.requests).toHaveLength(1);
        } finally { f.h.engine.withTransaction = transaction; await f.cleanup(); }
    }, 60000);

    test('a failed publication rolls back Actor adoption while both actually executed local jobs remain billed', async () => {
        const f = await appraisalModelFixture(make), runs = f.authority.execution.runs, control = runs.control.bind(runs);
        runs.control = (handle, commandId, input, apply, ...options) => control(handle, commandId, input, async frame => {
            const result = await apply(frame);
            if (input.operation === 'result.publish') throw new Error('After appraisal Result publication');
            return result;
        }, ...options);
        try {
            await expect(f.run()).rejects.toThrow('After appraisal Result publication');
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(snapshot.states.atri_lifecycle.domains.emotions.records).toEqual([]);
            expect(snapshot.states.atri_lifecycle.domains.relations.records).toEqual([]);
            const root = await runs.get(f.h.handle, f.effectRef.runId), bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            expect(root.resultRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
            const phases = bank.operations[root.budgetAuthorityRef.operationId].compute.localWork.filter(row => ['appraisal_parse', 'appraisal_adopt'].includes(row.kind));
            expect(phases).toHaveLength(2); expect(phases.every(row => row.status === 'settled' && row.usage.outcome === 'completed')).toBe(true);
            expect(bank.operations[root.budgetAuthorityRef.operationId].compute.attempts[0].usage.totalTokens).toBe(20);
            expect((await f.run()).pending.reason).toBe('native_task_outcome_unknown'); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('insufficient local headroom fails before parsing or Actor adoption and retains the unused admission and original Model cost', async () => {
        const f = await appraisalModelFixture(make, { maxJobs: 6 });
        try {
            const outcome = await f.run(); expect(outcome.pending.reason).toBe('native_generation_budget_exhausted');
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(snapshot.states.atri_lifecycle.domains.emotions.records).toEqual([]);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId), bank = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const compute = bank.operations[root.budgetAuthorityRef.operationId].compute;
            expect(compute.localWork).toHaveLength(6);
            expect(compute.localWork.filter(row => row.kind === 'appraisal_parse')).toEqual([expect.objectContaining({ status: 'settled', usage: {
                wallMs: 0, cpuUserMicros: 0, cpuSystemMicros: 0, cpuScope: 'process', outcome: 'failed' } })]);
            expect(compute.localWork.some(row => row.kind === 'appraisal_adopt')).toBe(false);
            expect(compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(root.resultRefs).toEqual([]); expect(root.outputClaims).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each([false, true])('parse settlement ACK saved=%s observes exact usage and settles the other actual job without re-adopting', async saved => {
        const f = await appraisalModelFixture(make), original = f.core.runs.settleLocalWork.bind(f.core.runs);
        let injected = false;
        f.core.runs.settleLocalWork = async (...args) => {
            const control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const row = Object.values(control.operations).flatMap(operation => operation.compute?.localWork ?? []).find(row => row.attemptId === args[3]);
            if (!injected && row?.kind === 'appraisal_parse') {
                injected = true;
                if (saved) await original(...args);
                throw new StorageCommitUnknownError(new Error('Appraisal parse settlement ACK withheld'));
            }
            return original(...args);
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error }));
            expect(injected).toBe(true); expect(result.error?.code ?? null).toBe(saved ? null : 'storage_commit_unknown');
            const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
            expect(snapshot.states.atri_lifecycle.domains.emotions.records).toHaveLength(1);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId), control = await f.core.runs.status(f.h.handle, f.base.session.sessionId);
            const rows = control.operations[root.budgetAuthorityRef.operationId].compute.localWork;
            expect(rows.find(row => row.kind === 'appraisal_parse').status).toBe(saved ? 'settled' : 'charged');
            expect(rows.find(row => row.kind === 'appraisal_adopt').status).toBe('settled');
            expect(root.outputClaims).toHaveLength(saved ? 1 : 0); expect(f.requests).toHaveLength(1);
        } finally { f.core.runs.settleLocalWork = original; await f.cleanup(); }
    }, 60000);
});
