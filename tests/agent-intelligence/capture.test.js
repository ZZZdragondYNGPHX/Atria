import { jest } from '@jest/globals';
import { AgentEvidenceRepository, assertEvidenceRecord } from '../../src/native/agent-intelligence/evidence-repository.js';
import { RpEvidenceCaptureService } from '../../src/native/agent-intelligence/rp-capture-service.js';
import { AgentEvidenceService } from '../../src/native/agent-intelligence/evidence-service.js';
import { createEvidenceTrace, assertEvidenceTrace } from '../../public/shared/agent-evidence-trace.js';
import { ChatRepo } from '../../src/storage/repositories/chat-repo.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { setReadOnly } from '../../src/storage/read-only-mode.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { MysqlTransaction } from '../../src/storage/engines/mysql-engine-transaction.js';
import { PgTransaction } from '../../src/storage/engines/postgres-engine-transaction.js';
import { encodeNativeResourceKey, decodeNativeResourceKey } from '../../src/storage/engines/native-resource-key.js';

const scope = { domain: 'rp_chat', charDir: 'Actor', name: 'capture', isGroup: false, groupId: '' };
const messages = () => [{ memory_os_source_id: 'user-1', is_user: true, name: 'User', mes: 'A choice.', swipe_id: 0 },
    { memory_os_source_id: 'actor-1', is_user: false, name: 'Actor', mes: 'A reply.', swipe_id: 0 }];
const selector = { kind: 'message', messageId: 'user-1', floor: 0 };
const limits = { maxSources: 4, maxBytes: 32768, maxScanMessages: 128 };
const event = (id = 'root/started', extra = {}) => ({ type: 'run.started', eventId: id, runId: 'root', generation: 0, version: 1, ...extra });
const trace = (...events) => { const value = createEvidenceTrace(); events.forEach(item => value.append(item)); return value.snapshot(); };

afterEach(() => { setReadOnly(false); jest.restoreAllMocks(); });

describe('bounded metadata capture', () => {
    test('excludes raw content, reports malformed/conflicting events and preserves exact duplicates', () => {
        const capture = createEvidenceTrace();
        capture.append(event('one', { prompt: 'PRIVATE', args: { key: 'SECRET' }, result: 'PRIVATE' }));
        capture.append(event('one')); capture.append(event('one', { status: 'failed' }));
        capture.append({ type: 'bad', eventId: 'bad', runId: () => {} });
        const value = capture.snapshot();
        expect(value.events).toHaveLength(1); expect(value.missing).toBe(2);
        expect(value.reasons).toEqual(['event_conflict', 'invalid_event']);
        expect(JSON.stringify(value)).not.toMatch(/PRIVATE|SECRET/);
        expect(assertEvidenceTrace(JSON.parse(JSON.stringify(value)))).toEqual(value);
    });
    test('event count and bytes have explicit missing markers; unknown representation rejected', () => {
        const capture = createEvidenceTrace();
        for (let i = 0; i < 520; i++) capture.append(event('event-' + i));
        expect(capture.snapshot()).toMatchObject({ missing: 8, reasons: ['capture_limit'] });
        const bytes = createEvidenceTrace();
        for (let i = 0; i < 512; i++) bytes.append(event('long-' + i, { agentId: 'a'.repeat(1024) }));
        expect(bytes.snapshot().missing).toBeGreaterThan(0);
        expect(() => assertEvidenceTrace({ ...capture.snapshot(), schemaVersion: 2 })).toThrow();
        expect(() => assertEvidenceTrace({ ...trace(event()), raw: 'secret' })).toThrow();
    });
});

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('%s durable capture', (_name, make) => {
    let h, repository, source, capture, marker, chat;
    beforeEach(async () => {
        h = await make(); repository = new AgentEvidenceRepository({ engine: h.engine }); chat = new ChatRepo({ engine: h.engine });
        source = new AgentEvidenceService({ chatRepo: chat }); capture = new RpEvidenceCaptureService({ repository, service: source });
        await chat.save(h.handle, scope.charDir, scope.name, {}, messages(), null);
        marker = await capture.begin(h.handle, { scope, rootRunId: 'root', selectors: [selector] });
    });
    afterEach(async () => { await h.cleanup(); });
    const update = (marker, sequence = 1, events = [event()], status = 'completed', output = null) => ({ evidenceId: marker.evidenceId, sequence, status, trace: trace(...events), output });
    test('restart marker remains incomplete; final output is re-read through original source authority', async () => {
        const restarted = new AgentEvidenceRepository({ engine: h.engine });
        expect((await restarted.inspect(h.handle, marker.evidenceId, source, limits)).captureStatus).toBe('incomplete');
        await capture.update(h.handle, update(marker));
        expect((await capture.inspect(h.handle, { evidenceId: marker.evidenceId })).captureStatus).toBe('incomplete');
        const set = await source.capture(h.handle, scope, [{ kind: 'message', messageId: 'actor-1', floor: 1 }], limits);
        await capture.update(h.handle, update(marker, 2, [event()], 'completed', set.references[0]));
        const result = await restarted.inspect(h.handle, marker.evidenceId, source, limits);
        expect(result.captureStatus).toBe('captured'); expect(result.record.outputRef).toEqual(set.references[0]);
        expect(JSON.stringify(result.record)).not.toContain('A reply.');
        const changed = messages(); changed[1].swipe_id = 1; changed[1].mes = 'Another reply.';
        await chat.save(h.handle, scope.charDir, scope.name, {}, changed, null);
        await expect(capture.update(h.handle, update(marker, 3, [event()], 'completed', set.references[0]))).rejects.toThrow('variant changed');
        expect((await capture.inspect(h.handle, { evidenceId: marker.evidenceId })).captureStatus).toBe('incomplete');
    });
    test('out-of-order, conflicting duplicate and rewritten prefix are refused; retry is idempotent', async () => {
        const one = update(marker); await capture.update(h.handle, one); await capture.update(h.handle, one);
        await expect(capture.update(h.handle, { ...one, status: 'failed' })).rejects.toThrow('sequence_conflict');
        await capture.update(h.handle, update(marker, 2, [event(), event('child/event', { runId: 'root/child', parentRunId: 'root' })]));
        await expect(capture.update(h.handle, update(marker))).rejects.toThrow('sequence_conflict');
        await expect(capture.update(h.handle, update(marker, 3, [event('other')]))).rejects.toThrow('sequence_conflict');
    });
    test('client origin/owner/raw outcome forgery, source substitution and unknown schema are rejected', async () => {
        await expect(capture.begin(h.handle, { scope, rootRunId: 'spoof', selectors: [selector], origin: 'host' })).rejects.toThrow();
        await expect(capture.update(h.handle, { ...update(marker), outcome: { status: 'success' } })).rejects.toThrow();
        await expect(repository.update(h.handle, marker.evidenceId, update(marker), 'host')).rejects.toThrow('origin mismatch');
        await expect(capture.update('foreign', update(marker))).rejects.toThrow();
        await expect(capture.update(h.handle, update(marker, 1, [event()], 'completed', marker.sources.references[0]))).rejects.toThrow('Input cannot');
        expect(() => assertEvidenceRecord({ ...marker, schemaVersion: 2 })).toThrow();
        expect(() => assertEvidenceRecord({ ...marker, raw: 'secret' })).toThrow();
    });

    test('list and real engine dump/restore include the evidence kind', async () => {
        await capture.update(h.handle, update(marker));
        const key = { kind: K.agentEvidence, handle: h.handle, evidenceId: marker.evidenceId };
        expect(encodeNativeResourceKey(key)).toBe(JSON.stringify([marker.evidenceId]));
        expect(decodeNativeResourceKey(key.kind, key.handle, encodeNativeResourceKey(key))).toEqual(key);
        expect(await h.engine.withTransaction(h.handle, tx => tx.listResources({ kind: K.agentEvidence, handle: h.handle }))).toHaveLength(1);
        const dump = await h.engine.dumpUser(h.handle);
        if (h.kind === 'sqlite') {
            await h.engine.restoreUser(h.handle, dump);
        }
        expect(h.kind === 'sqlite' ? (await new AgentEvidenceRepository({ engine: h.engine }).get(h.handle, marker.evidenceId)).status : dump).toBe(h.kind === 'sqlite' ? 'completed' : null);
    });

});

test('metadata kind round-trips through FS -> SQLite -> FS; SQL adapters register the same key', async () => {
    const fs = await makeTempFsEngineHarness(), sql = await makeTempSqliteEngineHarness();
    try {
        const repo = new AgentEvidenceRepository({ engine: fs.engine });
        const record = await repo.begin(fs.handle, { scope, rootRunId: 'roundtrip', origin: 'host' });
        const key = { kind: K.agentEvidence, handle: fs.handle, evidenceId: record.evidenceId };
        const stored = await fs.engine.withTransaction(fs.handle, tx => tx.getResource(key));
        await sql.engine.withTransaction(sql.handle, tx => tx.putResource(key, stored));
        await fs.engine.withTransaction(fs.handle, tx => tx.deleteResource(key));
        await fs.engine.withTransaction(fs.handle, tx => tx.putResource(key, stored));
        expect(await new AgentEvidenceRepository({ engine: sql.engine }).get(sql.handle, record.evidenceId)).toEqual(record);
        for (const tx of [new MysqlTransaction({ conn: {}, handle: fs.handle }), new PgTransaction({ client: {}, handle: fs.handle })]) {
            expect(tx._handlers.has(K.agentEvidence)).toBe(true);
        }
        expect((await repo.get(fs.handle, record.evidenceId))).toEqual(record);
    } finally { await fs.cleanup(); await sql.cleanup(); }
});







describe.each(['openai-compatible', 'anthropic', 'gemini'])('%s observed usage', format => {
    test.each([false, true])('parser preserves final counters without summing subdivisions (stream=%s)', async streaming => {
        const { createHttpGenerationProvider } = await import('../../src/native/adapters/http-generation-provider.js');
        const { createNativeMessagesProvider } = await import('../../src/native/adapters/native-messages-provider.js');
        const provider = format === 'openai-compatible' ? createHttpGenerationProvider() : createNativeMessagesProvider({ format });
        const values = format === 'openai-compatible' ? [
            { choices: [{ delta: { content: 'text' } }] },
            { choices: [], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14, completion_tokens_details: { reasoning_tokens: 2 } } },
        ] : format === 'anthropic' ? [
            { type: 'message_start', message: { usage: { input_tokens: 10 } } },
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: 'text' } },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 4 } },
            { type: 'message_stop' },
        ] : [
            { candidates: [{ content: { parts: [{ text: 'text' }] }, finishReason: 'STOP' }] },
            { usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4, totalTokenCount: 17, thoughtsTokenCount: 3 } },
        ];
        const raw = format === 'openai-compatible' ? { choices: [{ message: { content: 'text' } }], usage: values[1].usage }
            : format === 'anthropic' ? { content: [{ type: 'text', text: 'text' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 4 } }
                : { candidates: values[0].candidates, usageMetadata: values[1].usageMetadata };
        const response = new Response(streaming ? values.map(value => 'data: ' + JSON.stringify(value) + '\n\n').join('') : JSON.stringify(raw),
            { headers: { 'Content-Type': streaming ? 'text/event-stream' : 'application/json' } });
        const parsed = await provider.parseStream(format === 'openai-compatible' ? response : { response, binding: { protocol: 'native.' + format + '.v1', executionScope: { kind: 'request' } }, sequence: [] });
        const result = provider.normalizeResponse(parsed);
        expect(result.text).toBe('text'); expect(result.usage).toMatchObject({ inputTokens: 10, outputTokens: 4 });
        expect(result.usage.totalTokens).toBe(format === 'anthropic' ? undefined : format === 'gemini' ? 17 : 14);
    });
});
