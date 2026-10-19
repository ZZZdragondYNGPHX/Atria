import { projectModelFixture } from './helpers/project-model-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { inspectNativeProjectGenerationIdentity, inspectNativeProjectGeneration, captureNativeProjectGeneration,
    readNativeProjectSkillInventory } from '../../src/native/orchestration/native-project-generation-authority.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

describe.each([['FsEngine', makeTempFsEngineHarness], ['SqliteEngine', makeTempSqliteEngineHarness]])('%s actual original Project generation proof', (_name, make) => {
    test('the real original begin/request survives its own Context fees and observation but expires with its original operation', async () => {
        const f = await projectModelFixture(make), prepare = f.authority.prepareProjectRound.bind(f.authority);
        let projectCapture, actualHost, before, after, sequenceBefore, sequenceAfter;
        try {
            f.authority.prepareProjectRound = async args => {
                projectCapture = args.projectCapture; actualHost = args.host;
                before = await inspectNativeProjectGeneration(projectCapture, { host: actualHost, handle: f.h.handle });
                sequenceBefore = (await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).sequence;
                const prepared = await prepare(args);
                after = await inspectNativeProjectGeneration(projectCapture, { projectAgent: actualHost.agent, studio: f.studio, handle: f.h.handle });
                sequenceAfter = (await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).sequence;
                expect(after.selection).toBe(args.selection);
                expect(after.sourceFingerprint).toBe(before.sourceFingerprint);
                expect(after.conversationDigest).toBe(before.conversationDigest);
                expect(sequenceAfter).toBeGreaterThan(sequenceBefore);
                expect(after.requestId).toBe('project:' + hash({ requestId: 'original-project-model', round: 0 }));
                expect(await readNativeProjectSkillInventory(projectCapture, { projectAgent: actualHost.agent, handle: f.h.handle })).toEqual([]);
                return prepared;
            };
            await f.run();
            expect(f.requests).toHaveLength(1);
            const stored = await f.repository.get(f.h.handle, f.projectId, f.task.taskId);
            expect(stored.attempts.find(attempt => attempt.attemptId === after.projectAttemptId)).toMatchObject({ requestId: after.requestId, status: 'completed', observation: { origin: 'host' } });
            expect(stored.compute.attempts[0]).toMatchObject({ status: 'settled', usage: { totalTokens: 20 } });
            expect(() => inspectNativeProjectGenerationIdentity(projectCapture, { host: actualHost, handle: f.h.handle })).toThrow();
        } finally { await f.cleanup(); }
    });

    test('JSON copies, another derived Host, another original service and serialized begin results cannot borrow an actual round', async () => {
        const f = await projectModelFixture(make), view = await f.preflight();
        let checked = false;
        try {
            expect(f.executor.assertOriginalPreflight(view).selection).toBeTruthy();
            for (const copy of [structuredClone(view), JSON.parse(JSON.stringify(view))])
                expect(() => f.executor.assertOriginalPreflight(copy)).toThrow('native_orchestration_project_producer_denied');
            f.onRound(async ({ args }) => {
                const cap = args.projectCapture, expected = { host: args.host, handle: f.h.handle };
                expect(inspectNativeProjectGenerationIdentity(cap, expected).host).toBe(args.host);
                for (const copy of [{}, structuredClone(cap), JSON.parse(JSON.stringify(cap))]) {
                    expect(() => inspectNativeProjectGenerationIdentity(copy, expected)).toThrow('native_orchestration_project_producer_denied');
                    await expect(inspectNativeProjectGeneration(copy, expected)).rejects.toMatchObject({ code: 'native_orchestration_project_producer_denied' });
                }
                for (const changed of [{ host: f.host }, { host: Object.create(f.host) }, { projectAgent: f.agent },
                    { projectAgent: Object.create(args.host.agent) }, { studio: Object.create(f.studio) }, { handle: 'foreign-owner' }])
                    expect(() => inspectNativeProjectGenerationIdentity(cap, { ...expected, ...changed })).toThrow('native_orchestration_project_producer_denied');
                // A round capability is not an operation capability, and a JSON
                // Task snapshot is not the original beginGeneration completion.
                await expect(captureNativeProjectGeneration(cap, { started: structuredClone(await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId)), round: 0 }))
                    .rejects.toMatchObject({ code: 'native_orchestration_project_producer_denied' });
                checked = true;
            });
            await f.run(view); expect(checked).toBe(true); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('the original running membership, retry=false and exact derived Host/Agent relationship are checked on every synchronous use', async () => {
        const f = await projectModelFixture(make); let checked = false;
        try {
            f.onRound(async ({ args }) => {
                const cap = args.projectCapture, expected = { host: args.host, handle: f.h.handle };
                const identity = inspectNativeProjectGenerationIdentity(cap, expected), operation = f.scheduler.operations.get(identity.operationId);
                operation.retry = true;
                try { expect(() => inspectNativeProjectGenerationIdentity(cap, expected)).toThrow('native_orchestration_project_producer_denied'); }
                finally { operation.retry = false; }
                f.scheduler.running.delete(operation);
                try { expect(() => inspectNativeProjectGenerationIdentity(cap, expected)).toThrow('operation_boundary_denied'); }
                finally { f.scheduler.running.add(operation); }
                f.scheduler.operations.set(identity.operationId, { ...operation });
                try { expect(() => inspectNativeProjectGenerationIdentity(cap, expected)).toThrow('operation_boundary_denied'); }
                finally { f.scheduler.operations.set(identity.operationId, operation); }
                const hostPrototype = Object.getPrototypeOf(args.host), agentPrototype = Object.getPrototypeOf(args.host.agent);
                Object.setPrototypeOf(args.host, Object.create(hostPrototype));
                try { expect(() => inspectNativeProjectGenerationIdentity(cap, expected)).toThrow('native_orchestration_project_producer_denied'); }
                finally { Object.setPrototypeOf(args.host, hostPrototype); }
                Object.setPrototypeOf(args.host.agent, Object.create(agentPrototype));
                try { expect(() => inspectNativeProjectGenerationIdentity(cap, expected)).toThrow('native_orchestration_project_producer_denied'); }
                finally { Object.setPrototypeOf(args.host.agent, agentPrototype); }
                expect(inspectNativeProjectGenerationIdentity(cap, expected).signal.aborted).toBe(false); checked = true;
            });
            await f.run(); expect(checked).toBe(true); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('the private original operation record rejects a different derived Host even with the same real boundary and preflight', async () => {
        const f = await projectModelFixture(make), preflight = f.executor.preflight.bind(f.executor), submit = f.scheduler.submit.bind(f.scheduler);
        let actualView, actualBoundary, checked = false;
        try {
            f.executor.preflight = async (...args) => { actualView = await preflight(...args); return actualView; };
            f.scheduler.submit = options => submit({ ...options, run: boundary => { actualBoundary = boundary; return options.run(boundary); } });
            f.onRound(({ args }) => {
                const original = { host: args.host, handle: f.h.handle, boundary: actualBoundary, preflight: actualView,
                    startInput: { ...f.input, requestId: 'original-project-model', expectedPreflightFingerprint: hash(actualView) } };
                expect(() => f.executor.assertOriginalOperation(original)).not.toThrow();
                const otherHost = Object.create(f.host); otherHost.agent = Object.create(f.agent); otherHost.agent._onExperienceCollected = null;
                expect(Object.getPrototypeOf(otherHost)).toBe(Object.getPrototypeOf(args.host));
                expect(otherHost.agent._repository).toBe(args.host.agent._repository);
                expect(() => f.executor.assertOriginalOperation({ ...original, host: otherHost })).toThrow('native_orchestration_project_producer_denied');
                checked = true;
            });
            await f.run(); expect(checked).toBe(true); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    });

    test('an original setPlan during initial Skill settings cannot replace the approved execution source', async () => {
        const f = await projectModelFixture(make), settings = f.host.extensions.settings;
        const original = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
        let changed = false, changedFingerprint;
        try {
            f.host.extensions.settings = async (...args) => {
                if (!changed) {
                    changed = true;
                    const planned = await f.agent.setPlan(f.h.handle, f.projectId, f.task.taskId,
                        { summary: 'Independent original Task plan', steps: [{ id: 'original', title: 'Preserve this human plan' }] });
                    changedFingerprint = planned.executionFingerprint;
                }
                return settings(...args);
            };
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            const stored = await f.agent.observeTask(f.h.handle, f.projectId, f.task.taskId);
            expect(changedFingerprint).not.toBe(original.executionFingerprint);
            expect(changed).toBe(true); expect(stored.executionFingerprint).toBe(changedFingerprint);
            expect(stored.plan.summary).toBe('Independent original Task plan');
            expect(f.requests).toHaveLength(0); expect(f.effects).toHaveLength(0);
            expect(stored.attempts).toHaveLength(0);
        } finally { await f.cleanup(); }
    });

    test.each(['request', 'ended', 'conversation', 'calls'])('controlled original-record %s mutation refuses an already minted generation before model HTTP', async change => {
        const f = await projectModelFixture(make), prepare = f.authority.prepareProjectRound.bind(f.authority);
        let changed = false;
        try {
            f.authority.prepareProjectRound = async args => {
                const identity = await inspectNativeProjectGeneration(args.projectCapture, { host: args.host, handle: f.h.handle });
                // Explicit typed original-repository fault injection. This is
                // not a new Task command or a claim of third-party mutation.
                await f.agent.withTaskLock(f.h.handle, f.projectId, f.task.taskId, async () => {
                    const stored = await f.repository.get(f.h.handle, f.projectId, f.task.taskId), next = structuredClone(stored);
                    const attempt = next.attempts.find(item => item.attemptId === identity.projectAttemptId);
                    if (change === 'request') attempt.requestId = 'different-original-request';
                    if (change === 'ended') { attempt.status = 'completed'; attempt.endedAt = Date.now(); }
                    if (change === 'conversation') next.conversation.push({ role: 'user', content: 'Controlled changed original conversation.' });
                    if (change === 'calls') attempt.calls.push({ callId: 'other-call', name: 'atri_agent_api_catalog', argsHash: hash({}) });
                    next.sequence++; next.updatedAt = Math.max(next.updatedAt + 1, Date.now());
                    await f.repository.save(f.h.handle, next, hash(stored));
                });
                changed = true;
                await expect(inspectNativeProjectGeneration(args.projectCapture, { host: args.host, handle: f.h.handle }))
                    .rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
                return prepare(args);
            };
            await expect(f.run()).rejects.toMatchObject({ code: 'native_orchestration_source_stale' });
            expect(changed).toBe(true); expect(f.requests).toHaveLength(0);
            expect((await f.repository.get(f.h.handle, f.projectId, f.task.taskId)).compute.attempts).toHaveLength(0);
        } finally { await f.cleanup(); }
    });
});
