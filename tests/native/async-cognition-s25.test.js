import { jest, describe, beforeEach, afterEach, test, expect } from '@jest/globals';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { FsEngine } from '../../src/storage/engines/fs-engine.js';
import { SqliteEngine } from '../../src/storage/engines/sqlite-engine.js';
import { services } from './helpers/session-fixture.js';
import { authorityCandidateFixture } from './helpers/authority-candidate-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { closed } from './helpers/authority-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeModelPromptPersistence, VersionedJsonResourceHandler } from '../../src/native/model-prompt-runtime/persistence.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { nativeTaskScheduler } from '../../src/native/task-scheduler.js';

for (const [kind, make, Engine] of [['fs', makeTempFsEngineHarness, FsEngine], ['sqlite', makeTempSqliteEngineHarness, SqliteEngine]]) {
    describe('S25 ordinary authored background Task - ' + kind, () => {
        let h, svc, base, seeded, host, extraEngine, fetchImpl, respond, requests, serial;
        const input = () => ({ sessionId: base.session.sessionId, revisionId: base.revision.revisionId,
            slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } });
        const pending = () => base.states.atri_lifecycle.outbox.find(row => row.status === 'pending');
        const control = () => svc.core.runs.status(h.handle, base.session.sessionId);
        const op = bank => Object.values(bank?.operations ?? {}).find(row => row.lane === 'background');
        async function command(action) {
            base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 's25-' + ++serial, action },
                { expectedRevisionId: base.revision.revisionId });
        }
        const progress = effectiveTurns => command({ kind: 'app.command', domainId: 'progress', commandId: 'advance', recordId: 'main', args: { effectiveTurns } });
        const response = () => ({ choices: [{ message: { content: JSON.stringify({ text: 'Bounded slow advice' }) } }],
            usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } });
        function makeHost() {
            return new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller,
                providers: { 'provider.openai-compatible': createHttpGenerationProvider({ fetchImpl }) }, secretPort: { resolveSecret: async () => 'synthetic-secret' } });
        }
        function restart() {
            h.engine.close?.();
            extraEngine = new Engine({ directoriesByHandle: handle => { if (handle !== h.handle) throw new Error('Unexpected owner'); return h.dirs; } });
            svc = services(h, extraEngine);
            seeded = { ...seeded, persistence: new NativeModelPromptPersistence({ engine: extraEngine }), library: new VersionedJsonResourceHandler({ engine: extraEngine }) };
            host = makeHost();
        }
        beforeEach(async () => {
            h = await make(); svc = services(h); requests = []; serial = 0; extraEngine = null;
            const authority = authorityCandidateFixture(({ logic }) => {
                logic.derivedPublications = [];
                logic.transactions[0].derivedPublications = [];
                logic.transactions[0].effects = logic.transactions[0].effects.filter(effect => !['clock.advance', 'workflow.transition'].includes(effect.kind));
            });
            const fixture = { manifest: authority.base.manifest, entryPointId: authority.base.session.entryPointId }, { taskRuntime } = lifecycleFixture();
            const lifecycleRuntime = authority.contract.lifecycleRuntime;
            const task = taskRuntime.tasks[0], variant = task.variants[0];
            task.inputSchema = closed({ known: { type: 'string', maxLength: 128 } });
            task.resultPolicy = { resultClass: 'advisory', sink: 'proposal' };
            const action = { kind: 'task', taskId: task.id, variantId: variant.id, input: { known: 'Authorized source' } };
            lifecycleRuntime.automations = [{ id: 'on-ready', scopeId: 'session', trigger: { kind: 'experience.ready' }, maxCatchUp: 1, action }];
            lifecycleRuntime.workflows = [{ id: 'second', scopeId: 'session', initial: 'start',
                nodes: [{ id: 'start', kind: 'user_gate' }, { id: 'slow', kind: 'model_task', action }, { id: 'done', kind: 'terminal' }],
                transitions: [{ id: 'begin', from: 'start', to: 'slow' }, { id: 'done', from: 'slow', to: 'done' }] }];
            const apply = structuredClone(task);
            apply.id = 'apply'; apply.resultPolicy = { resultClass: 'declared_app_command', sink: 'app_command' };
            apply.variants[0].resultBinding = { kind: 'app.command', domainId: 'notes', commandId: 'save', recordId: 'main' };
            taskRuntime.tasks.push(apply);
            const applyWorkflow = structuredClone(lifecycleRuntime.workflows[0]); applyWorkflow.id = 'apply';
            applyWorkflow.nodes.find(node => node.id === 'slow').action.taskId = 'apply'; lifecycleRuntime.workflows.push(applyWorkflow);
            const counter = closed({ effectiveTurns: { type: 'integer', minimum: 0, maximum: 1000000 } });
            lifecycleRuntime.domains.push({ ...structuredClone(lifecycleRuntime.domains[0]), id: 'progress', recordSchema: counter, initial: { effectiveTurns: 0 },
                commands: [{ id: 'advance', argsSchema: counter, event: 'progress.changed', assign: { effectiveTurns: { formula: 'args.effectiveTurns' } } }] });
            fixture.manifest.runtime = { game: { logic: 'logic.json' }, experienceContract: { ...authority.contract, capabilities: [...authority.contract.capabilities, { id: 'generation-budget', version: 1, required: true }],
                taskRuntime, lifecycleRuntime, generationBudget: { schemaVersion: 1, resolverAttempts: 2, narratorAttempts: 2, turnAttempts: 4,
                    backgroundAttempts: 2, backgroundWindowTurns: 4, backgroundPeriodTurns: 20, backgroundPeriodAttempts: 2,
                    turnCounter: { domainId: 'progress', recordId: 'main', field: 'effectiveTurns' } } } };
            fixture.manifest.resources = [
                { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: 'r1', displayName: 'Slow task', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
                { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: 'r1', displayName: 'Slow task', output: { maxTokens: 128 } } },
            ].map(item => ({ ...item, origin: { scope: 'package', packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId } }));
            const { archive } = buildAtriaPackageContainer({ manifest: fixture.manifest, sourceFiles: authority.installed.sourceFiles, assetPayloads: new Map() });
            await svc.packageInstaller.install(h.handle, archive);
            base = await svc.core.create(h.handle, { packageId: fixture.manifest.packageId, packageVersionId: fixture.manifest.packageVersionId, entryPointId: fixture.entryPointId });
            await command({ kind: 'experience.ready' }); await progress(4);
            seeded = await seedGenerationProfiles({ ...h, endpoint: 'https://synthetic.invalid/unused' });
            await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
                allowedModelProfileIds: [seeded.model.modelProfileId], computeBudget: { maxRequests: 2, maxTokens: 32000,
                    localWork: { maxJobs: 32, maxItems: 32, maxInputBytes: 16777216 } } } });
            respond = async () => response();
            fetchImpl = jest.fn(async (_url, options) => { requests.push(JSON.parse(options.body)); return new Response(JSON.stringify(await respond(options)),
                { status: 200, headers: { 'content-type': 'application/json' } }); });
            host = makeHost();
        });
        afterEach(async () => { jest.restoreAllMocks(); extraEngine?.close?.(); await h.cleanup(); });

        test('durable pending resumes with explicit binding, publishes once and uses the original background bank', async () => {
            const before = base, invocationId = pending().invocationId; restart();
            await expect(host.executeLifecycle(h.handle, { ...input(), slotBindings: {} })).rejects.toMatchObject({ code: 'native_task_binding_missing' });
            expect(requests).toEqual([]);
            const result = await host.executeLifecycle(h.handle, input()); base = result.snapshot;
            expect(result.results).toHaveLength(1); expect(result.results[0].payload).toEqual({ text: 'Bounded slow advice' });
            expect(base.states.atri_lifecycle.outbox.find(row => row.invocationId === invocationId).status).toBe('completed');
            expect(base.timeline).toEqual(before.timeline);
            expect(requests).toHaveLength(1);
            expect((await control()).retiredCompute).toMatchObject({ modelAttempts: 1, knownTotalTokens: 30, localJobs: 5 });
            expect((await host.executeLifecycle(h.handle, input())).results).toEqual([]); expect(requests).toHaveLength(1);
        });

        test('exact intent rejects forged input and scope/version mismatch without sending', async () => {
            const intent = pending(), raw = { ...input(), invocationId: intent.invocationId, taskId: intent.taskId, variantId: intent.variantId, input: { known: 'forged' } };
            await expect(host.executeTask(h.handle, raw, undefined, undefined, { lifecycleInvocation: true })).rejects.toMatchObject({ code: 'native_generation_budget_lane_denied' });
            await expect(host.executeTask(h.handle, { ...raw, input: intent.input, variantId: 'missing' }, undefined, undefined, { lifecycleInvocation: true })).rejects.toMatchObject({ code: 'native_task_variant_missing' });
            await expect(host.executeTask(h.handle, { ...raw, input: intent.input })).rejects.toMatchObject({ code: 'native_task_reserved_invocation' });
            await command({ kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
            expect((await host.executeLifecycle(h.handle, input())).results).toEqual([]); expect(requests).toEqual([]);
        });

        test.each(['charged', 'unknown'])('%s attempt survives actual restart and automatic pump never reissues it', async status => {
            const intent = pending(), route = await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
            const attempt = { attemptId: 's25-crash-' + status, requestId: intent.invocationId, targetFingerprint: 'a'.repeat(64), estimatedTokens: 100 };
            const receipt = await svc.core.runs.charge(h.handle, base, { background: true, anchor: { invocationId: intent.invocationId }, role: 'narrator',
                compute: { limits: route.executionPolicy.computeBudget, attempt } }, base.manifest.runtime.experienceContract.generationBudget);
            if (status === 'unknown') await svc.core.runs.settleCompute(h.handle, base.session.sessionId, receipt.operation, attempt.attemptId, null);
            const before = await control(); restart();
            const result = await host.executeLifecycle(h.handle, input());
            expect(result.pending).toEqual({ invocationId: intent.invocationId, reason: 'native_task_outcome_unknown' });
            expect(requests).toEqual([]); expect(await control()).toEqual(before);
            expect((await svc.core.load(h.handle, base.session.sessionId)).states.atri_lifecycle.outbox).toEqual(base.states.atri_lifecycle.outbox);
        });

        test('budget not-due and window conflicts stay bounded without hidden defaults', async () => {
            await progress(0);
            expect((await host.executeLifecycle(h.handle, input())).pending.reason).toBe('native_generation_background_not_due'); expect(requests).toEqual([]);
            await progress(4); base = (await host.executeLifecycle(h.handle, input())).snapshot; expect(requests).toHaveLength(1);
            await command({ kind: 'workflow.transition', workflowId: 'second', transitionId: 'begin' });
            expect((await host.executeLifecycle(h.handle, input())).pending.reason).toBe('native_generation_budget_exhausted'); expect(requests).toHaveLength(1);
        });

        test('tight local quota denies preparation before send and preserves the admitted work', async () => {
            const route = await seeded.persistence.getRuntimeRoute(h.handle, seeded.routes[0].runtimeRouteId);
            await seeded.persistence.saveRuntimeRoute(h.handle, { ...route, executionPolicy: { ...route.executionPolicy,
                computeBudget: { ...route.executionPolicy.computeBudget, localWork: { maxJobs: 2, maxItems: 2, maxInputBytes: 16777216 } } } });
            const result = await host.executeLifecycle(h.handle, input());
            expect(result.pending.reason).toBe('native_generation_budget_exhausted'); expect(requests).toEqual([]);
            const bank = op(await control()); expect(bank.total).toBe(0); expect(bank.compute.localWork).toHaveLength(2);
            expect(bank.compute.attempts).toEqual([]);
        });

        test('an ordinary app-bound slow Task still adopts only through the original declared writer', async () => {
            base = (await host.executeLifecycle(h.handle, input())).snapshot;
            await progress(8); await command({ kind: 'workflow.transition', workflowId: 'apply', transitionId: 'begin' });
            base = (await host.executeLifecycle(h.handle, input())).snapshot;
            expect(base.states.atri_lifecycle.domains.notes.records.find(row => row.id === 'main').value.text).toBe('Bounded slow advice');
            expect(base.states.atri_task_results.records).toHaveLength(2); expect(requests).toHaveLength(2);
            expect((await control()).retiredCompute).toMatchObject({ modelAttempts: 2, knownTotalTokens: 60 });
        });

        test('a failed send is not automatically retried by the ordinary scheduler or a later pump', async () => {
            respond = async () => { throw new Error('synthetic send failure'); };
            await expect(host.executeLifecycle(h.handle, input())).rejects.toThrow(); expect(requests).toHaveLength(1);
            expect(op(await control()).compute.attempts[0].status).toBe('unknown');
            expect((await makeHost().executeLifecycle(h.handle, input())).pending.reason).toBe('native_task_outcome_unknown'); expect(requests).toHaveLength(1);
        });

        test('new foreground revision refuses stale slow delivery and does not turn known costs into a free retry', async () => {
            respond = async () => { await command({ kind: 'clock.advance', commandId: 'advance', ticks: 1 }); return response(); };
            await expect(host.executeLifecycle(h.handle, input())).rejects.toThrow();
            expect(requests).toHaveLength(1);
            expect((await svc.core.load(h.handle, base.session.sessionId)).states.atri_task_results).toBeUndefined();
            expect(op(await control()).compute.attempts[0]).toMatchObject({ status: 'settled', usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 } });
            expect((await makeHost().executeLifecycle(h.handle, input())).pending.reason).toBe('native_task_outcome_unknown'); expect(requests).toHaveLength(1);
        });

        test('two Hosts racing the same pending intent share one original scheduler request', async () => {
            const outcomes = await Promise.all([host, makeHost()].map(runtime => runtime.executeLifecycle(h.handle, input())));
            expect(requests).toHaveLength(1);
            expect(outcomes.filter(result => result.results.length)).not.toHaveLength(0);
            expect((await svc.core.load(h.handle, base.session.sessionId)).states.atri_task_results.records).toHaveLength(1);
        });

        test('cancelled slow worker retains permits and original charges until settlement; pump does not resend', async () => {
            const controller = new AbortController(); let entered, release, releaseWorker;
            const started = new Promise(resolve => { entered = resolve; });
            const workerSettlement = new Promise(resolve => { releaseWorker = resolve; });
            const execute = host.execute.bind(host);
            host.execute = async (...args) => { try { return await execute(...args); } finally { await workerSettlement; } };
            respond = async () => { entered(); await new Promise(resolve => { release = resolve; }); return response(); };
            const execution = host.executeLifecycle(h.handle, input(), controller.signal); await started;
            controller.abort(); await expect(execution).rejects.toMatchObject({ code: 'operation_cancelled' });
            expect(nativeTaskScheduler.hasSessionWork(h.handle, base.session.sessionId)).toBe(true);
            expect((await makeHost().executeLifecycle(h.handle, input())).pending.reason).toBe('native_task_outcome_unknown'); expect(requests).toHaveLength(1);
            release(); releaseWorker();
            for (let count = 0; count < 100 && nativeTaskScheduler.hasSessionWork(h.handle, base.session.sessionId); count++) await new Promise(resolve => setTimeout(resolve, 10));
            expect(nativeTaskScheduler.hasSessionWork(h.handle, base.session.sessionId)).toBe(false);
            expect(op(await control()).compute.attempts).toHaveLength(1);
            expect((await svc.core.load(h.handle, base.session.sessionId)).states.atri_task_results).toBeUndefined();
        });
    });
}
