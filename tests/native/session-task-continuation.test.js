import { test, expect, jest } from '@jest/globals';
import { createServer } from 'node:http';
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
async function fixture(make, mode, maxJobs = 5) {
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
            expect(bank.localWork.map(row => row.kind)).toEqual(['generation_count', 'generation_render', 'skill_read', 'generation_count', 'generation_render']);
            expect(f.readFile).toHaveBeenCalledTimes(1);
            expect(result.snapshot.timeline).toEqual(f.base.timeline);
            expect(JSON.stringify(result)).not.toContain('PRIVATE-DECLARED-SESSION-TASK');
            expect((await f.host.executeTask(f.handle, f.input)).record).toEqual(result.record); expect(f.wires).toHaveLength(2);
        } finally { await f.cleanup(); }
    });
}
test.each(['cancel_read', 'read_failure', 'head_change', 'work_quota'])('G04 declared Session Task %s keeps original cost and awaited private lifecycle', async scenario => {
    const f = await fixture(makeTempFsEngineHarness, 'task', scenario === 'work_quota' ? 3 : 5), controller = new AbortController();
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
        expect(observed).toEqual({ models: 1, tokens: 20, jobs: 3 });
        expect(bank?.localWork[2].usage.outcome ?? null).toBe(scenario === 'head_change' ? null
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
    const f = await fixture(makeTempFsEngineHarness, 'adaptive', 5); let saved;
    try {
        f.onRead(async () => { saved = await f.checkpoints(); throw new Error('Synthetic interruption after checkpoint'); });
        await expect(f.host.executeTask(f.handle, f.input)).rejects.toThrow(); expect(saved).toHaveLength(1);
        expect(await f.checkpoints()).toHaveLength(0);
        // Restore exactly the original private row as an incomplete recovery
        // fixture. No caller history or new binding is allowed to authorize it.
        await f.engine.withTransaction(f.handle, async tx => {
            expect((await tx.putResourceIfMatch(saved[0].key, null, saved[0])).updated).toBe(true);
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
