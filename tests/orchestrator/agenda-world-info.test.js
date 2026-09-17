import { test, expect, beforeAll, jest } from '@jest/globals';

globalThis.Luker = { getContext: () => ({ constants: { wiAnchor: { before: 0, after: 1 } } }) };
let resolve;
beforeAll(async () => { resolve = (await import('../../public/scripts/extensions/orchestrator/agenda-world-info.js')).resolveAgendaWorldInfo; });
const messages = [{ role: 'user', content: 'test' }];
function fixture() {
    const entries = ['main', '__MEMORY_GRAPH__', 'extra', 'chat', 'global', 'persona'].map(world => ({ world, content: `BOOK:${world}` }));
    return {
        characterId: 0, characters: [{ data: { extensions: { world: 'main' } } }],
        getCharaFilename: () => 'character', getCharaAuxWorlds: () => ['__MEMORY_GRAPH__', 'extra'],
        chatWorldInfo: { getNames: () => ['chat', 'chat2'], globalSelection: ['global', '__MEMORY_GRAPH__'] },
        resolveWorldInfoForMessages: jest.fn(async (_messages, options) => ({ worldInfoBeforeEntries: entries.filter(options.entryFilter).map(e => e.content) })),
    };
}
test('allows character bindings only, including an additional book also globally selected', async () => {
    const context = fixture();
    const debug = jest.spyOn(console, 'debug').mockImplementation(() => {});
    try {
        const result = await resolve(context, {}, messages);
        expect(result.worldInfoBeforeEntries).toEqual(['BOOK:main', 'BOOK:__MEMORY_GRAPH__', 'BOOK:extra']);
        expect(debug).toHaveBeenCalledWith('[orchestrator-agenda] World book bindings', { character_main: 1, character_additional: 2, chat_skipped: 2, global_skipped: 1 });
        const options = context.resolveWorldInfoForMessages.mock.calls[0][1];
        expect(options.fallbackToCurrentChat).toBe(false);
        expect(options.entryFilter({ world: 'persona' })).toBe(false);
        expect(options.entryFilter({})).toBe(false);
    } finally { debug.mockRestore(); }
});
test('uses binding identity rather than special book names', async () => {
    const context = fixture();
    context.getCharaAuxWorlds = () => ['global'];
    expect((await resolve(context, {}, messages)).worldInfoBeforeEntries).toEqual(['BOOK:main', 'BOOK:global']);
});
test('disabled world info does not invoke resolver', async () => {
    const context = fixture();
    expect(await resolve(context, { includeWorldInfoWithPreset: false }, messages)).toEqual({});
    expect(context.resolveWorldInfoForMessages).not.toHaveBeenCalled();
});
test('unbound character never falls back to chat/global books', async () => {
    const context = fixture(); context.characters = []; context.getCharaAuxWorlds = () => [];
    expect(await resolve(context, {}, messages)).toEqual({});
    expect(context.resolveWorldInfoForMessages).not.toHaveBeenCalled();
});
test('aborted resolution does not return a late snapshot', async () => {
    const context = fixture(), abort = new AbortController();
    context.resolveWorldInfoForMessages = async () => { abort.abort(); return {}; };
    await expect(resolve(context, {}, messages, 'quiet', abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
});
