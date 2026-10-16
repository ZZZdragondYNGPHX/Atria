import express from 'express';
import httpRequest from 'supertest';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReadFixture } from './helpers/project-tool-fixture.js';
import { projectReviewFixture } from './helpers/project-review-fixture.js';
import { ProjectAgentService } from '../../src/native/project-agent.js';
import { NativeNarratorOrchestrationAuthority } from '../../src/native/orchestration/native-turn-orchestration.js';
import { RunObservationService } from '../../src/native/orchestration/run-observation-service.js';
import { createNativeOrchestrationRouter } from '../../src/endpoints/native-orchestration.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash, putMutable } from '../../src/native/repositories/common.js';
import { controlRecordKey, runGuard } from '../../src/native/orchestration/controller-common.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { BudgetPort, localWorkAttemptId } from '../../src/native/orchestration/budget-port.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
function cold(f) {
    const agent = new ProjectAgentService({ studio: f.studio, repository: f.repository, maxRepairRounds: 2 });
    const authority = new NativeNarratorOrchestrationAuthority({ engine: f.h.engine, sessionCore: f.core,
        projectAgent: agent, projectRepository: f.repository });
    const observations = new RunObservationService({ engine: f.h.engine, sessionCore: f.core, projectAgent: agent, studio: f.studio,
        reconcileEffect: (handle, input) => authority.reconcileEffect(handle, input), pollMs: 0 });
    const service = { observations, hostBootId: f.h.engine.nativeHostLifecycle.hostBootId };
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => { req.user = { profile: { handle: f.h.handle, enabled: true } }; next(); });
    app.use('/api/native/orchestration', createNativeOrchestrationRouter(() => service));
    return { authority,
        mutate: (method, body, id = createNativeId('orchestrationCommand')) => httpRequest(app)
            .post('/api/native/orchestration/runs/' + method).set('X-Atria-Host-Boot-Id', service.hostBootId)
            .send({ schemaVersion: 1, commandId: id, expectedHostBootId: service.hostBootId, body }),
        observe: runId => httpRequest(app).post('/api/native/orchestration/runs/observe')
            .send({ schemaVersion: 1, body: { runId, cursor: null, limit: 100 } }),
    };
}

describe.each(harnesses)('$name original Project tool cold reconciliation', ({ make }) => {
    test('a saved original Task read receipt confirms its Effect through protected HTTP without returning its body', async () => {
        const f = await projectReadFixture(make), effects = f.authority.execution.effects, observe = effects.observe.bind(effects);
        effects.observe = (handle, input) => input.observation.reasonCode === 'project_read_completed'
            ? Promise.reject(new StorageCommitUnknownError(new Error('Before Project Host receipt commit'))) : observe(handle, input);
        try {
            await expect(f.run()).rejects.toThrow(); effects.observe = observe;
            const input = { ...f.effects[1] }, before = await f.authority.execution.runs.get(f.h.handle, input.runId);
            const taskBefore = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(taskBefore.attempts.flatMap(attempt => attempt.calls).filter(call => call.nativeReceipt)).toHaveLength(1);
            await f.writeProject();
            const currentProject = await f.studio.observeRevision(f.h.handle, f.projectId);
            await f.h.engine.nativeHostLifecycle.afterRestore(f.h.handle);
            const client = cold(f), runs = client.authority.execution.runs;
            await client.mutate('recover', runGuard(before)).expect(200);
            const body = runGuard(await runs.get(f.h.handle, input.runId)), id = createNativeId('orchestrationCommand');
            expect((await client.observe(input.runId).expect(200)).body.outcome.payload.controls.reconcile).toBe(true);
            const result = (await client.mutate('reconcile', body, id).expect(200)).body.outcome;
            expect(result).toMatchObject({ status: 'blocked', resumed: false, observation: { status: 'confirmed', budgetSettled: true } });
            expect((await client.mutate('reconcile', body, id).expect(200)).body.outcome).toEqual(result);
            expect((await client.observe(input.runId).expect(200)).body.outcome.payload.controls.reconcile).toBe(false);
            const after = await runs.get(f.h.handle, input.runId);
            expect(after.pendingEffectRefs).toEqual([]); expect(after.progress).toEqual(before.progress); expect(after.outputClaims).toEqual([]);
            expect(hash(await f.repository.get(f.h.handle, f.projectId, f.task.taskId))).toBe(hash(taskBefore));
            expect(taskBefore.conversation.some(item => item.role === 'tool')).toBe(false);
            expect(JSON.stringify(result)).not.toContain('dispatchToken'); expect(JSON.stringify(result)).not.toContain('resultHash');
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(currentProject.revision); expect(f.requests).toHaveLength(1);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, input.runId, 'effect', input.effectId), saved = await tx.getResource(key);
                await putMutable(tx, key, { ...saved.doc, endpointBindingDigest: hash('foreign tool target') }, { expectedIntegrity: saved.integrity });
            });
            await expect(client.authority.reconcileEffect(f.h.handle, input)).rejects.toThrow('native_orchestration_project_tool_receipt_invalid');
        } finally { effects.observe = observe; await f.cleanup(); }
    }, 30000);

    test.each(['local_usage', 'task_receipt'])('%s remains unknown and does not repeat the original Task tool', async stage => {
        const f = await projectReadFixture(make), settle = BudgetPort.prototype.settleLocalWork, save = f.repository.save.bind(f.repository);
        let intercepted = false;
        if (stage === 'local_usage') BudgetPort.prototype.settleLocalWork = function (handle, ref, attemptId, usage) {
            if (f.effects[1] && attemptId === localWorkAttemptId(f.effects[1].effectId, 0)) { intercepted = true; throw new Error('Before Project tool usage settlement'); }
            return settle.call(this, handle, ref, attemptId, usage);
        };
        else f.repository.save = async (handle, next, ...args) => {
            if (!intercepted && next.attempts.some(attempt => attempt.calls.some(call => call.nativeReceipt))) {
                intercepted = true; throw new StorageCommitUnknownError(new Error('Before Project Task receipt commit'));
            }
            return save(handle, next, ...args);
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(intercepted).toBe(true);
            BudgetPort.prototype.settleLocalWork = settle; f.repository.save = save;
            const input = { ...f.effects[1] }, before = await f.authority.execution.runs.get(f.h.handle, input.runId);
            const taskBefore = hash(await f.repository.get(f.h.handle, f.projectId, f.task.taskId));
            await f.h.engine.nativeHostLifecycle.afterRestore(f.h.handle);
            const client = cold(f), runs = client.authority.execution.runs;
            await client.mutate('recover', runGuard(before)).expect(200);
            const result = (await client.mutate('reconcile', runGuard(await runs.get(f.h.handle, input.runId))).expect(200)).body.outcome;
            expect(result).toMatchObject({ status: 'reconciling', resumed: false, observation: { status: 'unknown', receiptRef: null } });
            expect((await client.observe(input.runId).expect(200)).body.outcome.payload.controls.reconcile).toBe(true);
            expect((await runs.get(f.h.handle, input.runId)).pendingEffectRefs).toEqual([input.effectId]);
            expect(hash(await f.repository.get(f.h.handle, f.projectId, f.task.taskId))).toBe(taskBefore); expect(f.requests).toHaveLength(1);
        } finally { BudgetPort.prototype.settleLocalWork = settle; f.repository.save = save; await f.cleanup(); }
    }, 30000);

    test.each(['host_receipt', 'task_receipt'])('Review %s never reevaluates or formally commits the Workspace', async stage => {
        const f = await projectReviewFixture(make, { outputContract: true }), effects = f.authority.execution.effects;
        const observe = effects.observe.bind(effects), save = f.repository.save.bind(f.repository), evaluate = f.studio.evaluateWorkspace.bind(f.studio);
        let evaluations = 0, intercepted = false, effectId;
        f.studio.evaluateWorkspace = (...args) => { evaluations++; return evaluate(...args); };
        if (stage === 'host_receipt') effects.observe = async (handle, input) => {
            const root = await f.authority.execution.runs.get(handle, input.runId);
            const intent = (await f.h.engine.withTransaction(handle, tx => readEffect(tx, handle, root, input.effectId))).doc;
            if (intent.inputRef.call?.name === 'atri_agent_prepare_review') {
                intercepted = true; effectId = input.effectId; throw new StorageCommitUnknownError(new Error('Before Review Host receipt'));
            }
            return observe(handle, input);
        };
        else f.repository.save = async (handle, next, ...args) => {
            if (!intercepted && next.attempts.some(attempt => attempt.calls.some(call => call.nativeReceipt?.name === 'atri_agent_prepare_review'))) {
                intercepted = true; throw new StorageCommitUnknownError(new Error('Before Review Task receipt'));
            }
            return save(handle, next, ...args);
        };
        try {
            await expect(f.run()).rejects.toThrow(); expect(intercepted).toBe(true); expect(evaluations).toBe(1);
            effects.observe = observe; f.repository.save = save;
            const runId = f.effects[0].runId, before = await f.authority.execution.runs.get(f.h.handle, runId);
            effectId ??= before.pendingEffectRefs[0];
            const taskBefore = hash(await f.repository.get(f.h.handle, f.projectId, f.task.taskId));
            await f.h.engine.nativeHostLifecycle.afterRestore(f.h.handle);
            const client = cold(f), runs = client.authority.execution.runs;
            await client.mutate('recover', runGuard(before)).expect(200);
            const result = (await client.mutate('reconcile', runGuard(await runs.get(f.h.handle, runId))).expect(200)).body.outcome;
            expect(result.observation.status).toBe(stage === 'host_receipt' ? 'confirmed' : 'unknown');
            expect(result.observation.effectId).toBe(effectId); expect(result.resumed).toBe(false); expect(evaluations).toBe(1);
            expect(hash(await f.repository.get(f.h.handle, f.projectId, f.task.taskId))).toBe(taskBefore);
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).changeSets).toEqual([]);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision); expect(f.requests).toHaveLength(3);
        } finally { effects.observe = observe; f.repository.save = save; f.studio.evaluateWorkspace = evaluate; await f.cleanup(); }
    }, 60000);
});
