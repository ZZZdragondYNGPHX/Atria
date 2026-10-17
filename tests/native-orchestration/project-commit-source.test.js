import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectConsumptionFixture } from './helpers/project-consumption-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const command = () => createNativeId('orchestrationCommand');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const requestFor = task => ({ domain: 'project', purpose: 'formal_commit', projectId: task.projectId, taskId: task.taskId,
    revision: task.baseRevision, executionFingerprint: task.executionFingerprint,
    reviewHash: hash({ workspace: task.workspace, review: task.review, validation: task.validation }) });

async function review(f) {
    await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId,
        { summary: 'Original human-reviewed Project proposal', steps: [{ id: 'rename', title: 'Rename this Project', impact: 'low' }] });
    const next = structuredClone(f.original); next.project.displayName = 'Reviewed Project name';
    await f.agent.executeTool(f.h.handle, f.projectId, f.task.taskId, { name: 'atri_agent_project_save', args: { source: next, stepId: 'rename' } });
    const task = await f.agent.prepareReview(f.h.handle, f.projectId, f.task.taskId);
    expect(task).toMatchObject({ status: 'review', review: { required: true }, validation: { status: 'passed' } });
    return task;
}

describe.each(harnesses)('$name explicit original Project Commit source', ({ make }) => {
    test('only the explicit frozen Review source is readable, using the original Task bank and a distinct Root', async () => {
        const f = await projectConsumptionFixture(make);
        try {
            await expect(f.source.capture(f.h.handle, requestFor(f.task))).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            const task = await review(f), request = requestFor(task), before = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            const { purpose: _purpose, reviewHash: _review, ...draft } = request;
            await expect(f.source.capture(f.h.handle, draft)).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            // Formal reads do not enter the prompt/context reader or its queues.
            f.agent.observeContext = () => { throw new Error('Formal source must use the original transaction reader'); };
            const captured = await f.source.capture(f.h.handle, request);
            expect(captured.budgetAuthorityRef).toEqual({ authority: 'project_task', projectId: f.projectId, taskId: task.taskId,
                operationId: hash({ projectId: f.projectId, taskId: task.taskId, revision: task.baseRevision, executionFingerprint: task.executionFingerprint }) });
            expect(captured.sourceBinding.sourceRef).toEqual({ projectId: f.projectId, taskId: task.taskId,
                revision: task.baseRevision, executionFingerprint: task.executionFingerprint });
            await expect(f.source.revalidate(f.h.handle, captured.sourceBinding, { root: f.root }))
                .rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            // This capability-free fixture Root tests source admission only;
            // its output node grants no Commit, Effect or approval authority.
            const runs = new RunRepository({ engine: f.h.engine,
                assertWriter: (handle, tx) => f.h.engine.nativeHostLifecycle.assertWriter(handle, tx),
                authorize: async ({ handle }) => { if (handle !== f.h.handle) throw new Error('Wrong source owner'); },
                admit: ({ handle, tx, sourceRequest }) => f.source.capture(handle, sourceRequest, { tx }) });
            const root = await runs.start(f.h.handle, command(), { planRef: f.root.planRef, sourceRequest: request,
                retentionPolicyRef: { policyId: 'original_commit_source_test' } });
            expect(root.runId).not.toBe(f.root.runId);
            await expect(f.h.engine.withTransaction(f.h.handle, tx => f.source.revalidate(f.h.handle, captured.sourceBinding, { tx, root })))
                .resolves.toEqual(captured);
            expect(root.pendingEffectRefs).toEqual([]); expect(root.pendingApprovalRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
            expect(await f.repository.get(f.h.handle, f.projectId, task.taskId)).toEqual(before);
        } finally { await f.cleanup(); }
    });

    test('re-evaluation replaces the frozen Review rather than extending an old Commit source', async () => {
        const f = await projectConsumptionFixture(make);
        try {
            const task = await review(f), request = requestFor(task), captured = await f.source.capture(f.h.handle, request);
            await expect(f.source.capture(f.h.handle, { ...request, reviewHash: hash('different Review') }))
                .rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            await expect(f.source.capture(f.h.handle, { ...request, purpose: 'draft' })).rejects.toThrow();
            await expect(f.source.capture(f.h.handle, { ...request, expectedSequence: task.sequence })).rejects.toThrow();
            const next = await f.agent.prepareReview(f.h.handle, f.projectId, task.taskId), nextRequest = requestFor(next);
            expect(nextRequest.reviewHash).not.toBe(request.reviewHash);
            await expect(f.source.revalidate(f.h.handle, captured.sourceBinding)).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            expect((await f.source.capture(f.h.handle, nextRequest)).sourceBinding.sourceRequest).toEqual(nextRequest);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(task.baseRevision);
        } finally { await f.cleanup(); }
    });

    test('a later human Project revision invalidates the reviewed source without recovering or mutating the Task', async () => {
        const f = await projectConsumptionFixture(make);
        try {
            const task = await review(f), captured = await f.source.capture(f.h.handle, requestFor(task));
            const before = await f.repository.get(f.h.handle, f.projectId, task.taskId);
            await f.write('Project');
            await expect(f.source.revalidate(f.h.handle, captured.sourceBinding)).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            expect(await f.repository.get(f.h.handle, f.projectId, task.taskId)).toEqual(before);
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe('Independent Project writer');
        } finally { await f.cleanup(); }
    });

    test('the real committing and completed Task cannot be recaptured as a new reviewed source', async () => {
        const f = await projectConsumptionFixture(make), entered = deferred(), release = deferred(); let committing;
        try {
            const task = await review(f), captured = await f.source.capture(f.h.handle, requestFor(task));
            const execute = f.studio.executeWorkspace.bind(f.studio);
            f.studio.executeWorkspace = async (...args) => { entered.resolve(); await release.promise; return execute(...args); };
            committing = f.agent.commit(f.h.handle, f.projectId, task.taskId).then(value => ({ value }), error => ({ error }));
            await entered.promise;
            const current = await f.agent.observeComputeSource(f.h.handle, f.projectId, task.taskId);
            expect(current.task.status).toBe('committing');
            await expect(f.source.capture(f.h.handle, requestFor(current.task))).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            await expect(f.source.revalidate(f.h.handle, captured.sourceBinding)).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            release.resolve();
            const completed = (await committing).value;
            expect(completed.status).toBe('completed');
            await expect(f.source.capture(f.h.handle, requestFor(completed))).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe('Reviewed Project name');
        } finally { release.resolve(); if (committing) await committing; await f.cleanup(); }
    });
});
