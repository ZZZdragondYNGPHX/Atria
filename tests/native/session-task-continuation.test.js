import { test, expect, jest } from '@jest/globals';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture, sessionFixture } from './helpers/session-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createResponsesGenerationProvider } from '../../src/native/adapters/responses-generation-provider.js';
import { continuityRequirements, capabilityObservationProof, executionPathFingerprint } from '../../src/native/model-prompt-runtime/execution-evidence.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const reasoning = { type: 'reasoning', encrypted_content: 'PRIVATE-DECLARED-SESSION-TASK' };
const tool = { type: 'function_call', call_id: 'skill-task-1', name: 'atri_skill_read', arguments: '{ "path":"ref.md", "name":"guide" }' };
const final = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"text":"Fresh Task result."}' }] };
async function fixture(make, mode, maxJobs = 8) {
    const h = await make(), wires = []; let onRead = async () => {};
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const part of req) raw += part; wires.push(JSON.parse(raw));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'completed', output: wires.length % 2 ? [reasoning, tool] : [final],
            usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const seeded = await seedGenerationProfiles({ ...h, format: 'openai-responses', endpoint: `http://127.0.0.1:${server.address().port}/v1/responses` });
    const f = sessionFixture(), taskRuntime = lifecycleFixture().taskRuntime, task = taskRuntime.tasks[0];
    task.executionClass = 'turn_blocking'; task.context = ['input', 'history'];
    taskRuntime.turn = { policy: 'authority-first', stages: [], narratorTaskId: task.id };
    const variant = task.variants[0];
    f.manifest.runtime = { experienceContract: { schemaVersion: 1, capabilities: [], dataResources: [], taskRuntime } };
    f.manifest.resources = [
        { resourceType: 'core.prompt-program', resource: { ...seeded.prompt, promptProgramId: variant.prompt.resourceId, stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
        { resourceType: 'core.generation-profile', resource: { ...seeded.generation, generationProfileId: variant.generation.resourceId } },
    ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
    const installed = await installFixture(h, f), base = await installed.core.create(h.handle, installed.start);
    const connection = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
    const model = await seeded.persistence.getModelProfile(h.handle, seeded.model.modelProfileId), observedAt = Date.now() - 1;
    const decisions = continuityRequirements({ continuity: mode }).map(capability => ({ capability, state: 'supported',
        provenance: [{ kind: 'provider-endpoint', source: 'synthetic declared Session Task', observedAt }],
        binding: { schemaVersion: 1, pathFingerprint: executionPathFingerprint({ handle: h.handle, connection, model }), observedAt, expiresAt: Date.now() + 60000, assurance: 'verified' } }));
    await seeded.persistence.saveModelProfile(h.handle, { ...model, capabilities: [...model.capabilities, ...decisions] },
        { observationProof: capabilityObservationProof({ handle: h.handle, connection, model }, decisions) });
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [model.modelProfileId], continuity: mode, computeBudget: { maxRequests: 2, maxTokens: 64000,
            localWork: { maxJobs, maxItems: maxJobs, maxInputBytes: 1048576 } } } });
    const guide = { name: 'guide', scope: { kind: 'global' }, installedHash: '1'.repeat(64) };
    const readFile = jest.fn(async () => { await onRead(); return { content: 'Current pinned Task reference', totalLines: 1 }; });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: installed.core, packageInstaller: installed.packageInstaller,
        providers: { 'provider.openai-responses': createResponsesGenerationProvider() }, secretPort: { resolveSecret: async () => 'fixture-secret' },
        extensions: { settings: async () => ({ value: {} }) },
        skillRepository: () => ({ list: async () => [guide], pin: async ({ expectedHash }) => ({ version: expectedHash }), readFile }) });
    const input = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, taskId: task.id, variantId: variant.id,
        input: {}, invocationId: 'declared-task-one', slotBindings: { structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } } };
    return { ...h, ...seeded, ...installed, base, host, input, wires, readFile, onRead: fn => { onRead = fn; },
        async checkpoints() { return h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.runtimeCheckpoint, handle: h.handle })); },
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}
async function freshNode(f, interrupt = null) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [fileURLToPath(new URL('./helpers/session-task-restart-worker.mjs', import.meta.url))],
            { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 20000 });
        let stdout = '', stderr = ''; child.stdout.on('data', bytes => { stdout += bytes; }); child.stderr.on('data', bytes => { stderr += bytes; });
        child.on('error', reject); child.on('close', code => code === (interrupt ? 73 : 0)
            ? resolve(JSON.parse(stdout)) : reject(new Error('Session Task cold fixture: ' + stderr)));
        child.stdin.end(JSON.stringify({ kind: f.kind, handle: f.handle, dirs: f.dirs, input: f.input, interrupt }));
    });
}
test.each(['public_prefix_edit', 'pin_change', 'checkpoint_deleted', 'pending_checkpoint_deleted', 'model_quota', 'history_quota', 'cancel_pending'])('G04 Session Task history %s refuses a false next send and retains original cost', async scenario => {
    const f = await fixture(makeTempFsEngineHarness, 'task', scenario === 'history_quota' ? 7 : 12), controller = new AbortController();
    try {
        if (scenario === 'model_quota') {
            const route = await f.persistence.getRuntimeRoute(f.handle, f.routes[0].runtimeRouteId);
            await f.persistence.saveRuntimeRoute(f.handle, { ...route, executionPolicy: { ...route.executionPolicy,
                computeBudget: { ...route.executionPolicy.computeBudget, maxRequests: 1 } } });
        }
        await freshNode(f, ['pending_checkpoint_deleted', 'cancel_pending'].includes(scenario) ? 'pending_read' : 'charged_count');
        if (scenario === 'public_prefix_edit') await f.core.runs.update(f.handle, f.input.sessionId, control => {
            const op = Object.values(control.operations).find(row => row.taskHistories);
            Object.values(op.taskHistories)[0].messages[0].content = 'Edited public assistant prefix';
        });
        if (scenario === 'pin_change') f.host.skillRepository = () => ({ list: async () => [{ name: 'guide', scope: { kind: 'global' }, installedHash: '2'.repeat(64) }],
            pin: async ({ expectedHash }) => ({ version: expectedHash }), readFile: f.readFile });
        if (scenario.includes('checkpoint_deleted')) await f.engine.withTransaction(f.handle, async tx => {
            for (const row of await tx.listResources({ kind: K.runtimeCheckpoint, handle: f.handle })) await tx.deleteResource(row.key);
        });
        if (scenario === 'cancel_pending') f.onRead(async () => controller.abort());
        await expect(f.host.executeTask(f.handle, f.input, controller.signal)).rejects.toThrow();
        expect(f.wires).toHaveLength(1); expect(f.readFile).toHaveBeenCalledTimes(['pending_checkpoint_deleted', 'cancel_pending'].includes(scenario) ? 1 : 0);
        expect(await f.checkpoints()).toHaveLength(['model_quota', 'history_quota'].includes(scenario) ? 1 : 0);
        const bank = Object.values((await f.core.runs.status(f.handle, f.input.sessionId)).operations).find(row => row.compute).compute;
        expect(bank.attempts.map(row => row.usage.totalTokens)).toEqual([20]);
        expect(bank.localWork.filter(row => row.status === 'charged')).toHaveLength(1);
        expect((await f.core.load(f.handle, f.input.sessionId)).states.atri_task_results?.records ?? []).toEqual([]);
    } finally { await f.cleanup(); }
});
test('G04 Session Task history original prefix CAS and strict public byte/tool fields preserve saved history', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'task', 12);
    try {
        await freshNode(f, 'charged_count');
        const op = Object.values((await f.core.runs.status(f.handle, f.input.sessionId)).operations).find(row => row.taskHistories);
        const history = Object.values(op.taskHistories)[0], { messages, ...identity } = history;
        const anchor = { branchId: f.base.revision.branchId, revisionId: f.input.revisionId };
        const assistant = { role: 'assistant', content: '', tool_calls: [{ id: tool.call_id, type: 'function', function: { name: tool.name, arguments: tool.arguments } }] };
        const next = [...messages, assistant], append = (items, expectedPrefix) => f.core.runs.sessionTaskHistory(f.handle, f.base, anchor, identity, { messages: items, expectedPrefix });
        const { hashNativeDocument } = await import('../../src/native/repositories/common.js');
        await expect(append(next, '0'.repeat(64))).rejects.toMatchObject({ code: 'native_session_task_history_conflict' });
        await expect(append([...messages, { ...assistant, providerState: { secretOpaque: 'FORBIDDEN' } }], hashNativeDocument(messages))).rejects.toThrow();
        await expect(append([...messages, { ...assistant, tool_calls: [{ ...assistant.tool_calls[0], function: { name: 'atri_apply_production', arguments: '{}' } }] }], hashNativeDocument(messages))).rejects.toThrow();
        await expect(append([...next, { role: 'tool', name: tool.name, tool_call_id: tool.call_id, content: '中'.repeat(24000) }], hashNativeDocument(messages))).rejects.toThrow();
        expect(await f.core.runs.sessionTaskHistory(f.handle, f.base, anchor, identity)).toEqual(history);
        expect(f.wires).toHaveLength(1); expect(f.readFile).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
});
test.each(['task_capacity', 'global_bytes', 'round_limit'])('G04 Session Task history %s remains bounded in the original Run resource', async scenario => {
    const f = await fixture(makeTempFsEngineHarness, 'task', 12);
    try {
        await freshNode(f, 'charged_count');
        const op = Object.values((await f.core.runs.status(f.handle, f.input.sessionId)).operations).find(row => row.taskHistories);
        const history = Object.values(op.taskHistories)[0], { messages, ...identity } = history;
        const anchor = { branchId: f.base.revision.branchId, revisionId: f.input.revisionId };
        const assistant = messages[0], toolMessage = messages[1];
        const { hashNativeDocument } = await import('../../src/native/repositories/common.js');
        const append = (target, items, prefix = []) => f.core.runs.sessionTaskHistory(f.handle, f.base, anchor, target,
            { messages: items, expectedPrefix: hashNativeDocument(prefix) });
        let expectedCount = 1, rejected, refusedHost = null;
        if (scenario === 'task_capacity') {
            for (let n = 1; n < 8; n++) await append({ ...identity, invocationId: 'capacity-' + n }, [assistant]);
            rejected = append({ ...identity, invocationId: 'capacity-9' }, [assistant]);
            expectedCount = 8;
        } else if (scenario === 'global_bytes') {
            const long = { ...toolMessage, content: 'x'.repeat(60000) };
            await append(identity, [...messages, assistant, long], messages);
            await append({ ...identity, invocationId: 'large-2' }, [assistant, long]);
            rejected = append({ ...identity, invocationId: 'large-3' }, [assistant, long]);
            expectedCount = 2;
        } else {
            const sixRounds = Array.from({ length: 6 }, () => [assistant, toolMessage]).flat();
            await append(identity, sixRounds, messages);
            rejected = append(identity, [...sixRounds, assistant], sixRounds);
        }
        const error = await rejected.catch(cause => cause);
        expect(error).toBeInstanceOf(Error);
        expect(error.code ?? null).toBe(scenario === 'task_capacity' ? 'native_session_task_history_limit'
            : scenario === 'round_limit' ? 'native_session_task_history_invalid' : null);
        if (scenario === 'round_limit') refusedHost = await f.host.executeTask(f.handle, f.input).catch(cause => cause);
        expect(refusedHost?.code ?? null).toBe(scenario === 'round_limit' ? 'generation_continuation_unavailable' : null);
        const control = await f.core.runs.status(f.handle, f.input.sessionId);
        expect(Object.keys(Object.values(control.operations).find(row => row.taskHistories).taskHistories)).toHaveLength(expectedCount);
        expect(f.wires).toHaveLength(1); expect(f.readFile).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
});
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test.each(['task', 'adaptive'])(`G04 Session Task history ${kind} %s cold process consumes exact original public history and private wire`, async mode => {
        const f = await fixture(make, mode, 12);
        try {
            expect(await freshNode(f, 'charged_count')).toEqual({ stage: 'charged_count', reads: 1 });
            expect(f.wires).toHaveLength(1);
            const original = Object.values((await f.core.runs.status(f.handle, f.input.sessionId)).operations).find(row => row.compute);
            const history = Object.values(original.taskHistories)[0];
            expect(history.messages.map(message => message.role)).toEqual(['assistant', 'tool']);
            expect(history.messages[0].tool_calls[0].function.arguments).toBe(tool.arguments);
            expect(JSON.stringify(history)).not.toContain('PRIVATE-DECLARED-SESSION-TASK');
            expect(JSON.stringify(history)).not.toContain('providerState'); expect(await f.checkpoints()).toHaveLength(1);
            expect(original.compute.localWork.at(-1)).toMatchObject({ kind: 'generation_count', status: 'charged' });
            const resumed = await freshNode(f);
            expect(resumed.record.payload).toEqual({ text: 'Fresh Task result.' }); expect(resumed.reads).toBe(0);
            expect(f.wires).toHaveLength(2);
            expect(f.wires[1].input.filter(item => ['reasoning', 'function_call'].includes(item.type))).toEqual([reasoning, tool]);
            expect(f.wires[1].input.filter(item => item.type === 'function_call_output')).toHaveLength(1);
            const control = await f.core.runs.status(f.handle, f.input.sessionId);
            const retained = Object.values(control.operations).find(row => row.compute).compute;
            expect(retained.attempts.map(row => row.usage.totalTokens)).toEqual([20, 20]);
            expect(retained.localWork).toHaveLength(10);
            expect(retained.localWork.filter(row => row.status === 'charged')).toHaveLength(1);
            expect((await f.core.load(f.handle, f.input.sessionId)).states.atri_task_results.records).toHaveLength(1);
            expect((await freshNode(f)).record).toEqual(resumed.record); expect(f.wires).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
    test(`G04 Session Task history ${kind} resumes only the pending read-only Skill result and preserves old cost`, async () => {
        const f = await fixture(make, 'task', 12);
        try {
            expect(await freshNode(f, 'pending_read')).toEqual({ stage: 'pending_read', reads: 1 });
            const original = Object.values((await f.core.runs.status(f.handle, f.input.sessionId)).operations).find(row => row.compute);
            expect(Object.values(original.taskHistories)[0].messages.map(message => message.role)).toEqual(['assistant']);
            expect(original.compute.localWork.at(-1)).toMatchObject({ kind: 'skill_read', status: 'charged' });
            const resumed = await freshNode(f);
            expect(resumed.reads).toBe(1); expect(resumed.record.payload).toEqual({ text: 'Fresh Task result.' });
            const retained = Object.values((await f.core.runs.status(f.handle, f.input.sessionId)).operations).find(row => row.compute).compute;
            expect(retained.attempts.map(row => row.usage.totalTokens)).toEqual([20, 20]);
            expect(retained.localWork.filter(row => row.kind === 'skill_read').map(row => row.status)).toEqual(['charged', 'settled']);
            expect(f.wires).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
}
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test.each(['task', 'adaptive'])(`G04 declared Session Task ${kind} %s uses exact original Task and complete native tools`, async mode => {
        const f = await fixture(make, mode); let bank, checkpoint;
        const original = f.core.recordTaskResult.bind(f.core);
        f.core.recordTaskResult = async (...args) => {
            bank = Object.values((await f.core.runs.status(f.handle, f.input.sessionId)).operations).find(row => row.compute).compute;
            checkpoint = (await f.checkpoints())[0]?.doc; return original(...args);
        };
        try {
            const result = await f.host.executeTask(f.handle, f.input);
            expect(result.record.payload).toEqual({ text: 'Fresh Task result.' }); expect(f.wires).toHaveLength(2);
            expect(f.wires[1].input.filter(item => ['reasoning', 'function_call'].includes(item.type))).toEqual([reasoning, tool]);
            expect(f.wires[1].input.filter(item => item.type === 'function_call_output')).toHaveLength(1);
            expect(checkpoint.binding.executionScope).toEqual({ kind: 'session_task', invocationId: f.input.invocationId,
                taskFingerprint: result.record.fingerprint, role: 'role.narrator', source: { kind: 'session', sessionId: f.input.sessionId,
                    branchId: f.base.revision.branchId, revisionId: f.input.revisionId } });
            expect(bank.attempts.map(row => row.usage.totalTokens)).toEqual([20, 20]);
            expect(bank.localWork.map(row => row.kind)).toEqual(['task_history', 'generation_count', 'generation_render',
                'task_history', 'skill_read', 'task_history', 'generation_count', 'generation_render']);
            expect(f.readFile).toHaveBeenCalledTimes(1);
            expect(result.snapshot.timeline).toEqual(f.base.timeline);
            expect(JSON.stringify(result)).not.toContain('PRIVATE-DECLARED-SESSION-TASK');
            expect((await f.host.executeTask(f.handle, f.input)).record).toEqual(result.record); expect(f.wires).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
}
test.each(['cancel_read', 'read_failure', 'head_change', 'work_quota'])('G04 declared Session Task %s keeps original cost and awaited private lifecycle', async scenario => {
    const f = await fixture(makeTempFsEngineHarness, 'task', scenario === 'work_quota' ? 6 : 8), controller = new AbortController();
    try {
        f.onRead(async () => {
            if (scenario === 'cancel_read') controller.abort();
            if (scenario === 'read_failure') throw new Error('Synthetic Task read failure');
            if (scenario === 'head_change') await f.core.appendTimeline(f.handle, f.input.sessionId, { role: 'user', content: 'Changed Task source' });
        });
        await expect(f.host.executeTask(f.handle, f.input, controller.signal)).rejects.toThrow();
        expect(f.wires).toHaveLength(1); expect(f.readFile).toHaveBeenCalledTimes(1);
        expect(await f.checkpoints()).toHaveLength(scenario === 'work_quota' ? 1 : 0);
        const control = await f.core.runs.status(f.handle, f.input.sessionId);
        const bank = Object.values(control.operations).find(row => row.compute)?.compute;
        const observed = scenario === 'head_change' ? { models: control.retiredCompute.modelAttempts,
            tokens: control.retiredCompute.knownTotalTokens, jobs: control.retiredCompute.localJobs }
            : { models: bank.attempts.length, tokens: bank.attempts.reduce((n, row) => n + row.usage.totalTokens, 0), jobs: bank.localWork.length };
        expect(observed).toEqual({ models: 1, tokens: 20, jobs: scenario === 'work_quota' ? 6 : 5 });
        expect(bank?.localWork.find(row => row.kind === 'skill_read').usage.outcome ?? null).toBe(scenario === 'head_change' ? null
            : scenario === 'cancel_read' ? 'cancelled' : scenario === 'read_failure' ? 'failed' : 'completed');
        expect((await f.core.load(f.handle, f.input.sessionId)).states.atri_task_results?.records ?? []).toEqual([]);
    } finally { await f.cleanup(); }
});
test('G04 declared Session Task same invocation on another actual Session has an independent native scope', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'task');
    try {
        const first = await f.host.executeTask(f.handle, f.input);
        const secondBase = await f.core.create(f.handle, f.start);
        const second = await f.host.executeTask(f.handle, { ...f.input, sessionId: secondBase.session.sessionId, revisionId: secondBase.revision.revisionId });
        expect(first.record.fingerprint).not.toBe(second.record.fingerprint); expect(f.wires).toHaveLength(4);
        const scopes = (await f.checkpoints()).map(row => row.doc.binding.executionScope);
        expect(scopes.map(scope => scope.source.sessionId).sort()).toEqual([f.input.sessionId, f.input.sessionId,
            secondBase.session.sessionId, secondBase.session.sessionId].sort());
        expect(scopes.map(scope => scope.invocationId)).toEqual(Array(4).fill(f.input.invocationId));
        expect(scopes.every(scope => scope.kind === 'session_task')).toBe(true);
        expect((await f.core.runs.status(f.handle, f.input.sessionId)).retiredCompute.knownTotalTokens).toBe(40);
        expect((await f.core.runs.status(f.handle, secondBase.session.sessionId)).retiredCompute.knownTotalTokens).toBe(40);
    } finally { await f.cleanup(); }
});
test('G04 declared Session Task missing public history refuses cross-call restart before a second HTTP', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'adaptive', 8); let saved;
    try {
        f.onRead(async () => { saved = await f.checkpoints(); throw new Error('Synthetic interruption after checkpoint'); });
        await expect(f.host.executeTask(f.handle, f.input)).rejects.toThrow(); expect(saved).toHaveLength(1);
        expect(await f.checkpoints()).toHaveLength(0);
        // Restore exactly the original private row as an incomplete recovery
        // fixture. No caller history or new binding is allowed to authorize it.
        await f.engine.withTransaction(f.handle, async tx => {
            expect((await tx.putResourceIfMatch(saved[0].key, null, saved[0])).updated).toBe(true);
        });
        await f.core.runs.update(f.handle, f.input.sessionId, control => {
            for (const operation of Object.values(control.operations)) delete operation.taskHistories;
        });
        await expect(f.host.executeTask(f.handle, f.input)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect(f.wires).toHaveLength(1); expect(f.readFile).toHaveBeenCalledTimes(1);
    } finally { await f.cleanup(); }
});
test('G04 declared Session Task does not grant a plain Session task continuity consumer', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'task');
    try {
        await expect(f.host.execute(f.handle, { sessionId: f.input.sessionId, revisionId: f.input.revisionId,
            role: 'narrator', requestId: f.input.invocationId })).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect(f.wires).toEqual([]); expect(await f.checkpoints()).toEqual([]); expect(f.readFile).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
});
