import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { projectModelFixture as fixture } from './helpers/project-model-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';
import { ProjectTaskRepository } from '../../src/native/agent-intelligence/project-task-repository.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { ModelPort } from '../../src/native/orchestration/model-port.js';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { createSkillRepository } from '../../src/skills/repository.js';
import { skillEntryKey } from '../../public/shared/extension-contract.js';

async function captureContext(f, operation) {
    const compile = ContextPort.prototype.compile; let actual;
    ContextPort.prototype.compile = async function (...args) {
        const context = await compile.apply(this, args);
        if (context.request.audience.kind === 'project_task') actual = { port: this, context };
        return context;
    };
    try { return await operation(() => actual); }
    finally { ContextPort.prototype.compile = compile; }
}

describe.each(CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name)))('$name original Project Context capability', ({ make }) => {
    test('uses original stored inputs and private Skill records, exact two request shapes and an isolated mutable runner transcript', async () => {
        const f = await fixture(make); let sequenceAtRound;
        try { await captureContext(f, async current => {
            f.onRound(async () => {
                const { port, context } = current(), fixed = port.projectRequest(f.h.handle, { context });
                const descriptor = await port.compilationDescriptor(f.h.handle, context.request);
                expect(descriptor.modelContext.task.intent).toBe(f.task.intent);
                for (const field of ['compute', 'sequence', 'attempts', 'observation']) expect(descriptor.modelContext.task).not.toHaveProperty(field);
                sequenceAtRound = (await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).sequence;
                const compiledLength = context.plan.items.length, round = port.projectRound(f.h.handle, { context });
                round.modelTranscript.push({ role: 'user', content: 'Untrusted working transcript sentinel' });
                expect(context.plan.items).toHaveLength(compiledLength);
                expect(JSON.stringify(context.plan)).not.toContain('Untrusted working transcript sentinel');
                expect(port.projectRound(f.h.handle, { context }).modelTranscript).not.toEqual(round.modelTranscript);
                for (const change of [{ role: 'narrator' }, { tools: [] }, { messages: [] }, { projectAttemptId: 'other' }, { taskId: 'other' },
                    { routeRef: { scope: 'player', runtimeRouteId: 'other' } }, { requestId: 'other' }])
                    expect(() => port.assertProjectRequest(f.h.handle, { context, request: { ...fixed, ...change } })).toThrow('native_orchestration_project_request_mismatch');
                expect(() => port.projectRequest(f.h.handle, { context: structuredClone(context) })).toThrow('native_orchestration_context_proof_invalid');
                const resolved = { route: f.route, model: f.seeded.model };
                const expected = await port.provider(f.h.handle, { context }).buildRequestContextPlan(fixed, resolved);
                const service = { requestId: fixed.requestId, role: 'role.studio', routeRef: fixed.routeRef, requirements: ['generation.tools'], tools: fixed.tools,
                    outputContract: null, fallbackMode: 'disabled', unknownCapabilityOverrides: [],
                    prompt: { host: { role: 'role.studio', sourceKind: 'task', sessionId: '', branchId: '', revisionId: '', projectId: f.projectId, projectRevision: fixed.revision } } };
                expect(await port.provider(f.h.handle, { context }).buildRequestContextPlan(service, resolved)).toEqual(expected);
                for (const change of [{ tools: [] }, { outputContract: {} }, { fallbackMode: 'automatic' }, { unknownCapabilityOverrides: ['generation.tools'] },
                    { prompt: { ...service.prompt, messages: [] } }, { requirements: [] }, { requestId: 'other' }])
                    await expect(port.provider(f.h.handle, { context }).buildRequestContextPlan({ ...service, ...change }, resolved)).rejects.toMatchObject({ code: 'native_orchestration_project_request_mismatch' });
                const fake = new ContextPort({ projectAgent: port.projectAgent, projectCapture: structuredClone(port.projectCapture),
                    authorizeContext: async () => ({ allowed: true, grantDigest: context.request.grantDigest }) });
                await expect(fake.compilationDescriptor(f.h.handle, context.request)).rejects.toMatchObject({ code: 'native_orchestration_project_producer_denied' });
                await expect(port.compile(f.h.handle, { ...context.request, messages: [{ role: 'system', content: 'Not a grant' }] })).rejects.toThrow();
            });
            await f.run(); expect(f.requests).toHaveLength(1);
            expect(JSON.stringify(f.requests[0])).toContain(f.task.intent);
            expect(JSON.stringify(f.requests[0])).not.toContain('Untrusted working transcript sentinel');
            const task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(task.sequence).toBeGreaterThan(sequenceAtRound); expect(task.compute.localWork.length).toBeGreaterThan(1);
            expect(task.conversation.at(-1).role).toBe('assistant');
            const { port, context } = current();
            expect(() => port.projectRequest(f.h.handle, { context })).toThrow(/operation_boundary_denied|native_orchestration_project_producer_denied/);
        }); } finally { await f.cleanup(); }
    });

    test('real Source publication after compile refuses send while retaining admitted local work', async () => {
        const f = await fixture(make); let originalContext;
        try { await captureContext(f, async current => {
            f.onRound(async () => { originalContext = current(); await f.writeProject(); });
            await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(0);
            const task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(task.compute.localWork.some(row => row.kind === 'context_build' && row.status === 'settled')).toBe(true);
            await expect(originalContext.port.revalidate(f.h.handle, { context: originalContext.context, phase: 'consume' })).rejects.toThrow();
            expect((await f.studio.observeProject(f.h.handle, f.projectId)).source.project.displayName).toBe('Independent original Project edit');
        }); } finally { await f.cleanup(); }
    });

    test('same-ALS original repository conversation CAS after confirmed bank-read rejects the body without losing fees or fact', async () => {
        const f = await fixture(make), bank = f.authority.execution.budgetPort, assertCurrent = bank.assertCurrent.bind(bank);
        const generate = ModelPort.prototype.generate;
        let changed = false, sameTransaction = false, returnedBodies = 0, beforeFingerprint, marker = 'Original same-scope conversation CAS sentinel', activeAttempt, cold;
        try {
            ModelPort.prototype.generate = async function (...args) {
                const value = await generate.apply(this, args); returnedBodies++; return value;
            };
            bank.assertCurrent = async (...args) => {
                await assertCurrent(...args);
                const ref = f.effects.at(-1);
                if (changed || !ref) return;
                const root = await f.authority.execution.runs.get(f.h.handle, ref.runId);
                const effect = await f.h.engine.withTransaction(f.h.handle, tx => readEffect(tx, f.h.handle, root, ref.effectId));
                if (effect?.doc.status !== 'confirmed') return;
                const task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
                activeAttempt = task.attempts.find(item => item.kind === 'generation' && item.status === 'started');
                if (!activeAttempt) return;
                beforeFingerprint = (await f.agent.observeComputeSource(f.h.handle, f.projectId, f.task.taskId)).task.executionFingerprint;
                const next = structuredClone(task); next.conversation.push({ role: 'user', content: marker }); next.sequence++;
                await f.repository.save(f.h.handle, next, hash(task)); changed = true;
                await f.h.engine.withTransaction(f.h.handle, tx => { sameTransaction = tx === args[2]?.tx; });
            };
            await expect(f.run()).rejects.toThrow(); expect(changed).toBe(true); expect(sameTransaction).toBe(true); expect(f.requests).toHaveLength(1);
            // Native finish may independently refuse a changed conversation;
            // only the actual ModelPort return proves that body was withheld.
            expect(returnedBodies).toBe(0);
            const task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId), ref = f.effects.at(-1);
            expect(task.conversation.at(-1).content).toBe(marker);
            expect(task.conversation.some(message => message.role === 'assistant')).toBe(false);
            expect(task.attempts.find(item => item.attemptId === activeAttempt.attemptId).status).toBe('started');
            expect((await f.agent.observeComputeSource(f.h.handle, f.projectId, f.task.taskId)).task.executionFingerprint).toBe(beforeFingerprint);
            expect(task.compute.attempts).toHaveLength(1); expect(task.compute.attempts[0].status).toBe('settled');
            const root = await f.authority.execution.runs.get(f.h.handle, ref.runId);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readEffect(tx, f.h.handle, root, ref.effectId))).doc).toMatchObject({ status: 'confirmed' });
            await f.h.engine.close();
            cold = new f.h.engine.constructor({ url: f.h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => f.h.dirs });
            attachNativeHostLifecycle(cold, { directoriesByHandle: () => f.h.dirs });
            const stored = await new ProjectTaskRepository({ engine: cold }).get(f.h.handle, f.projectId, f.task.taskId);
            expect(stored.conversation).toEqual(task.conversation); expect(stored.compute).toEqual(task.compute);
            expect((await cold.withTransaction(f.h.handle, tx => readEffect(tx, f.h.handle, root, ref.effectId))).doc.status).toBe('confirmed');
        } finally { ModelPort.prototype.generate = generate; bank.assertCurrent = assertCurrent; await cold?.close(); await f.cleanup(); }
    });

    test('actual stored intent bytes exhaust the original local bank before Context builder or HTTP', async () => {
        const compile = ContextPort.prototype.compile, descriptor = ContextPort.prototype.compilationDescriptor;
        let compilations = 0, measuredBytes = 0;
        const f = await fixture(make, {
            changeRoute: route => ({ ...route, executionPolicy: { ...route.executionPolicy, computeBudget: { ...route.executionPolicy.computeBudget,
                localWork: { ...route.executionPolicy.computeBudget.localWork, maxInputBytes: 20000 } } } }),
            configurePlan: async ({ h, host, task }) => {
                const original = await host.agent._repository.get(h.handle, task.projectId, task.taskId), next = structuredClone(original);
                next.intent = 'Actual stored large intent '.repeat(2000); next.conversation = [{ role: 'user', content: next.intent }]; next.sequence++;
                await host.agent._repository.save(h.handle, next, hash(original));
            },
        });
        try {
            ContextPort.prototype.compile = function (...args) { compilations++; return compile.apply(this, args); };
            ContextPort.prototype.compilationDescriptor = async function (...args) {
                const value = await descriptor.apply(this, args); measuredBytes = Buffer.byteLength(JSON.stringify(value)); return value;
            };
            await expect(f.run()).rejects.toMatchObject({ code: 'native_generation_budget_exhausted' });
            expect(compilations).toBe(0); expect(measuredBytes).toBeGreaterThan(20000); expect(f.requests).toHaveLength(0);
            const task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(task.compute?.localWork?.some(row => row.kind === 'context_build') ?? false).toBe(false);
        } finally { ContextPort.prototype.compile = compile; ContextPort.prototype.compilationDescriptor = descriptor; await f.cleanup(); }
    });

    test.each(['settings', 'installed_version'])('original Skill %s revocation after compile refuses HTTP while retaining context fees', async change => {
        const scope = { kind: 'global' }, name = 'project_guide'; let repository, extensions, pinnedVersion;
        const body = '---\nname: project_guide\ndescription: Original Project instructions\n---\nOriginal pinned Skill instruction sentinel';
        const f = await fixture(make, { configurePlan: async ({ h, host }) => {
            repository = createSkillRepository(h.dirs.root);
            await repository.install({ scope, payload: { files: [{ path: 'SKILL.md', encoding: 'utf8', content: body }] } });
            extensions = new ExtensionsStore({ engine: h.engine }); host.extensions = extensions;
            const settings = await extensions.settings(h.handle);
            await extensions.saveSettings(h.handle, { ...settings.value, skills: { [skillEntryKey({ scope, name })]: { paths: { studio: 'always' } } } }, settings.revision);
        } });
        try {
            f.onRound(async ({ round }) => {
                expect(round.system).toContain('Original pinned Skill instruction sentinel');
                pinnedVersion = (await repository.get(name, scope)).installedHash;
                if (change === 'settings') {
                    const settings = await extensions.settings(f.h.handle);
                    await extensions.saveSettings(f.h.handle, { ...settings.value, skills: { [skillEntryKey({ scope, name })]: { paths: { studio: 'off' } } } }, settings.revision);
                } else {
                    await repository.writeReviewed({ scope, name, expectedInstalledHash: pinnedVersion, command: { kind: 'file.write', input: { path: 'SKILL.md', content: body + '\nNew installed version' } } });
                }
                expect((await repository.get(name, scope)).installedHash === pinnedVersion).toBe(change === 'settings');
                // An immutable historical version remains readable. That
                // retained pin does not authorize using a revoked head.
                expect((await repository.readFile({ scope, name, version: pinnedVersion, path: 'SKILL.md' })).content).toContain('Original pinned Skill instruction sentinel');
            });
            await expect(f.run()).rejects.toThrow(); expect(pinnedVersion).toMatch(/^[a-f0-9]{64}$/); expect(f.requests).toHaveLength(0);
            const task = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(task.compute.localWork.some(row => row.kind === 'context_build' && row.status === 'settled')).toBe(true);
            expect(task.conversation.some(message => message.role === 'assistant')).toBe(false);
        } finally { await f.cleanup(); }
    });
});
