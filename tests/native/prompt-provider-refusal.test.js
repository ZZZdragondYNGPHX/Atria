import { afterEach, expect, jest, test } from '@jest/globals';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { createResponsesGenerationProvider } from '../../src/native/adapters/responses-generation-provider.js';
import { createNativeMessagesProvider } from '../../src/native/adapters/native-messages-provider.js';
import { GenerationService } from '../../src/native/model-prompt-runtime/generation-service.js';
import { RouteResolver } from '../../src/native/model-prompt-runtime/route-resolver.js';
import { PromptCompiler } from '../../src/native/model-prompt-runtime/prompt-compiler.js';
import { createNativeId } from '../../src/native/identity.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

const cleanups = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
const blocked = { code: 'generation_provider_content_blocked' };
const usage = { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 };
const nativeUsage = { input_tokens: 3, output_tokens: 2, total_tokens: 5 };
const geminiUsage = { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 };
const response = value => ({ ok: true, headers: { get: () => 'application/json' }, json: async () => value });
const stream = events => ({ ok: true, headers: { get: () => 'text/event-stream' }, body: (async function* () {
    for (const event of events) yield new TextEncoder().encode('data: ' + JSON.stringify(event) + '\n\n');
})() });
const wrap = response => ({ response, sequence: [], binding: { continuity: 'none', protocol: 'fixture', executionScope: { kind: 'fixture' } } });
const refusalMessage = { type: 'message', role: 'assistant', content: [{ type: 'refusal', refusal: 'Structured upstream refusal' }] };

test.each([
    { choices: [{ message: { content: null, refusal: 'Structured upstream refusal' }, finish_reason: 'stop' }] },
    { choices: [{ message: { content: 'Partial' }, finish_reason: 'content_filter' }] },
])('Chat JSON explicit protocol refusal is a typed block, not an accepted empty or partial answer', raw => {
    expect(() => createHttpGenerationProvider().normalizeResponse(raw)).toThrow(expect.objectContaining(blocked));
});
test('Chat SSE retains refusal and finish-reason signals through final usage', async () => {
    const provider = createHttpGenerationProvider(), onUsage = jest.fn();
    for (const events of [
        [{ choices: [{ delta: { refusal: 'Structured ' } }] }, { choices: [{ delta: { refusal: 'refusal' }, finish_reason: 'stop' }] }, { usage }],
        [{ choices: [{ delta: { content: 'Partial' } }] }, { choices: [{ delta: {}, finish_reason: 'content_filter' }] }, { usage }],
    ]) {
        const raw = await provider.parseStream(stream(events), { onUsage });
        expect(provider.readUsage(raw)).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
        expect(() => provider.normalizeResponse(raw)).toThrow(expect.objectContaining(blocked));
    }
    expect(onUsage).toHaveBeenCalledTimes(2);
});
test('Responses JSON and SSE retain typed refusal parts/events and usage', async () => {
    const provider = createResponsesGenerationProvider();
    const value = { status: 'completed', output: [refusalMessage], usage: nativeUsage };
    const onUsage = jest.fn();
    for (const transport of [response(value), stream([
        { type: 'response.refusal.delta', delta: 'Structured upstream refusal' },
        { type: 'response.output_item.done', output_index: 0, item: refusalMessage },
        { type: 'response.completed', response: value },
    ])]) {
        const raw = await provider.parseStream(wrap(transport), { onUsage });
        expect(provider.readUsage(raw)).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
        expect(() => provider.normalizeResponse(raw)).toThrow(expect.objectContaining(blocked));
    }
    expect(onUsage).toHaveBeenCalledTimes(1);
});
test('Anthropic JSON and streaming classifier refusal are typed; final usage is retained', async () => {
    const provider = createNativeMessagesProvider({ format: 'anthropic' });
    const onUsage = jest.fn();
    for (const transport of [response({ content: [], stop_reason: 'refusal', usage: nativeUsage }), stream([
        { type: 'message_start', message: { usage: { input_tokens: 3 } } },
        { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 2 } },
        { type: 'message_stop' },
    ])]) {
        const raw = await provider.parseStream(wrap(transport), { onUsage });
        expect(provider.readUsage(raw)).toEqual({ inputTokens: 3, outputTokens: 2 });
        expect(() => provider.normalizeResponse(raw)).toThrow(expect.objectContaining(blocked));
    }
    expect(onUsage.mock.calls.at(-1)[0]).toEqual({ inputTokens: 3, outputTokens: 2 });
});
test.each(['prompt', 'candidate'])('Gemini explicit %s content blocks survive JSON and SSE, without treating OTHER as a content verdict', async where => {
    const provider = createNativeMessagesProvider({ format: 'gemini' });
    const value = where === 'prompt' ? { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: geminiUsage }
        : { candidates: [{ finishReason: 'PROHIBITED_CONTENT', content: { parts: [] } }], usageMetadata: geminiUsage };
    for (const transport of [response(value), stream([value])]) {
        const raw = await provider.parseStream(wrap(transport));
        expect(provider.readUsage(raw)).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
        expect(() => provider.normalizeResponse(raw)).toThrow(expect.objectContaining(blocked));
    }
    for (const blockReason of ['OTHER', 'BLOCK_REASON_UNSPECIFIED', 'UNKNOWN']) {
        expect(() => provider.normalizeResponse({ value: { promptFeedback: { blockReason } } })).toThrow(expect.objectContaining({ code: 'generation_response_invalid' }));
    }
});
test('ordinary apology prose is not a Provider verdict, and unrelated truncation remains invalid', () => {
    const chat = createHttpGenerationProvider();
    expect(chat.normalizeResponse({ choices: [{ message: { content: '抱歉，我需要更多资料。', refusal: null }, finish_reason: 'stop' }] }).text).toContain('抱歉');
    expect(() => chat.normalizeResponse({ choices: [{ message: { content: 'Partial' }, finish_reason: 'length' }] })).toThrow(expect.objectContaining({ code: 'generation_response_invalid' }));
    const responses = createResponsesGenerationProvider();
    expect(() => responses.normalizeResponse({ value: { status: 'incomplete', output: [], incomplete_details: { reason: 'max_output_tokens' } } })).toThrow(expect.objectContaining({ code: 'generation_response_invalid' }));
    expect(() => createNativeMessagesProvider({ format: 'anthropic' }).normalizeResponse({ value: { content: [], stop_reason: 'max_tokens' } })).toThrow(expect.objectContaining({ code: 'generation_response_invalid' }));
});

test.each(['automatic', 'confirm', 'disabled'])('real Chat adapter block settles usage once and never retries or falls back in %s mode', async fallbackMode => {
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, roles: ['writer'], endpoint: 'https://fixture.invalid/v1/chat/completions' });
    const fallback = { ...seeded.routes[0], runtimeRouteId: createNativeId('runtimeRoute') };
    await seeded.persistence.saveRuntimeRoute(h.handle, fallback);
    const first = { ...seeded.routes[0], fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }] };
    await seeded.persistence.saveRuntimeRoute(h.handle, first);
    const fetchImpl = jest.fn(async () => fallbackMode === 'automatic' ? stream([
        { choices: [{ delta: { refusal: 'Structured refusal' }, finish_reason: 'stop' }] }, { usage },
    ]) : response({ choices: [{ message: { content: null, refusal: 'Structured refusal' }, finish_reason: 'stop' }], usage }));
    const settleAttempt = jest.fn();
    const provider = { ...createHttpGenerationProvider({ fetchImpl }), countTokens: () => 5, settleAttempt };
    const resolver = new RouteResolver({ persistence: seeded.persistence, library: seeded.library, providers: { 'provider.openai-compatible': provider } });
    const compiler = new PromptCompiler();
    const service = new GenerationService({ resolver, preparePrompt: compiler.preparePrompt, secretPort: { resolveSecret: async () => 'fixture-credential' },
        contextProvider: { buildRequestContextPlan: async request => ({ schemaVersion: 1, requestId: request.requestId,
            source: { kind: 'task', projectId: createNativeId('project'), revision: 'r1', taskId: 'refusal-task' },
            items: [{ kind: 'context.input', content: 'Review this authorized fictional scene.' }], budget: { maxTokens: 14000, reservedOutputTokens: 512 }, provenance: [] }) } });
    await expect(service.execute({ handle: h.handle, requestId: 'refusal-1', role: 'role.writer', routeRef: { scope: 'player', runtimeRouteId: first.runtimeRouteId }, fallbackMode })).rejects.toMatchObject(blocked);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(settleAttempt).toHaveBeenCalledTimes(1);
    expect(settleAttempt).toHaveBeenCalledWith({ inputTokens: 3, outputTokens: 2, totalTokens: 5 });
});

test.each(['openai-responses', 'anthropic', 'gemini'].flatMap(format => [false, true].map(streaming => [format, streaming])))('%s stream=%s content block settles its actual wrapper usage and sends once', async (format, streaming) => {
    const h = await makeTempFsEngine(); cleanups.push(h.cleanup);
    const seeded = await seedGenerationProfiles({ ...h, format, streaming, roles: ['writer'], endpoint: 'https://fixture.invalid/v1' });
    const fallback = { ...seeded.routes[0], runtimeRouteId: createNativeId('runtimeRoute') };
    await seeded.persistence.saveRuntimeRoute(h.handle, fallback);
    const first = { ...seeded.routes[0], fallbackRouteRefs: [{ scope: 'player', runtimeRouteId: fallback.runtimeRouteId }] };
    await seeded.persistence.saveRuntimeRoute(h.handle, first);
    const value = format === 'openai-responses' ? { status: 'completed', output: [refusalMessage], usage: nativeUsage }
        : format === 'anthropic' ? { content: [], stop_reason: 'refusal', usage: nativeUsage }
            : { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: geminiUsage };
    const events = format === 'openai-responses' ? [
        { type: 'response.refusal.done', refusal: 'Structured upstream refusal' },
        { type: 'response.output_item.done', output_index: 0, item: refusalMessage },
        { type: 'response.completed', response: value },
    ] : format === 'anthropic' ? [
        { type: 'message_start', message: { usage: { input_tokens: 3 } } },
        { type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 2 } },
        { type: 'message_stop' },
    ] : [value];
    const fetchImpl = jest.fn(async () => streaming ? stream(events) : response(value));
    const settleAttempt = jest.fn();
    const transport = format === 'openai-responses' ? createResponsesGenerationProvider({ fetchImpl }) : createNativeMessagesProvider({ format, fetchImpl });
    const provider = { ...transport, countTokens: () => 5, settleAttempt };
    const resolver = new RouteResolver({ persistence: seeded.persistence, library: seeded.library, providers: { ['provider.' + format]: provider } });
    const compiler = new PromptCompiler();
    const service = new GenerationService({ resolver, preparePrompt: compiler.preparePrompt, secretPort: { resolveSecret: async () => 'fixture-credential' },
        contextProvider: { buildRequestContextPlan: async request => ({ schemaVersion: 1, requestId: request.requestId,
            source: { kind: 'task', projectId: createNativeId('project'), revision: 'r1', taskId: 'refusal-task' },
            items: [{ kind: 'context.input', content: 'Review this authorized fictional scene.' }], budget: { maxTokens: 14000, reservedOutputTokens: 512 }, provenance: [] }) } });
    await expect(service.execute({ handle: h.handle, requestId: 'refusal-1', role: 'role.writer', routeRef: { scope: 'player', runtimeRouteId: first.runtimeRouteId }, fallbackMode: 'automatic' })).rejects.toMatchObject(blocked);
    expect(fetchImpl).toHaveBeenCalledTimes(1); expect(settleAttempt).toHaveBeenCalledTimes(1);
    expect(settleAttempt).toHaveBeenCalledWith({ inputTokens: 3, outputTokens: 2, ...(format === 'anthropic' ? {} : { totalTokens: 5 }) });
});
