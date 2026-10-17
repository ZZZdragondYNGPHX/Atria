import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReviewFixture } from './helpers/project-review-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readProjectReviewOutput } from '../../src/native/orchestration/project-review-output-contracts.js';
import { sendAttemptId } from '../../src/native/orchestration/budget-port.js';
import { projectReviewCosts } from '../../src/native/orchestration/project-review-output-contracts.js';

const configureFailure = ({ retry = false } = {}) => async ({ plan, h, seeded, task }) => {
    const primary = structuredClone(await seeded.persistence.getRuntimeRoute(h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId));
    primary.policy.maxRetries = retry ? 1 : 0; primary.policy.maxFallbackAttempts = 1; primary.executionPolicy.reuse = 'exact';
    primary.executionPolicy.computeBudget.maxRequests = 8;
    const module = { ...seeded.module, revision: 'project-failure-module', body: 'Original Project-specific prompt survives a policy fallback.' };
    await seeded.library.commit(h.handle, 'core.prompt-module', module);
    const program = { ...seeded.prompt, revision: 'project-failure-program', stages: [{ stageId: 'stage.main', moduleRefs: [{
        resourceType: 'core.prompt-module', scope: 'library', resourceId: module.promptModuleId, revision: module.revision }] }] };
    await seeded.library.commit(h.handle, 'core.prompt-program', program);
    primary.projectPromptBindings = [{ projectId: task.projectId, promptProgramRef: { resourceType: 'core.prompt-program', scope: 'library',
        resourceId: program.promptProgramId, revision: program.revision }, candidateId: 'original-project-failure-policy' }];
    const connection = { ...seeded.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: 'Project fallback connection' };
    await seeded.persistence.saveConnectionProfile(h.handle, connection);
    const model = { ...await seeded.persistence.getModelProfile(h.handle, seeded.model.modelProfileId), modelProfileId: createNativeId('modelProfile'), remoteModelId: 'project-fallback',
        connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
    await seeded.persistence.saveModelProfile(h.handle, model); primary.executionPolicy.allowedModelProfileIds.push(model.modelProfileId);
    const fallback = { ...structuredClone(primary), runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Owned original Project fallback',
        modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId }, connectionProfileRef: model.connectionProfileRef };
    await seeded.persistence.saveRuntimeRoute(h.handle, fallback);
    const stored = await seeded.persistence.getRuntimeRoute(h.handle, fallback.runtimeRouteId);
    primary.fallbackRouteRefs = [{ scope: 'player', runtimeRouteId: stored.runtimeRouteId }];
    await seeded.persistence.saveRuntimeRoute(h.handle, primary);
    plan.dependencyPins[0].integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, primary.runtimeRouteId));
    plan.definition.nodes[0].dependencyPinIds.push('studio.fallback');
    plan.dependencyPins.push({ pinId: 'studio.fallback', port: 'model', resourceRef: primary.fallbackRouteRefs[0], integrity: hash(stored) });
};

describe.each(CONTRACT_HARNESSES)('$name original Project failure policy', ({ make }) => {
    test.each([false, true])('one original reviewed Project survives a paid rejection without repeating tools, retry=%s', async retry => {
        const f = await projectReviewFixture(make, { outputContract: true, configurePlan: configureFailure({ retry }),
            responseStatus: index => index === 0 ? 500 : 200, responseOffset: 1 });
        try {
            await f.run();
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId), task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            const output = await f.h.engine.withTransaction(f.h.handle, tx => readProjectReviewOutput(tx, f.h.handle, root));
            expect(root.status).toBe('completed'); expect(task.status).toBe('review');
            expect(f.requests.map(body => body.model)).toEqual(['p4-fixture', retry ? 'p4-fixture' : 'project-fallback', 'p4-fixture', 'p4-fixture']);
            expect(f.requests.every(body => JSON.stringify(body).includes('Original Project-specific prompt survives a policy fallback.'))).toBe(true);
            expect(f.requests[0].tools).toEqual(f.requests[1].tools);
            expect(task.compute.attempts).toHaveLength(4); expect(task.compute.attempts.every(row => row.status === 'settled')).toBe(true);
            const firstEffect = task.compute.attempts[0].orchestration.effectId;
            expect(task.compute.attempts.slice(0, 2).map(row => row.attemptId)).toEqual([sendAttemptId(firstEffect, 0), sendAttemptId(firstEffect, 1)]);
            expect(task.attempts.filter(row => row.kind === 'generation').flatMap(row => row.calls).map(call => call.nativeReceipt.name))
                .toEqual(['atri_agent_set_plan', 'atri_agent_project_save', 'atri_agent_prepare_review']);
            expect(output.receipt.costs.closed).toBe(true); expect(output.receipt.costs.budgetAttemptRefs.filter(ref => ref.kind !== 'local_work')).toHaveLength(4);
            expect(task.commitIntent).toBeNull(); expect(task.changeSets).toEqual([]);
        } finally { await f.cleanup(); }
    }, 120000);

    test('original capability evidence and owned fallback pins are required before sending or charging', async () => {
        const f = await projectReviewFixture(make, { outputContract: true, configurePlan: configureFailure() });
        try {
            const missing = structuredClone(f.plan);
            missing.definition.nodes[0].dependencyPinIds = missing.definition.nodes[0].dependencyPinIds.filter(id => id !== 'studio.fallback');
            missing.dependencyPins = missing.dependencyPins.filter(pin => pin.pinId !== 'studio.fallback');
            const validate = async plan => {
                const draft = await f.plans.create(f.h.handle, createNativeId('orchestrationCommand'), plan);
                return f.plans.validate(f.h.handle, { planId: draft.planId, expectedDraftVersion: draft.draftVersion, expectedDefinitionHash: draft.definitionHash });
            };
            expect((await validate(missing)).status).toBe('invalid');
            const primary = await f.persistence.getRuntimeRoute(f.h.handle, f.route.runtimeRouteId);
            await f.persistence.saveRuntimeRoute(f.h.handle, { ...primary, executionPolicy: { ...primary.executionPolicy, continuity: 'active_execution' } });
            const unsupported = structuredClone(f.plan); unsupported.dependencyPins[0].integrity = hash(await f.persistence.getRuntimeRoute(f.h.handle, primary.runtimeRouteId));
            expect((await validate(unsupported)).status).toBe('invalid');
            const task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(f.requests).toEqual([]); expect(f.effects).toEqual([]); expect(task.compute).toBeUndefined();
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['fallback-config', 'human-takeover'])('%s changed during the paid primary rejection prevents fallback and preserves the original facts', async change => {
        const f = await projectReviewFixture(make, { outputContract: true, configurePlan: configureFailure(), responseStatus: () => 500 });
        f.onResponse(async ({ index }) => {
            if (index !== 0) return;
            if (change === 'human-takeover') await f.agent.takeOver(f.h.handle, f.projectId, f.task.taskId);
            else {
                const fallback = await f.persistence.getRuntimeRoute(f.h.handle, f.plan.dependencyPins.find(pin => pin.pinId === 'studio.fallback').resourceRef.runtimeRouteId);
                const model = await f.persistence.getModelProfile(f.h.handle, fallback.modelProfileRef.modelProfileId);
                await f.persistence.saveModelProfile(f.h.handle, { ...model, remoteModelId: 'changed-after-primary-send' });
            }
        });
        try {
            await expect(f.run()).rejects.toThrow();
            const task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(f.requests).toHaveLength(1); expect(task.compute.attempts).toHaveLength(1);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(task.attempts.flatMap(attempt => attempt.calls)).toEqual([]); expect(task.changeSets).toEqual([]);
            expect(task.status === 'taken_over').toBe(change === 'human-takeover');
        } finally { await f.cleanup(); }
    }, 60000);

    test('missing direct usage preserves its adopted Tool and blocks a new round, terminal OutputClaim and paid-work replay', async () => {
        const f = await projectReviewFixture(make, { outputContract: true, configurePlan: configureFailure(), missingUsage: true,
            responseStatus: index => index === 0 ? 500 : 200, responseOffset: 1 });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_project_round_not_ready' });
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId), before = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(before.compute.attempts).toHaveLength(2);
            expect(before.compute.attempts.every(row => row.status === 'unknown')).toBe(true);
            expect(before.attempts.flatMap(attempt => attempt.calls).map(call => call.nativeReceipt.name)).toEqual(['atri_agent_set_plan']);
            expect(root.status).not.toBe('completed'); expect(root.outputClaims).toEqual([]);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => projectReviewCosts(tx, f.h.handle, root))).closed).toBe(false);
            f.recreateExecutor(); await expect(f.run()).rejects.toThrow();
            expect(f.requests).toHaveLength(2); expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).compute).toEqual(before.compute);
        } finally { await f.cleanup(); }
    }, 120000);

    test('transport unknown after the first actual Tool preserves that one Tool and never falls back or replays it', async () => {
        const f = await projectReviewFixture(make, { outputContract: true, configurePlan: configureFailure() });
        f.onResponse(({ index }) => { if (index === 1) throw new Error('Synthetic connection lost after original Tool'); });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'generation_provider_submission_unknown' });
            const before = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(f.requests).toHaveLength(2); expect(before.compute.attempts).toHaveLength(2);
            expect(before.compute.attempts.map(row => row.status)).toEqual(['settled', 'unknown']);
            expect(before.attempts.flatMap(attempt => attempt.calls).map(call => call.nativeReceipt.name)).toEqual(['atri_agent_set_plan']);
            expect(before.changeSets).toEqual([]);
            f.recreateExecutor(); await expect(f.run()).rejects.toThrow();
            expect(f.requests).toHaveLength(2); expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).compute).toEqual(before.compute);
        } finally { await f.cleanup(); }
    }, 120000);
});
