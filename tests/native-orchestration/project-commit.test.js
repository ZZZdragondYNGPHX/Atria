import { projectCommitFixture } from './helpers/project-commit-fixture.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { readProjectCommitOutput } from '../../src/native/orchestration/project-commit-contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

describe.each(CONTRACT_HARNESSES)('$name original trusted Project Commit', ({ make }) => {
    test('real isolated user approval authorizes one original metadata commit and retains its cold receipt', async () => {
        const f = await projectCommitFixture(make);
        try {
            const prepared = await f.prepare();
            expect((await f.studio.getProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.source.project.displayName);
            await f.approve(prepared);
            const committed = await f.dispatch(prepared);
            expect(committed.domainReceiptRef).toMatchObject({ projectId: f.projectId, taskId: f.taskId, baseRevision: f.task.baseRevision });
            expect((await f.studio.getProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.proposed.project.displayName);
            expect(await f.dispatch(prepared)).toEqual(committed);
            await f.cold(); expect(await f.observe(prepared)).toEqual(committed); expect(await f.dispatch(prepared)).toEqual(committed);
        } finally { await f.cleanup(); }
    }, 180000);

    test('unapproved commit and copied private writer permits never execute the original Studio writer', async () => {
        const f = await projectCommitFixture(make);
        try {
            const prepared = await f.prepare();
            await expect(f.dispatch(prepared)).rejects.toThrow();
            await expect(f.agent.commit(f.h.handle, f.projectId, f.taskId, { nativeCommitPermit: {} })).rejects.toThrow();
            expect((await f.studio.getProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.source.project.displayName);
            expect((await f.agent.observeTask(f.h.handle, f.projectId, f.taskId)).status).toBe('review');
        } finally { await f.cleanup(); }
    }, 180000);

    test('same prepare command replays its exact durable request without another Run, fee or approval, including concurrent and cold retries', async () => {
        const f = await projectCommitFixture(make);
        try {
            const [prepared, concurrent] = await Promise.all([f.prepare(), f.prepare()]); expect(concurrent).toEqual(prepared);
            const before = await f.agent._repository.get(f.h.handle, f.projectId, f.taskId);
            expect(await f.prepare()).toEqual(prepared);
            await expect(f.authority.prepare(f.h.handle, { ...f.input, computeBudget: { ...f.input.computeBudget, maxTokens: 2 } }))
                .rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
            expect(await f.agent._repository.get(f.h.handle, f.projectId, f.taskId)).toEqual(before);
            const roots = await f.authority.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle }));
            expect(roots).toHaveLength(1); expect(before.compute.localWork).toHaveLength(1);
            await f.cold(); expect(await f.prepare()).toEqual({ ...prepared, status: 'recovery_required' });
            await expect(f.dispatch(prepared)).rejects.toThrow();
            expect(await f.agent._repository.get(f.h.handle, f.projectId, f.taskId)).toEqual(before);
        } finally { await f.cleanup(); }
    }, 180000);

    test('a saved prepare Approval ACK loss only replays the same original command and fee', async () => {
        const f = await projectCommitFixture(make), engine = f.authority.engine, transaction = engine.withTransaction.bind(engine);
        let injected = false;
        engine.withTransaction = async (...args) => {
            const result = await transaction(...args);
            if (!injected && result?.outcome?.approvalId && result.outcome.status === 'pending') {
                injected = true; throw new StorageCommitUnknownError(new Error('Synthetic saved prepare ACK loss'));
            }
            return result;
        };
        try {
            await expect(f.prepare()).rejects.toMatchObject({ code: 'storage_commit_unknown' }); expect(injected).toBe(true);
            const before = await f.agent._repository.get(f.h.handle, f.projectId, f.taskId), prepared = await f.prepare();
            expect(prepared.status).toBe('waiting_approval'); expect(before.compute.localWork).toHaveLength(1);
            expect(await f.agent._repository.get(f.h.handle, f.projectId, f.taskId)).toEqual(before);
            await f.approve(prepared); expect((await f.dispatch(prepared)).status).toBe('completed');
        } finally { engine.withTransaction = transaction; await f.cleanup(); }
    }, 180000);

    test('an insufficient explicit Result byte allowance rejects before any formal commit or local fee', async () => {
        const f = await projectCommitFixture(make, { maxBytes: 1 });
        try {
            await expect(f.prepare()).rejects.toMatchObject({ code: 'native_orchestration_project_commit_result_bound' });
            expect((await f.agent.observeTask(f.h.handle, f.projectId, f.taskId)).compute).toBeUndefined();
            expect((await f.studio.getProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.source.project.displayName);
        } finally { await f.cleanup(); }
    }, 180000);

    test.each(['saved', 'missing'])('a %s Effect receipt ACK never repeats the original Studio commit and retains exact costs', async ack => {
        const f = await projectCommitFixture(make), effects = f.authority.execution.effects, observe = effects.observe.bind(effects);
        let injected = false;
        effects.observe = async (...args) => {
            injected = true; if (ack === 'saved') await observe(...args);
            throw new StorageCommitUnknownError(new Error('Synthetic Project receipt ACK loss'));
        };
        try {
            const prepared = await f.prepare(); await f.approve(prepared);
            const outcome = await f.dispatch(prepared).then(value => ({ value }), error => ({ error: error.code }));
            expect(injected).toBe(true); expect(Boolean(outcome.value)).toBe(ack === 'saved');
            const task = await f.agent._repository.get(f.h.handle, f.projectId, f.taskId), observed = await f.observe(prepared);
            expect(task.changeSets).toHaveLength(1); expect(task.compute.localWork).toHaveLength(2);
            expect(task.compute.localWork.every(row => row.status === 'settled')).toBe(true);
            expect(observed.status).toBe(ack === 'saved' ? 'completed' : 'committed_pending_output');
            expect(await f.dispatch(prepared)).toEqual(observed);
            await f.cold(); expect(await f.dispatch(prepared)).toEqual(observed);
            expect(await f.agent._repository.get(f.h.handle, f.projectId, f.taskId)).toEqual(task);
        } finally { effects.observe = observe; await f.cleanup(); }
    }, 180000);

    test('rehashed wrong action pin or local-work target cannot validate a completed Project Commit', async () => {
        const f = await projectCommitFixture(make);
        try {
            const prepared = await f.prepare(); await f.approve(prepared); await f.dispatch(prepared);
            const root = await f.authority.execution.runs.get(f.h.handle, prepared.runId);
            await f.authority.engine.withTransaction(f.h.handle, async tx => {
                const key = controlRecordKey(f.h.handle, root.runId, 'effect', prepared.effectId), saved = await tx.getResource(key), altered = structuredClone(saved.doc);
                altered.inputRef.descriptorIntegrity = 'f'.repeat(64); altered.inputHash = hash(altered.inputRef);
                await tx.putResource(key, { ...saved, doc: altered, integrity: hash(altered) });
                try { await expect(readProjectCommitOutput(tx, f.h.handle, root, f.authority.projectAgent)).rejects.toThrow(); }
                finally { await tx.putResource(key, saved); }
                const taskKey = { kind: K.projectAgentTask, handle: f.h.handle, projectId: f.projectId, taskId: f.taskId };
                const savedTask = await tx.getResource(taskKey), alteredTask = structuredClone(savedTask.doc);
                const work = alteredTask.compute.localWork.find(row => row.orchestration.effectId === prepared.effectId && row.orchestration.ordinal === 1);
                expect(work).toBeDefined(); work.targetFingerprint = 'e'.repeat(64);
                await tx.putResource(taskKey, { ...savedTask, doc: alteredTask, integrity: hash(alteredTask) });
                try { await expect(readProjectCommitOutput(tx, f.h.handle, root, f.authority.projectAgent)).rejects.toThrow(); }
                finally { await tx.putResource(taskKey, savedTask); }
            });
            expect((await f.authority.execution.runs.get(f.h.handle, prepared.runId)).status).toBe('completed');
        } finally { await f.cleanup(); }
    }, 180000);

});
