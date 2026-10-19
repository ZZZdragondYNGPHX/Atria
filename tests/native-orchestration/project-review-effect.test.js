import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectReviewFixture as fixture } from './helpers/project-review-fixture.js';
import { readProjectRoundReceipt } from '../../src/native/orchestration/project-round-contracts.js';
import { readProjectOwnedSource } from '../../src/native/orchestration/project-tool-receipts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));

describe.each(harnesses)('$name original Project proposal and Review Effects', ({ make }) => {
    test('actual proposals and evaluated Workspace end at original human Review without a formal Project commit', async () => {
        const f = await fixture(make);
        try {
            await f.run(); const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.status).toBe('review'); expect(task.review.required).toBe(true); expect(task.validation.status).toBe('passed');
            expect(task.workspace.operations).toHaveLength(1); expect(task.workspace.operations[0].operationType).toBe('project.save');
            expect(task.changeSets).toEqual([]);
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).commitIntent).toBeNull();
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.original.project.displayName);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                const last = await readProjectRoundReceipt(tx, f.h.handle, root, root.attemptRefs.at(-1), { projectAgent: f.agent });
                expect(last.receipt.round).toBe(2);
                expect((await readProjectOwnedSource(tx, f.h.handle, root, { projectAgent: f.agent })).reviewSource).toBe(true);
            });
            expect(task.attempts.filter(item => item.kind === 'generation').every(item => item.status === 'completed')).toBe(true);
            expect(f.requests).toHaveLength(3); expect(task.compute.attempts).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 45000);

    test('an unpinned Review tool is refused by the original Model response allowlist before Workspace evaluation', async () => {
        const f = await fixture(make, { unpinned: true });
        try {
            await expect(f.run()).rejects.toThrow('generation_response_invalid');
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).proposals).toHaveLength(1);
            expect(task.workspace).toBeNull(); expect(task.review).toBeNull(); expect(task.changeSets).toEqual([]);
            expect(task.compute.attempts).toHaveLength(3); expect(f.requests).toHaveLength(3);
        } finally { await f.cleanup(); }
    }, 45000);

    test.each([false, true])('Review final Task receipt ACK saved=%s never repeats the original Workspace evaluation', async saved => {
        const f = await fixture(make), save = f.repository.save.bind(f.repository), evaluate = f.studio.evaluateWorkspace.bind(f.studio);
        let writes = 0, evaluations = 0;
        f.studio.evaluateWorkspace = (...args) => { evaluations++; return evaluate(...args); };
        f.repository.save = async (handle, next, ...args) => {
            if (next.attempts.some(attempt => attempt.calls.some(call => call.nativeReceipt?.name === 'atri_agent_prepare_review'))) {
                if (++writes === 1) {
                    if (saved) await save(handle, next, ...args);
                    throw Object.assign(new Error('Synthetic lost Review Task receipt ACK'), { code: 'storage_commit_unknown' });
                }
            }
            return save(handle, next, ...args);
        };
        try {
            const result = await f.run().then(value => ({ value }), error => ({ error }));
            expect(Boolean(result.error)).toBe(!saved); expect(evaluations).toBe(1);
            const task = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(task.changeSets).toEqual([]); expect(task.compute.attempts).toHaveLength(3); expect(f.requests).toHaveLength(3);
            expect(task.attempts.flatMap(attempt => attempt.calls).filter(call => call.nativeReceipt?.name === 'atri_agent_prepare_review')).toHaveLength(saved ? 1 : 0);
        } finally { await f.cleanup(); }
    }, 45000);
});
