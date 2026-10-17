import { jest } from '@jest/globals';
import storage from 'node-persist';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectCommitFixture } from './helpers/project-commit-fixture.js';
import { toKey } from '../../src/users.js';
import { createNativeId } from '../../src/native/identity.js';
import { StudioService } from '../../src/native/authoring/studio-service.js';
import { runGuard } from '../../src/native/orchestration/controller-common.js';
import { readEffect, readApproval } from '../../src/native/orchestration/effect-contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const command = () => createNativeId('orchestrationCommand');
const taskFor = async f => (await f.agent.observeComputeSource(f.h.handle, f.projectId, f.taskId)).task;
const rootFor = (f, prepared) => f.authority.execution.runs.get(f.h.handle, prepared.runId);
const projectFor = f => f.studio.observeProject(f.h.handle, f.projectId);

describe.each(harnesses)('$name original approved Project Commit currentness', ({ make }) => {
    test.each(['Project', 'Review', 'cancel'])('%s changed after trusted approval refuses dispatch without replacing human data or refunding preparation', async change => {
        const f = await projectCommitFixture(make); let execute, fetch;
        try {
            const prepared = await f.prepare(); await f.approve(prepared);
            const bank = structuredClone((await taskFor(f)).compute);
            expect(bank.localWork).toEqual([expect.objectContaining({ status: 'settled', kind: 'project_tool',
                orchestration: { kind: 'local_work', effectId: prepared.effectId, ordinal: 0 }, usage: expect.objectContaining({ outcome: 'completed' }) })]);
            if (change === 'Project') {
                const current = await projectFor(f), source = structuredClone(current.source);
                source.project.displayName = 'Later original human Project'; source.project.updatedAt = 30;
                await f.studio.saveProjectSource(f.h.handle, f.projectId, { source, baseRevision: current.revision.revision, origin: { kind: 'human' } });
            } else if (change === 'Review') await f.agent.prepareReview(f.h.handle, f.projectId, f.taskId);
            else await f.authority.execution.runs.cancel(f.h.handle, command(), { ...runGuard(await rootFor(f, prepared)), reasonCode: 'human_cancel_before_project_commit' });
            const currentProject = await projectFor(f), humanTask = await taskFor(f), history = await f.studio.history(f.h.handle, f.projectId);
            execute = jest.spyOn(StudioService.prototype, 'executeWorkspace');
            fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Project Commit cannot send to a Provider'); });
            await expect(f.dispatch(prepared)).rejects.toThrow();
            expect(await projectFor(f)).toEqual(currentProject);
            expect(await f.studio.history(f.h.handle, f.projectId)).toEqual(history);
            const after = await taskFor(f), root = await rootFor(f, prepared);
            expect(after).toEqual(humanTask); expect(after.compute).toEqual(bank);
            expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]);
            const intent = await f.h.engine.withTransaction(f.h.handle, async tx => (await readEffect(tx, f.h.handle, root, prepared.effectId)).doc);
            expect(intent.status).toBe('ready'); expect(intent.dispatchToken).toBeNull();
            expect(root.cancelRequested).toBe(change === 'cancel');
            expect(execute).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
        } finally { execute?.mockRestore(); fetch?.mockRestore(); await f.cleanup(); }
    }, 30000);

    test('account disable in the real Studio beforeCommit callback prevents the Git write and preserves original recovery and spent work', async () => {
        const f = await projectCommitFixture(make); let fetch;
        const execute = f.studio.executeWorkspace; let callbacks = 0, executions = 0;
        try {
            const prepared = await f.prepare(); await f.approve(prepared);
            const preparation = structuredClone((await taskFor(f)).compute.localWork[0]);
            const before = await projectFor(f), history = await f.studio.history(f.h.handle, f.projectId);
            f.studio.executeWorkspace = function (handle, workspace, options) {
                executions++;
                return execute.call(this, handle, workspace, { ...options, beforeCommit: async receipt => {
                    callbacks++;
                    await storage.setItem(toKey(f.h.handle), { ...f.account, enabled: false });
                    return options.beforeCommit(receipt);
                } });
            };
            fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Project Commit cannot send to a Provider'); });
            await expect(f.dispatch(prepared)).rejects.toThrow();
            expect(callbacks).toBe(1); expect(executions).toBe(1);
            expect((await storage.getItem(toKey(f.h.handle))).enabled).toBe(false);
            expect(await projectFor(f)).toEqual(before); expect(await f.studio.history(f.h.handle, f.projectId)).toEqual(history);
            const task = await taskFor(f), root = await rootFor(f, prepared);
            expect(task).toMatchObject({ status: 'review', recovery: { status: 'awaiting_review', code: 'commit_receipt_missing' } });
            expect(task.attempts.findLast(attempt => attempt.kind === 'commit').status).toBe('interrupted');
            expect(task.changeSets).toEqual([]);
            const saved = await f.agent._repository.get(f.h.handle, f.projectId, f.taskId);
            expect(saved.commitIntent).toEqual({ changeSetId: expect.any(String), workspaceHash: hash(saved.workspace) });
            expect(await f.studio.inspectWorkspaceReceipt(f.h.handle, saved.workspace, saved.commitIntent.changeSetId)).toBeNull();
            expect(task.compute.localWork[0]).toEqual(preparation);
            expect(task.compute.localWork).toHaveLength(2);
            expect(task.compute.localWork[1]).toMatchObject({ status: 'settled', kind: 'project_tool',
                orchestration: { kind: 'local_work', effectId: prepared.effectId, ordinal: 1 }, usage: { outcome: 'failed' } });
            expect(task.compute.attempts).toEqual([]);
            expect(root.pendingEffectRefs).toEqual([prepared.effectId]); expect(root.outputClaims).toEqual([]); expect(root.resultRefs).toEqual([]);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                expect((await readEffect(tx, f.h.handle, root, prepared.effectId)).doc.status).toBe('dispatching');
                expect((await readApproval(tx, f.h.handle, root, prepared.approvalId)).doc.status).toBe('consumed');
            });
            const observed = await f.observe(prepared);
            expect(observed).toMatchObject({ status: 'dispatching', domainReceiptRef: null, claimRef: null });
            expect(await f.dispatch(prepared)).toEqual(observed);
            expect((await taskFor(f)).compute).toEqual(task.compute); expect(executions).toBe(1); expect(fetch).not.toHaveBeenCalled();
        } finally { f.studio.executeWorkspace = execute; fetch?.mockRestore(); await f.cleanup(); }
    }, 30000);
});
