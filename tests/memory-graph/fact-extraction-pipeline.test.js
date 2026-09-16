import { beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { TOOL_PROTOCOL_STYLE, validateParsedToolCalls } from '../../public/scripts/extensions/function-call-runtime.js';
import './_mocks/main-module-stack.js';
import { createEmptyStore } from '../../public/scripts/extensions/memory-graph/persistence.js';

jest.unstable_mockModule('../../public/scripts/extensions/function-call-runtime.js', () => ({ TOOL_PROTOCOL_STYLE, validateParsedToolCalls }));
let context;
let processBatch;
let disk;
beforeAll(async () => {
    const base = global.Luker.getContext();
    context = Object.assign(Object.create(base), {
        characterId: null, groupId: null, characters: [], chatMetadata: {},
        extensionSettings: { memory_graph: { memoryOsEnabled: true } },
        resolveChatStateTarget: () => ({ is_group: false, avatar_url: 'fact-test.png', file_name: 'facts' }),
    });
    global.Luker.getContext = () => context;
    const main = await import('../../public/scripts/extensions/memory-graph/main.js');
    processBatch = main._processPendingMessageBatchWithLLMForTest;
});
beforeEach(() => {
    disk = new Map();
    context.chat = [{ mes: 'Roland keeps the sword.', is_user: false }];
    context.saveChat = jest.fn(async () => {});
    context.getChatState = async namespace => ({ ok: true, state: structuredClone(disk.get(namespace) || null) });
    context.updateChatState = async (namespace, update) => {
        disk.set(namespace, structuredClone(update(disk.get(namespace)))); return { ok: true };
    };
});
function answer(request, excerptOverride) {
    const tail = request.taskMessages.at(-1).content;
    const marker = tail.indexOf('{"source_episodes"');
    // The fact context precedes optional per-type rules; consume the one JSON line.
    const payload = JSON.parse(tail.slice(marker).split('\n')[0]);
    const source = payload.source_episodes[0];
    return { toolCalls: [
        { name: 'luker_memory_facts', args: { operations: [{ action: 'create', type: 'explicit', text: 'Roland keeps the sword.',
            evidence: [{ episodeId: source.episodeId, excerpt: excerptOverride || source.content }] }] } },
        { name: 'luker_rpg_extract_done', args: {} },
    ] };
}
function run(settings = {}) {
    return processBatch(context, createEmptyStore(), { memoryOsEnabled: true, includeWorldInfoWithPreset: false, ...settings }, [],
        [{ ...context.chat[0], seq: 1, source_index: 0 }], 0, 0);
}
describe('production extraction dispatch with simulated model responses', () => {
    test('requests fact tools even without active legacy node types, then persists sourced facts', async () => {
        context.generateTask = jest.fn(async request => answer(request));
        await run();
        expect(context.generateTask.mock.calls[0][0].tools.some(tool => tool.function.name === 'luker_memory_facts')).toBe(true);
        const facts = Object.values(disk.get('memory_graph__provenance').facts);
        expect(facts).toHaveLength(1);
        expect(facts[0].status).toBe('active');
        await run();
        expect(Object.values(disk.get('memory_graph__provenance').facts)).toHaveLength(1);
    });
    test('invalid evidence triggers semantic retry and never persists fabricated excerpts', async () => {
        context.generateTask = jest.fn().mockImplementationOnce(async request => answer(request, 'invented quote'))
            .mockImplementation(async request => answer(request));
        await run({ toolCallRetryMax: 1 });
        expect(context.generateTask).toHaveBeenCalledTimes(2);
        expect(Object.values(disk.get('memory_graph__provenance').facts)[0].supports[0].evidence[0].excerpt).toBe('Roland keeps the sword.');
    });
    test('source edit while the model runs rejects the result before any fact is written', async () => {
        context.generateTask = jest.fn(async request => {
            const result = answer(request); context.chat[0].mes = 'Alice keeps the sword.'; return result;
        });
        await expect(run()).rejects.toThrow();
        expect(disk.get('memory_graph__provenance').facts).toBeUndefined();
    });
});
