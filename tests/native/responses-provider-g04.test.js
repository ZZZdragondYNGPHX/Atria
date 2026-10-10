import { afterEach, expect, test } from '@jest/globals';
import { createServer } from 'node:http';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { createNativeId } from '../../src/native/identity.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createResponsesGenerationProvider } from '../../src/native/adapters/responses-generation-provider.js';
import { createNativeMessagesProvider } from '../../src/native/adapters/native-messages-provider.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const message = text => ({ id: 'message-1', type: 'message', status: 'completed', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text, annotations: [] }] });
const envelope = { id: 'reasoning-1', type: 'reasoning', summary: [], encrypted_content: 'OPAQUE-STATE-SENTINEL' };
const functionCall = { id: 'item-1', type: 'function_call', status: 'completed', call_id: 'call-1', name: 'lookup', arguments: '{"q":"current"}' };
const result = output => ({ id: 'response-1', status: 'completed', model: 'reported-alias', output,
    usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28, input_tokens_details: { cached_tokens: 12 } } });
async function fixture(handler, format = 'openai-responses') {
    const requests = [];
    const server = createServer(async (req, res) => {
        let wire = ''; for await (const chunk of req) wire += chunk;
        requests.push({ wire, body: JSON.parse(wire) });
        handler(res, requests.length, requests.at(-1));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    cleanups.push(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, format, roles: ['studio'], endpoint: `http://127.0.0.1:${server.address().port}/v1/responses` });
    const projectId = createNativeId('project');
    const project = { source: { project: { projectId }, package: {}, resources: [] }, revision: { revision: 'r1' } };
    const provider = format === 'openai-responses' ? createResponsesGenerationProvider() : createNativeMessagesProvider({ format });
    const host = new NativeGenerationHost({ ...seeded, studio: { getProject: async () => project }, providers: { ['provider.' + format]: provider },
        secretPort: { resolveSecret: async () => 'g04-test-credential' } });
    const request = { projectId, revision: 'r1', requestId: 'active-loop', role: 'studio',
        tools: [{ type: 'function', function: { name: 'lookup', parameters: { type: 'object', properties: { q: { type: 'string' } } } } }],
        messages: [{ role: 'user', content: 'Look up current evidence.' }] };
    return { ...seeded, h, host, provider, request, project, requests };
}
const json = (res, body) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const nativeResult = (format, round, signature = 'NATIVE-OPAQUE-SENTINEL') => format === 'anthropic'
    ? { model: 'reported-alias', stop_reason: round === 1 ? 'tool_use' : 'end_turn', content: round === 1
        ? [{ type: 'thinking', thinking: 'provider-only summary', signature }, { type: 'tool_use', id: 'call-1', name: 'lookup', input: { q: 'current' } }]
        : [{ type: 'text', text: 'Fresh native final.' }] }
    : { modelVersion: 'reported-alias', candidates: [{ finishReason: 'STOP', content: { parts: round === 1
        ? [{ functionCall: { name: 'lookup', args: { q: 'current' } }, thoughtSignature: signature }]
        : [{ text: 'Fresh native final.' }] } }] };
function followup(f, first) {
    return { ...f.request, messages: [...f.request.messages, { role: 'assistant', content: first.response.text, providerState: first.response.providerState,
        tool_calls: first.response.toolCalls.map(call => call.raw) }, { role: 'tool', tool_call_id: first.response.toolCalls[0].id, content: 'current evidence' }] };
}

describe.each(['anthropic', 'gemini'])('G04 Native Host %s envelope', format => {
    test('Host retry renews the single-send lease without changing the frozen request', async () => {
        const f = await fixture((res, round) => {
            if (round === 1) { res.writeHead(429); res.end('busy'); }
            else json(res, nativeResult(format, 2));
        }, format);
        await f.persistence.saveRuntimeRoute(f.h.handle, { ...f.routes[0], policy: { ...f.routes[0].policy, maxRetries: 1 } });
        expect((await f.host.execute(f.h.handle, f.request)).response.text).toBe('Fresh native final.');
        expect(f.requests).toHaveLength(2);
        expect(f.requests[0].wire).toBe(f.requests[1].wire);
    });
    test('actual two-round tool consumption preserves opaque wire while preview and response remain private', async () => {
        const f = await fixture((res, round) => json(res, nativeResult(format, round)), format);
        const first = await f.host.execute(f.h.handle, f.request);
        expect(JSON.stringify(first)).not.toContain('NATIVE-OPAQUE-SENTINEL');
        const next = followup(f, first);
        expect(JSON.stringify(await f.host.execute(f.h.handle, next, undefined, undefined, { preview: true }))).not.toContain('NATIVE-OPAQUE-SENTINEL');
        const final = await f.host.execute(f.h.handle, next);
        expect(final.response.text).toBe('Fresh native final.');
        expect(f.requests[1].wire).toContain('NATIVE-OPAQUE-SENTINEL');
        expect(f.requests[1].wire).not.toContain('nativeCheckpointId');
        expect(final.response.observation).toMatchObject({ reportedModel: 'reported-alias', cachedInputTokens: null, upstreamIdentity: 'unknown', hiddenAttempts: 'unknown' });
        await expect(f.host.execute(f.h.handle, next, undefined, undefined, { preview: true })).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect(f.requests).toHaveLength(2);
    });
    test.each(['path', 'source', 'history', 'tools', 'forged'])('changed %s denies replay before HTTP', async change => {
        const f = await fixture(res => json(res, nativeResult(format, 1)), format);
        const first = await f.host.execute(f.h.handle, f.request); const next = followup(f, first);
        if (change === 'path') await f.persistence.saveConnectionProfile(f.h.handle, { ...f.connection, secretRef: { scope: 'player', secretId: 'different-account' } });
        if (change === 'source') { f.project.revision.revision = 'r2'; next.revision = 'r2'; }
        if (change === 'history') next.messages[0].content = 'Edited prior user message.';
        if (change === 'tools') next.tools = [];
        if (change === 'forged') next.messages[1].providerState = { ...first.response.providerState, checkpointId: 'a'.repeat(64) };
        await expect(f.host.execute(f.h.handle, next)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
        expect(f.requests).toHaveLength(1);
    });
    test('secret echoed in signed opaque content is denied', async () => {
        const f = await fixture(res => json(res, nativeResult(format, 1, 'g04-test-credential')), format);
        await expect(f.host.execute(f.h.handle, f.request)).rejects.toMatchObject({ code: 'generation_response_contains_secret' });
    });
});

test('Native Project consumes complete Responses opaque items and call IDs in order, while snapshots and preview disclose no opaque body', async () => {
    const f = await fixture((res, round) => json(res, result(round === 1 ? [envelope, functionCall] : [message('Fresh final text.')] )));
    const first = await f.host.execute(f.h.handle, f.request);
    expect(first.response.providerState).toHaveProperty('checkpointId');
    expect(JSON.stringify(first)).not.toContain('OPAQUE-STATE-SENTINEL');
    const next = followup(f, first);
    const preview = await f.host.execute(f.h.handle, next, undefined, undefined, { preview: true });
    expect(JSON.stringify(preview)).not.toContain('OPAQUE-STATE-SENTINEL');
    const second = await f.host.execute(f.h.handle, next);
    expect(second.response.text).toBe('Fresh final text.');
    const nativeInput = f.requests[1].body.input;
    expect(nativeInput.slice(-3)).toEqual([envelope, functionCall, { type: 'function_call_output', call_id: 'call-1', output: 'current evidence' }]);
    expect(f.requests[1].wire).not.toContain('nativeCheckpointId');
    expect(f.requests[1].body.store).toBe(false);
    expect(second.response.observation).toMatchObject({ reportedModel: 'reported-alias', upstreamIdentity: 'unknown', cachedInputTokens: 12, hiddenAttempts: 'unknown' });
    await expect(f.host.execute(f.h.handle, next, undefined, undefined, { preview: true })).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
    expect(f.requests).toHaveLength(2);
});

test.each(['path', 'source', 'history', 'tools', 'forged'])('changed %s rejects native envelope before a new HTTP send', async change => {
    const f = await fixture(res => json(res, result([envelope, functionCall])));
    const first = await f.host.execute(f.h.handle, f.request);
    const next = followup(f, first);
    if (change === 'path') await f.persistence.saveConnectionProfile(f.h.handle, { ...f.connection, secretRef: { scope: 'player', secretId: 'different-account' } });
    if (change === 'source') { f.project.revision.revision = 'r2'; next.revision = 'r2'; }
    if (change === 'history') next.messages[0].content = 'Edited prior user message.';
    if (change === 'tools') next.tools = [];
    if (change === 'forged') next.messages[1].providerState = { ...first.response.providerState, checkpointId: 'a'.repeat(64) };
    await expect(f.host.execute(f.h.handle, next)).rejects.toMatchObject({ code: 'generation_continuation_unavailable' });
    expect(f.requests).toHaveLength(1);
});

test.each(['valid', 'missing_terminal', 'missing_item_done', 'missing_opaque', 'incomplete'])('Responses stream %s only publishes a complete checkpoint', async kind => {
    const f = await fixture(res => {
        const output = kind === 'missing_opaque' ? [{ ...envelope, encrypted_content: null }, functionCall] : [envelope, functionCall];
        const completed = result(output); if (kind === 'incomplete') completed.status = 'incomplete';
        const events = output.map((item, output_index) => ({ type: 'response.output_item.done', output_index, item }));
        if (kind === 'missing_item_done') events.pop();
        if (kind !== 'missing_terminal') events.push({ type: 'response.completed', response: completed });
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''));
    });
    await f.library.commit(f.h.handle, 'core.generation-profile', { ...f.generation, revision: 'stream', streaming: { enabled: true } });
    await f.persistence.saveRuntimeRoute(f.h.handle, { ...f.routes[0], generationProfileRef: { ...f.routes[0].generationProfileRef, revision: 'stream' } });
    if (kind === 'valid') expect((await f.host.execute(f.h.handle, f.request)).response.providerState).toHaveProperty('checkpointId');
    else await expect(f.host.execute(f.h.handle, f.request)).rejects.toMatchObject({ code: 'generation_response_invalid' });
});

test('missing direct usage stays absent/unknown and secret echoed inside an opaque item is rejected', async () => {
    const f = await fixture((res, round) => {
        const body = result(round === 1 ? [message('No counters.')] : [{ ...envelope, encrypted_content: 'g04-test-credential' }, functionCall]);
        delete body.usage; delete body.model; json(res, body);
    });
    const first = await f.host.execute(f.h.handle, f.request);
    expect(first.response.usage).toBeUndefined();
    expect(first.response.observation).toMatchObject({ reportedModel: null, cachedInputTokens: null, upstreamIdentity: 'unknown' });
    await expect(f.host.execute(f.h.handle, { ...f.request, requestId: 'secret-echo' })).rejects.toMatchObject({ code: 'generation_response_contains_secret' });
});

test('negative reported cached tokens remain unknown', async () => {
    const f = await fixture(res => {
        const body = result([message('Done.')]); body.usage.input_tokens_details.cached_tokens = -1; json(res, body);
    });
    expect((await f.host.execute(f.h.handle, f.request)).response.observation.cachedInputTokens).toBeNull();
});
