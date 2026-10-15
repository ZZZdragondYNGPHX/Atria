import { jest } from '@jest/globals';
import { projectConsumptionFixture as fixture } from './helpers/project-consumption-fixture.js';
import { withNativeResourceWrites } from '../../src/native/repositories/common.js';
import { withRuntimeWrite } from '../../src/native/model-prompt-runtime/runtime-write.js';
import { createNativeId } from '../../src/native/identity.js';
import { BudgetPort } from '../../src/native/orchestration/budget-port.js';
import { SourcePort } from '../../src/native/orchestration/source-port.js';
import { services } from '../agent-intelligence/project-fixture.js';
import { ProjectTaskRepository } from '../../src/native/agent-intelligence/project-task-repository.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const command = () => createNativeId('orchestrationCommand');
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const sql = process.env.ATRIA_TEST_PROJECT_BOUNDARY_SQL === '1';
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => sql || ['FsEngine', 'SqliteEngine'].includes(name));
if (sql) jest.setTimeout(60000);

describe.each(harnesses)('$name original Project consumption boundary', ({ make }) => {
    test('original Task and Studio source reads complete inside the real authority boundary without queued reentry', async () => {
        const f = await fixture(make);
        try {
            await expect(f.consume()).resolves.toBe(f.task.intent);
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).compute).toBeUndefined();
        } finally { await f.cleanup(); }
    });

    test('instance replacements cannot replace the original Task and Studio authority boundaries', async () => {
        const f = await fixture(make);
        try {
            f.agent.withTaskLock = () => { throw new Error('Instance Task boundary must not be trusted'); };
            f.studio.withProjectWrite = () => { throw new Error('Instance Studio boundary must not be trusted'); };
            await expect(f.consume()).resolves.toBe(f.task.intent);
        } finally { await f.cleanup(); }
    });

    test('the original persisted committing Task is refused without joining its held Task or Studio queue', async () => {
        const f = await fixture(make), entered = deferred(), release = deferred(); let committing;
        try {
            await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId, { summary: 'Original review before commit',
                steps: [{ id: 'step_metadata', title: 'Edit original Project metadata', impact: 'low' }] });
            const next = structuredClone(f.original); next.project.displayName = 'Real committing Project'; next.project.updatedAt = 20;
            await f.agent.executeTool(f.h.handle, f.projectId, f.task.taskId, { name: 'atri_agent_project_save', args: { source: next, stepId: 'step_metadata' } });
            const review = await f.agent.prepareReview(f.h.handle, f.projectId, f.task.taskId, {});
            expect(review.status).toBe('review');
            const execute = f.studio.executeWorkspace.bind(f.studio);
            f.studio.executeWorkspace = async (...args) => { entered.resolve(); await release.promise; return execute(...args); };
            committing = f.agent.commit(f.h.handle, f.projectId, f.task.taskId).then(value => ({ value }), error => ({ error }));
            await entered.promise;
            const actual = await f.agent.observeComputeSource(f.h.handle, f.projectId, f.task.taskId);
            expect(actual.task.status).toBe('committing');
            const sourceRequest = { ...f.root.sourceBinding.sourceRequest, executionFingerprint: actual.task.executionFingerprint };
            await expect(f.h.engine.withTransaction(f.h.handle, tx => f.source.capture(f.h.handle, sourceRequest, { tx })))
                .rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            release.resolve(); expect((await committing).value?.status).toBe('completed');
        } finally { release.resolve(); if (committing) await committing; await f.cleanup(); }
    });

    test.each(['Task', 'Project'])('%s writer commits before consumption and the original source reader refuses stale input', async domain => {
        const f = await fixture(make);
        const trigger = deferred(), events = [];
        // Registration is outside Run/Runtime/Task/Studio locks and Engine ALS.
        const writer = trigger.promise.then(async () => { await f.write(domain); events.push('writer_committed'); });
        try {
            trigger.resolve(); await writer;
            await expect(f.consume()).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            expect(events).toEqual(['writer_committed']);
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).compute).toBeUndefined();
        } finally { await f.cleanup(); }
    });

    test.each(['Task', 'Project'])('consumption decides before an independent %s writer acquires its original authority', async domain => {
        const f = await fixture(make), entered = deferred(), release = deferred(), events = [];
        const writer = entered.promise.then(async () => {
            const acquired = f.lock(domain, () => { events.push('writer_acquired'); });
            // A disjoint original command lock lets the real domain queue run;
            // it does not implement a replacement Project/Task mutex.
            await withNativeResourceWrites(f.h.handle, [command()], () => release.resolve());
            await acquired; await f.write(domain); events.push('writer_committed');
        });
        try {
            const result = await f.consume(async scope => {
                entered.resolve(); await release.promise;
                const value = await f.read(scope); events.push('consume_decided'); return value;
            });
            await writer;
            expect(result).toBe(f.task.intent);
            expect(events).toEqual(['consume_decided', 'writer_acquired', 'writer_committed']);
        } finally { release.resolve(); await f.cleanup(); }
    });

    test('the original Runtime queue precedes Task and Studio source consumption', async () => {
        const f = await fixture(make), entered = deferred(), release = deferred(), events = [];
        const held = withRuntimeWrite(f.h.handle, async () => { events.push('runtime_held'); entered.resolve(); await release.promise; });
        let consuming;
        try {
            await entered.promise;
            // Invoking the domain boundary queues its Task lock synchronously
            // if Runtime is wrongly skipped. The following real Task probe is
            // therefore an ordered barrier, not an arbitrary microtask delay.
            consuming = f.boundary()(() => f.h.engine.withTransaction(f.h.handle, async tx => {
                const value = await f.read({ tx, root: f.root }); events.push('consume_decided'); return value;
            })).then(value => ({ value }), error => ({ error }));
            await f.lock('Task', () => { events.push('task_available_while_runtime_held'); });
            await f.lock('Project', () => { events.push('studio_available_while_runtime_held'); });
            events.push('runtime_released'); release.resolve(); await held;
            expect(await consuming).toEqual({ value: f.task.intent });
            expect(events).toEqual(['runtime_held', 'task_available_while_runtime_held', 'studio_available_while_runtime_held', 'runtime_released', 'consume_decided']);
        } finally { release.resolve(); await held; await consuming; await f.cleanup(); }
    });

    test('a foreign original Engine cannot substitute for this Task source authority', async () => {
        const f = await fixture(make), other = await make();
        try { expect(() => f.source.consumptionBoundary(f.h.handle, f.root.sourceBinding, { engine: other.engine })).toThrow('native_orchestration_consumption_authority_unavailable'); }
        finally { await other.engine.close(); await other.cleanup(); await f.cleanup(); }
    });

    test.each(['other-agent', 'other-repository', 'joint-fake-repository', 'non-original-agent', 'different-task', 'different-operation'])('%s cannot substitute a source authority or frozen bank identity', async problem => {
        const f = await fixture(make);
        try {
            let source = f.source, binding = structuredClone(f.root.sourceBinding), callbacks = 0;
            if (problem === 'other-agent') source = new SourcePort({ projectAgent: f.agent,
                budgetPort: new BudgetPort({ projectAgent: services(f.h).agent, projectRepository: f.repository }) });
            if (problem === 'other-repository') source = new SourcePort({ projectAgent: f.agent,
                budgetPort: new BudgetPort({ projectAgent: f.agent, projectRepository: new ProjectTaskRepository({ engine: f.h.engine }) }) });
            if (problem === 'joint-fake-repository') { f.agent._repository = { engine: f.h.engine }; f.budget.projectRepository = f.agent._repository; }
            if (problem === 'non-original-agent') source = new SourcePort({ projectAgent: { ...f.agent }, budgetPort: f.budget });
            if (problem === 'different-task') binding.sourceRequest.taskId = 'task_another';
            if (problem === 'different-operation') binding.budgetAuthorityRef.operationId = 'f'.repeat(64);
            if (problem.startsWith('different-')) {
                const { bindingDigest: _digest, ...content } = binding;
                binding.bindingDigest = hash(content);
            }
            const attempted = async () => source.consumptionBoundary(f.h.handle, binding, { engine: f.h.engine })(() => { callbacks++; return 'Untrusted callback executed'; });
            await expect(attempted()).rejects.toMatchObject({ code: 'native_orchestration_consumption_authority_unavailable' });
            expect(callbacks).toBe(0);
        } finally { await f.cleanup(); }
    });
});
