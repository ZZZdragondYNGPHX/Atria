import { jest } from '@jest/globals';
import { projectModelFixture as fixture, PROJECT_MODEL_TEXT } from './helpers/project-model-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const observedTask = f => f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
const hasAssistant = task => task.conversation.some(message => message.role === 'assistant' && message.content?.includes(PROJECT_MODEL_TEXT));
const sql = process.env.ATRIA_TEST_PROJECT_MODEL_SQL === '1';
const harnesses = CONTRACT_HARNESSES.filter(({ name }) => sql || ['FsEngine', 'SqliteEngine'].includes(name));
if (sql) jest.setTimeout(60000);

describe.each(harnesses)('$name original bound Project model producer', ({ make }) => {
    test('the original interactive Executor consumes one real scoped Model response and retains original Task costs without formal Project commit', async () => {
        const f = await fixture(make);
        try {
            const view = await f.preflight(); expect(view.orchestration).toBeDefined();
            const operation = await f.start(view), result = await f.finish(operation), task = await observedTask(f);
            expect(result.task.taskId).toBe(f.task.taskId); expect(hasAssistant(task)).toBe(true);
            expect(f.requests).toHaveLength(1); expect(f.effects).toHaveLength(1);
            expect(f.requests[0].tools ?? []).toEqual([]);
            expect(task.compute.attempts).toHaveLength(1);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 }, orchestration: { kind: 'provider_send', effectId: f.effects[0].effectId, ordinal: 0 } });
            expect(task.attempts.filter(item => item.kind === 'generation')).toEqual([expect.objectContaining({ status: 'completed' })]);
            expect((await f.studio.observeRevision(f.h.handle, f.projectId)).revision).toBe(f.task.baseRevision);
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.sourceBinding.sourceAuthority).toBe('project');
            expect(root.budgetAuthorityRef).toMatchObject({ authority: 'project_task', projectId: f.projectId, taskId: f.task.taskId });
            await f.h.engine.withTransaction(f.h.handle, async tx => {
                expect((await readEffect(tx, f.h.handle, root, f.effects[0].effectId)).doc.status).toBe('confirmed');
            });
            // This is the original temporary Task result, not a P4 OutputClaim
            // or a Studio Commit/Review approval.
            expect(task.changeSets).toEqual([]); expect(root.status).not.toBe('completed');
        } finally { await f.cleanup(); }
    });

    test('an exact original Project Prompt binding renders its real library program while the Plan pin retains the raw RuntimeRoute', async () => {
        const sentinel = 'Synthetic exact Project prompt binding sentinel'; let effectivePrompt;
        const f = await fixture(make, { configurePlan: async ({ plan, seeded, task, h, route }) => {
            const module = { ...seeded.module, revision: 'project-binding-module', body: sentinel };
            await seeded.library.commit(h.handle, 'core.prompt-module', module);
            const program = { ...seeded.prompt, revision: 'project-binding-program', stages: [{ stageId: 'stage.main', moduleRefs: [{
                resourceType: 'core.prompt-module', scope: 'library', resourceId: module.promptModuleId, revision: module.revision }] }] };
            await seeded.library.commit(h.handle, 'core.prompt-program', program);
            effectivePrompt = { resourceType: 'core.prompt-program', scope: 'library', resourceId: program.promptProgramId, revision: program.revision };
            await seeded.persistence.saveRuntimeRoute(h.handle, { ...route,
                projectPromptBindings: [{ projectId: task.projectId, promptProgramRef: effectivePrompt, candidateId: 'synthetic-original-project-binding' }] });
            plan.dependencyPins[0].integrity = hash(await seeded.persistence.getRuntimeRoute(h.handle, route.runtimeRouteId));
        } });
        try {
            await f.run(); expect(f.requests).toHaveLength(1);
            expect(JSON.stringify(f.requests[0])).toContain(sentinel); expect(JSON.stringify(f.requests[0])).toContain(f.task.intent);
            const rawRoute = await f.persistence.getRuntimeRoute(f.h.handle, f.route.runtimeRouteId);
            expect(f.plan.dependencyPins[0].integrity).toBe(hash(rawRoute));
            expect(f.plan.dependencyPins[0].integrity).not.toBe(hash({ ...rawRoute, promptProgramRef: effectivePrompt }));
            const task = await observedTask(f); expect(hasAssistant(task)).toBe(true); expect(task.compute.attempts).toHaveLength(1);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            const ref = f.effects[0], root = await f.authority.execution.runs.get(f.h.handle, ref.runId);
            await f.h.engine.withTransaction(f.h.handle, async tx => { expect((await readEffect(tx, f.h.handle, root, ref.effectId)).doc.status).toBe('confirmed'); });
        } finally { await f.cleanup(); }
    });

    test.each(['configuration', 'project-edit', 'task-takeover', 'binding-version'])('%s changes after the real preflight are refused before Provider or Effect work', async change => {
        const f = await fixture(make);
        try {
            const view = await f.preflight();
            if (change === 'configuration') await f.persistence.saveConnectionProfile(f.h.handle, { ...f.seeded.connection, endpoint: 'http://127.0.0.1:1/configuration-changed' });
            if (change === 'project-edit') await f.writeProject();
            if (change === 'task-takeover') await f.agent.takeOver(f.h.handle, f.projectId, f.task.taskId);
            if (change === 'binding-version') await f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 });
            await expect(f.start(view)).rejects.toThrow();
            expect(f.requests).toEqual([]); expect(f.effects).toEqual([]);
            expect(hasAssistant(await observedTask(f))).toBe(false);
        } finally { await f.cleanup(); }
    });

    test('an original Task takeover while the real Provider is pending refuses body but preserves observed direct usage', async () => {
        const f = await fixture(make), entered = deferred(), release = deferred();
        f.onResponse(() => { entered.resolve(); return release.promise; });
        try {
            const operation = await f.start(), pending = f.finish(operation).then(value => ({ value }), error => ({ error }));
            await entered.promise; await f.agent.takeOver(f.h.handle, f.projectId, f.task.taskId); release.resolve();
            expect((await pending).error).toBeDefined();
            const task = await observedTask(f); expect(task.status).toBe('taken_over'); expect(hasAssistant(task)).toBe(false);
            expect(f.requests).toHaveLength(1); expect(task.compute.attempts).toHaveLength(1);
            expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { release.resolve(); await f.cleanup(); }
    });

    test('Binding replacement during actual Provider work withholds body while preserving direct usage', async () => {
        const f = await fixture(make);
        f.onResponse(() => f.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 }));
        try {
            await expect(f.run()).rejects.toThrow();
            const task = await observedTask(f); expect(hasAssistant(task)).toBe(false); expect(f.requests).toHaveLength(1);
            expect(task.compute.attempts).toHaveLength(1); expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
        } finally { await f.cleanup(); }
    });

    test.each(['messages', 'tools'])('altering the original working round %s cannot change the sealed model request', async field => {
        const f = await fixture(make);
        f.onRound(({ round }) => { round[field] = field === 'messages' ? [{ role: 'user', content: 'Untrusted replacement input' }]
            : [{ type: 'function', function: { name: 'untrusted_extra_tool', parameters: { type: 'object', properties: {} } } }]; });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_project_request_mismatch' });
            expect(f.requests).toEqual([]); expect(f.effects).toHaveLength(1);
            const task = await observedTask(f); expect(hasAssistant(task)).toBe(false); expect(task.compute.localWork.length).toBeGreaterThan(0);
            expect(task.compute.attempts).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('another real opaque preflight selection cannot replace the original operation selection', async () => {
        const f = await fixture(make);
        try {
            const view = await f.preflight(), other = f.executor.assertOriginalPreflight(await f.preflight()).selection;
            const prepare = f.authority.prepareProjectRound.bind(f.authority);
            f.authority.prepareProjectRound = args => prepare({ ...args, selection: other });
            await expect(f.run(view)).rejects.toMatchObject({ code: 'native_orchestration_project_producer_denied' });
            expect(f.requests).toEqual([]); expect(f.effects).toEqual([]); expect(hasAssistant(await observedTask(f))).toBe(false);
        } finally { await f.cleanup(); }
    });

    test('wrong Host and owner cannot burn the actual round token before its original consumer sends', async () => {
        const f = await fixture(make); let refused = 0;
        f.onRound(async ({ args, round }) => {
            const task = await observedTask(f), attemptId = task.attempts.findLast(item => item.kind === 'generation' && item.status === 'started').attemptId;
            const input = { host: args.host, handle: args.handle, roundToken: round.roundToken, role: 'studio', messages: round.messages, tools: round.tools,
                source: { projectId: f.projectId, taskId: f.task.taskId, revision: f.task.baseRevision, projectAttemptId: attemptId } };
            for (const changed of [{ host: Object.create(args.host) }, { handle: args.handle + '-wrong-owner' }]) {
                await expect(f.authority.executeProjectRound({ ...input, ...changed })).rejects.toMatchObject({ code: 'native_orchestration_project_producer_denied' });
                refused++;
            }
            expect(f.requests).toEqual([]);
        });
        try {
            await f.run(); expect(refused).toBe(2); expect(f.requests).toHaveLength(1);
            expect(hasAssistant(await observedTask(f))).toBe(true);
        } finally { await f.cleanup(); }
    });

    test('rebuilding the original Scheduler and Executor for the same request cannot dispatch the completed logical model operation again', async () => {
        const f = await fixture(make);
        try {
            await f.run(); const before = await observedTask(f);
            f.recreateExecutor();
            await expect(f.run()).rejects.toThrow();
            const after = await observedTask(f); expect(f.requests).toHaveLength(1);
            expect(after.compute).toEqual(before.compute);
            expect(hasAssistant(after)).toBe(true);
        } finally { await f.cleanup(); }
    });

    test('a failed Provider with unknown spending cannot charge any original local work again under the same request', async () => {
        const f = await fixture(make, { responseStatus: 503, responseBody: () => ({ error: { message: 'Synthetic unavailable without usage' } }) });
        try {
            await expect(f.run()).rejects.toThrow(); const before = await observedTask(f);
            expect(before.compute.attempts[0].status).toBe('unknown');
            f.recreateExecutor();
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_project_request_replayed' });
            const after = await observedTask(f); expect(f.requests).toHaveLength(1); expect(after.compute).toEqual(before.compute);
            expect(hasAssistant(after)).toBe(false);
        } finally { await f.cleanup(); }
    });

    test('original Scheduler cancellation while Provider response is pending withholds body and retains the admitted bank identity', async () => {
        const f = await fixture(make), entered = deferred(), release = deferred();
        f.onResponse(() => { entered.resolve(); return release.promise; });
        try {
            const operation = await f.start(), pending = f.finish(operation).then(value => ({ value }), error => ({ error }));
            await entered.promise; f.executor.cancel(f.h.handle, f.projectId, f.task.taskId, operation.operationId); release.resolve();
            expect((await pending).error).toBeDefined();
            const task = await observedTask(f); expect(hasAssistant(task)).toBe(false); expect(f.requests).toHaveLength(1);
            expect(task.compute.attempts).toHaveLength(1);
            expect(['charged', 'unknown', 'settled']).toContain(task.compute.attempts[0].status);
            expect(task.compute.attempts[0].orchestration).toMatchObject({ kind: 'provider_send', effectId: f.effects[0].effectId, ordinal: 0 });
        } finally { release.resolve(); await f.cleanup(); }
    });

    test('a real Provider failure does not publish an assistant body or silently resend', async () => {
        const f = await fixture(make, { responseStatus: 503, responseBody: () => ({ error: { message: 'Synthetic unavailable without usage' } }) });
        try {
            await expect(f.run()).rejects.toThrow();
            const task = await observedTask(f); expect(hasAssistant(task)).toBe(false); expect(f.requests).toHaveLength(1);
            expect(task.compute.attempts).toHaveLength(1); expect(task.compute.attempts[0].status).toBe('unknown');
            expect(task.changeSets).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('a Model function call cannot acquire original Task proposal or Skill write authority from generation.send', async () => {
        const f = await fixture(make, { responseBody: () => ({ id: 'synthetic-project-tool', status: 'completed', output: [{ type: 'function_call',
            id: 'synthetic-project-call', call_id: 'synthetic-project-call', name: 'atri_agent_set_plan',
            arguments: JSON.stringify({ summary: 'Must remain a model proposal', steps: [{ id: 'unauthorized', title: 'Must not execute' }] }) }],
        usage: { total_tokens: 20, input_tokens: 12, output_tokens: 8 } }) });
        try {
            await expect(f.run()).rejects.toMatchObject({ code: 'generation_response_invalid' });
            const task = await observedTask(f); expect(task.plan).toBeNull(); expect(task.operations).toEqual([]); expect(task.workspace).toBeNull();
            expect(hasAssistant(task)).toBe(false); expect(f.requests).toHaveLength(1);
            expect(task.compute.attempts).toHaveLength(1); expect(task.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            const ref = f.effects[0], root = await f.authority.execution.runs.get(f.h.handle, ref.runId);
            await f.h.engine.withTransaction(f.h.handle, async tx => { expect((await readEffect(tx, f.h.handle, root, ref.effectId)).doc.status).toBe('dispatching'); });
            expect(root.resultRefs).toEqual([]); expect(root.outputClaims).toEqual([]);
        } finally { await f.cleanup(); }
    });
});
