import { expect, test, jest } from '@jest/globals';
import { createServer } from 'node:http';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createResponsesGenerationProvider } from '../../src/native/adapters/responses-generation-provider.js';
import { activeExecutionCapability, capabilityObservationProof, executionPathFingerprint } from '../../src/native/model-prompt-runtime/execution-evidence.js';

const argumentsWire = '{\n "path" : "ref.md", "name":"guide", "limit":1, "offset":2\n}';
const reasoning = { type: 'reasoning', encrypted_content: 'PRIVATE-SESSION-SKILL' };
const tool = { type: 'function_call', call_id: 'skill-1', name: 'atri_skill_read', arguments: argumentsWire };
const final = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Final fresh prose.' }] };
async function fixture(make, mode, maxJobs = 4) {
    const h = await make(), wires = []; let onRead = async () => {};
    const server = createServer(async (req, res) => {
        let raw = ''; for await (const part of req) raw += part; wires.push(JSON.parse(raw));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'completed', output: wires.length === 1 ? [reasoning, tool] : [final], usage: { input_tokens: 12, output_tokens: 8, total_tokens: 20 } }));
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
            localWork: { maxJobs, maxItems: maxJobs, maxInputBytes: 1048576 } } } });
    const guide = { name: 'guide', scope: { kind: 'global' }, installedHash: '1'.repeat(64) };
    const readFile = jest.fn(async () => { await onRead(); return { content: 'Current scoped reference', totalLines: 3 }; });
    const host = new NativeGenerationHost({ ...seeded, sessionCore: installed.core,
        providers: { 'provider.openai-responses': createResponsesGenerationProvider() }, secretPort: { resolveSecret: async () => 'fixture-secret' },
        extensions: { settings: async () => ({ value: {} }) },
        skillRepository: () => ({ list: async () => [guide], get: async () => guide, pin: async ({ expectedHash }) => ({ version: expectedHash }), readFile }) });
    const request = { role: 'narrator', sessionId: base.session.sessionId, revisionId: base.revision.revisionId, requestId: 'session-skill-rounds' };
    return { ...h, ...seeded, core: installed.core, base, host, request, wires, readFile, onRead: fn => { onRead = fn; },
        async cleanup() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await h.cleanup(); } };
}
for (const [kind, make] of [['fs', makeTempFsEngineHarness], ['sqlite', makeTempSqliteEngineHarness]]) {
    test.each(['none', 'active_execution'])(`G04 Session Skill ${kind} %s actual loop preserves public arguments and full native items`, async mode => {
        const f = await fixture(make, mode), onChunk = jest.fn();
        try {
            const result = await f.host.execute(f.handle, f.request, undefined, onChunk);
            expect(result.response.text).toBe('Final fresh prose.'); expect(f.wires).toHaveLength(2);
            expect(f.wires[1].input.filter(item => ['reasoning', 'function_call'].includes(item.type))).toEqual([reasoning, tool]);
            expect(f.readFile).toHaveBeenCalledTimes(1); expect(f.readFile.mock.calls[0][0]).toMatchObject({ name: 'guide', path: 'ref.md', offset: 2, limit: 1 });
            const ledger = Object.values((await f.core.runs.status(f.handle, f.request.sessionId)).operations).find(row => row.compute).compute;
            expect(ledger.attempts.map(row => row.usage.totalTokens)).toEqual([20, 20]);
            expect(ledger.localWork.map(row => row.kind)).toEqual(['generation_count', 'generation_render', 'generation_count', 'generation_render']);
            expect(JSON.stringify(result)).not.toContain('PRIVATE-SESSION-SKILL');
            expect((await f.core.load(f.handle, f.request.sessionId)).timeline).toEqual(f.base.timeline);
            expect(onChunk.mock.calls.map(([chunk]) => chunk.text)).toEqual(['Final fresh prose.']);
        } finally { await f.cleanup(); }
    });
}
test.each(['cancel_read', 'head_change', 'work_quota'])('G04 Session Skill %s stops the next round and keeps original observed cost', async scenario => {
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
        expect(observed).toEqual({ models: 1, tokens: 20, jobs: 2 }); expect(f.wires).toHaveLength(1); expect(f.readFile).toHaveBeenCalledTimes(1);
        expect(onChunk).not.toHaveBeenCalled();
    } finally { await f.cleanup(); }
});
