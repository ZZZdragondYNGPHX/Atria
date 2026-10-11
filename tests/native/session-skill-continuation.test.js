import { expect, test, jest } from '@jest/globals';
import { createServer } from 'node:http';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createResponsesGenerationProvider } from '../../src/native/adapters/responses-generation-provider.js';
import { createNativeId } from '../../src/native/identity.js';
import { activeExecutionCapability, capabilityObservationProof, executionPathFingerprint } from '../../src/native/model-prompt-runtime/execution-evidence.js';

const argumentsWire = '{\n "path" : "ref.md", "name":"guide", "limit":1, "offset":2\n}';
const reasoning = { type: 'reasoning', encrypted_content: 'PRIVATE-SESSION-SKILL' };
const tool = { type: 'function_call', call_id: 'skill-1', name: 'atri_skill_read', arguments: argumentsWire };
const final = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Final fresh prose.' }] };
async function fixture(make, mode, maxJobs = 5, maxInputBytes = 1048576) {
    const h = await make(), wires = []; let onRead = async () => {}, output = round => round === 1 ? [reasoning, tool] : [final], status = () => 200;
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const part of req) raw += part; wires.push(JSON.parse(raw));
        const items = output(wires.length); if (!items) return;
        res.writeHead(status(wires.length), { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'completed', output: items, usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 } }));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const installed = await installFixture(h), base = await installed.core.create(h.handle, installed.start);
    const seeded = await seedGenerationProfiles({ ...h, format: 'openai-responses', endpoint: `http://127.0.0.1:${server.address().port}/v1/responses` });
    const connection = await seeded.persistence.getConnectionProfile(h.handle, seeded.connection.connectionProfileId);
    const model = await seeded.persistence.getModelProfile(h.handle, seeded.model.modelProfileId), observedAt = Date.now() - 1;
    const decision = { capability: activeExecutionCapability, state: 'supported', provenance: [{ kind: 'provider-endpoint', source: 'synthetic Session Skill loop', observedAt }],
        binding: { schemaVersion: 1, pathFingerprint: executionPathFingerprint({ handle: h.handle, connection, model }), observedAt, expiresAt: Date.now() + 60000, assurance: 'verified' } };
    await seeded.persistence.saveModelProfile(h.handle, { ...model, capabilities: [...model.capabilities, decision] },
        { observationProof: capabilityObservationProof({ handle: h.handle, connection, model }, [decision]) });
    await seeded.persistence.saveRuntimeRoute(h.handle, { ...seeded.routes[0], executionPolicy: { schemaVersion: 1,
        allowedModelProfileIds: [model.modelProfileId], continuity: mode, computeBudget: { maxRequests: 2, maxTokens: 64000,
            localWork: { maxJobs, maxItems: maxJobs, maxInputBytes } } } });
    const guide = { name: 'guide', scope: { kind: 'global' }, installedHash: '1'.repeat(64) };
    const readFile = jest.fn(async () => { await onRead(); return { content: 'Current scoped reference', totalLines: 3 }; });
    const listFiles = jest.fn(async () => { await onRead(); return [{ path: 'ref.md', buffer: Buffer.from('Current scoped reference'), isBinary: false }]; });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: installed.core,
        providers: { 'provider.openai-responses': createResponsesGenerationProvider() }, secretPort: { resolveSecret: async () => 'fixture-secret' },
        extensions: { settings: async () => ({ value: {} }) },
        skillRepository: () => ({ list: async () => [guide], get: async () => guide, pin: async ({ expectedHash }) => ({ version: expectedHash }), readFile, listFiles }) });
    const request = { role: 'narrator', sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: 'session-skill-rounds' };
    return { ...h, ...seeded, core: installed.core, start: installed.start, base, host, request, wires, readFile, listFiles,
        onRead: fn => { onRead = fn; }, output: fn => { output = fn; }, status: fn => { status = fn; },
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test.each(['none', 'active_execution'])(`G05 Skill read ${kind} %s actual loop shares original five jobs and preserves public protocol`, async mode => {
        const f = await fixture(make, mode), onChunk = jest.fn();
        try {
            const result = await f.host.execute(f.handle, f.request, undefined, onChunk);
            expect(result.response.text).toBe('Final fresh prose.'); expect(f.wires).toHaveLength(2);
            expect(f.wires[1].input.filter(item => ['reasoning', 'function_call'].includes(item.type))).toEqual([reasoning, tool]);
            expect(f.readFile).toHaveBeenCalledTimes(1); expect(f.readFile.mock.calls[0][0]).toMatchObject({ name: 'guide', path: 'ref.md', offset: 2, limit: 1 });
            const ledger = Object.values((await f.core.runs.status(f.handle, f.request.sessionId)).operations).find(row => row.compute).compute;
            expect(ledger.attempts.map(row => row.usage.totalTokens)).toEqual([20, 20]);
            expect(ledger.localWork.map(row => row.kind)).toEqual(['generation_count', 'generation_render', 'skill_read', 'generation_count', 'generation_render']);
            expect(JSON.stringify(result)).not.toContain('PRIVATE-SESSION-SKILL');
            expect((await f.core.load(f.handle, f.request.sessionId)).timeline).toEqual(f.base.timeline);
            expect(onChunk.mock.calls.map(([chunk]) => chunk.text)).toEqual(['Final fresh prose.']);
        } finally { await f.cleanup(); }
    });
}
test.each(['cancel_read', 'head_change', 'work_quota'])('G05 Skill read %s stops the next round and keeps original observed cost', async scenario => {
    const f = await fixture(makeTempFsEngineHarness, 'active_execution', scenario === 'work_quota' ? 2 : 4), controller = new AbortController(), onChunk = jest.fn();
    try {
        f.onRead(async () => {
            if (scenario === 'cancel_read') controller.abort();
            if (scenario === 'head_change') await f.core.appendTimeline(f.handle, f.request.sessionId, { role: 'user', content: 'Changed during scoped Skill read' });
        });
        await expect(f.host.execute(f.handle, f.request, controller.signal, onChunk)).rejects.toThrow();
        const control = await f.core.runs.status(f.handle, f.request.sessionId);
        const cost = scenario === 'head_change' ? control.retiredCompute : Object.values(control.operations).find(row => row.compute).compute;
        const observed = scenario === 'head_change' ? { models: cost.modelAttempts, tokens: cost.knownTotalTokens, jobs: cost.localJobs }
            : { models: cost.attempts.length, tokens: cost.attempts.reduce((n, row) => n + row.usage.totalTokens, 0), jobs: cost.localWork.length };
        expect(observed).toEqual({ models: 1, tokens: 20, jobs: scenario === 'work_quota' ? 2 : 3 }); expect(f.wires).toHaveLength(1);
        expect(f.readFile).toHaveBeenCalledTimes(scenario === 'work_quota' ? 0 : 1);
        expect(onChunk).not.toHaveBeenCalled();
        let cancelledWork = null;
        if (scenario === 'cancel_read') {
            for (let n = 0; n < 20; n++) {
                const rows = Object.values((await f.core.runs.status(f.handle, f.request.sessionId)).operations).find(row => row.compute).compute.localWork;
                cancelledWork = rows.find(row => row.kind === 'skill_read');
                if (cancelledWork.status === 'settled') break;
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        expect(cancelledWork?.status ?? null).toBe(scenario === 'cancel_read' ? 'settled' : null);
        expect(cancelledWork?.usage.outcome ?? null).toBe(scenario === 'cancel_read' ? 'cancelled' : null);
    } finally { await f.cleanup(); }
});
test.each(['file_list', 'read_failure', 'byte_quota', 'old_unbounded', 'post_settlement_change'])('G05 Skill read %s uses only original bounded read authority', async scenario => {
    const f = await fixture(makeTempFsEngineHarness, 'active_execution', 5, scenario === 'byte_quota' ? 131072 : 1048576); let spy;
    try {
        if (scenario === 'file_list') f.output(round => round === 1 ? [reasoning, { ...tool, name: 'atri_skill_files', arguments: '{ "name": "guide" }' }] : [final]);
        if (scenario === 'byte_quota') f.output(round => round === 1 ? [reasoning, { ...tool, arguments: JSON.stringify({ name: 'guide', path: 'x'.repeat(262144) + '.md' }) }] : [final]);
        if (scenario === 'read_failure') f.onRead(async () => { throw new Error('Synthetic read failure'); });
        if (scenario === 'old_unbounded') await f.persistence.saveRuntimeRoute(f.handle, { ...await f.persistence.getRuntimeRoute(f.handle, f.routes[0].runtimeRouteId),
            executionPolicy: { schemaVersion: 1, allowedModelProfileIds: [f.model.modelProfileId], continuity: 'active_execution' } });
        if (scenario === 'post_settlement_change') {
            const original = f.core.runs.settleLocalWork.bind(f.core.runs); let jobs = 0;
            spy = jest.spyOn(f.core.runs, 'settleLocalWork').mockImplementation(async (...args) => {
                const result = await original(...args);
                if (++jobs === 3) await f.core.appendTimeline(f.handle, f.request.sessionId, { role: 'user', content: 'Changed after Skill cost settlement' });
                return result;
            });
        }
        const result = await f.host.execute(f.handle, f.request).then(value => ({ value }), error => ({ error }));
        const success = ['file_list', 'old_unbounded'].includes(scenario); expect(Boolean(result.value)).toBe(success); expect(f.wires).toHaveLength(success ? 2 : 1);
        expect(f.readFile).toHaveBeenCalledTimes(['byte_quota', 'file_list'].includes(scenario) ? 0 : 1); expect(f.listFiles).toHaveBeenCalledTimes(scenario === 'file_list' ? 1 : 0);
        const control = await f.core.runs.status(f.handle, f.request.sessionId), cost = scenario === 'post_settlement_change' ? control.retiredCompute : Object.values(control.operations).find(row => row.compute)?.compute ?? {};
        const jobs = scenario === 'post_settlement_change' ? cost.localJobs : cost.localWork?.length ?? 0;
        expect(jobs).toBe(scenario === 'old_unbounded' ? 0 : success ? 5 : scenario === 'byte_quota' ? 2 : 3);
        const work = scenario === 'post_settlement_change' ? cost.localCompletedJobs : cost.localWork?.find(row => row.kind === 'skill_read')?.usage.outcome ?? null;
        expect(work).toBe(scenario === 'post_settlement_change' ? 3 : scenario === 'read_failure' ? 'failed' : scenario === 'file_list' ? 'completed' : null);
    } finally { spy?.mockRestore(); await f.cleanup(); }
});
test('G05 Skill read accepted fallback keeps one original ledger including failed primary work', async () => {
    const f = await fixture(makeTempFsEngineHarness, 'active_execution', 7);
    try {
        const root = await f.persistence.getRuntimeRoute(f.handle, f.routes[0].runtimeRouteId), budget = { ...root.executionPolicy.computeBudget, maxRequests: 3 };
        const fallback = { ...root, runtimeRouteId: createNativeId('runtimeRoute'), fallbackRouteRefs: [], executionPolicy: { ...root.executionPolicy, computeBudget: budget } };
        await f.persistence.saveRuntimeRoute(f.handle, fallback);
        await f.persistence.saveRuntimeRoute(f.handle, { ...root, fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }], executionPolicy: { ...root.executionPolicy, computeBudget: budget } });
        f.status(round => round === 1 ? 503 : 200); f.output(round => round <= 2 ? [reasoning, tool] : [final]);
        const result = await f.host.execute(f.handle, { ...f.request, fallbackMode: 'automatic' });
        expect(result.skillRounds.map(row => row.runtimeRouteId)).toEqual([fallback.runtimeRouteId, root.runtimeRouteId]);
        const operations = Object.values((await f.core.runs.status(f.handle, f.request.sessionId)).operations).filter(row => row.compute);
        expect(operations).toHaveLength(1); expect(operations[0].compute.localWork).toHaveLength(7);
        expect(operations[0].compute.localWork.filter(row => row.kind === 'skill_read')).toHaveLength(1);
        expect(operations[0].compute.attempts.map(row => row.status)).toEqual(['unknown', 'settled', 'settled']); expect(f.readFile).toHaveBeenCalledTimes(1); expect(f.wires).toHaveLength(3);
    } finally { await f.cleanup(); }
});
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test.each(['none', 'active_execution'])(`G04 source scope ${kind} %s cancellation cannot evict another real Session using the same requestId`, async mode => {
        const f = await fixture(make, mode), controller = new AbortController(); let received, cleaned;
        const arrival = new Promise(resolve => { received = resolve; }), cleanup = new Promise(resolve => { cleaned = resolve; });
        try {
            f.host.skillRepository = null;
            const provider = f.host.providers['provider.openai-responses'];
            f.host.providers['provider.openai-responses'] = { ...provider, async discardExecution(rendered) { await provider.discardExecution(rendered); cleaned(); } };
            f.output(round => { if (round === 3) { received(); return null; } return round <= 2 ? [reasoning, tool] : [final]; });
            const secondBase = await f.core.create(f.handle, f.start);
            const tools = [{ type: 'function', function: { name: 'atri_skill_read', parameters: { type: 'object', properties: {
                name: { type: 'string' }, path: { type: 'string' }, offset: { type: 'integer' }, limit: { type: 'integer' },
            } } } }];
            const firstRequest = { ...f.request, tools }, secondRequest = { ...firstRequest, sessionId: secondBase.session.sessionId, revisionId: secondBase.revision.revisionId };
            const preview = await f.host.execute(f.handle, firstRequest, undefined, undefined, { preview: true });
            expect(preview.rendered.binding.executionScope).toEqual({ kind: 'request', requestId: firstRequest.requestId, role: 'role.narrator',
                source: { kind: 'session', sessionId: firstRequest.sessionId, branchId: f.base.revision.branchId, revisionId: firstRequest.revisionId } });
            const first = await f.host.execute(f.handle, firstRequest), second = await f.host.execute(f.handle, secondRequest);
            const next = (request, result) => ({ ...request, messages: [{ role: 'assistant', content: result.response.text,
                tool_calls: result.response.toolCalls.map(call => call.raw), providerState: result.response.providerState },
            { role: 'tool', tool_call_id: result.response.toolCalls[0].id, content: 'Current legal reference' }] });
            const failed = f.host.execute(f.handle, next(firstRequest, first), controller.signal).catch(error => error);
            await arrival; controller.abort(); expect(await failed).toMatchObject({ code: 'generation_cancelled' }); await cleanup;
            const firstCost = Object.values((await f.core.runs.status(f.handle, firstRequest.sessionId)).operations).find(row => row.compute).compute;
            expect(firstCost.attempts.map(row => row.status)).toEqual(['settled', 'unknown']); expect(firstCost.attempts[1].estimatedTokens).toBeGreaterThan(0);
            const independent = await f.host.execute(f.handle, next(secondRequest, second));
            expect(independent.response.text).toBe('Final fresh prose.'); expect(f.wires).toHaveLength(4);
            const secondCost = Object.values((await f.core.runs.status(f.handle, secondRequest.sessionId)).operations).find(row => row.compute).compute;
            expect(secondCost.attempts.map(row => row.usage.totalTokens)).toEqual([20, 20]);
            expect((await f.core.load(f.handle, firstRequest.sessionId)).timeline).toEqual(f.base.timeline);
            expect((await f.core.load(f.handle, secondRequest.sessionId)).timeline).toEqual(secondBase.timeline);
        } finally { controller.abort(); await f.cleanup(); }
    });
}
