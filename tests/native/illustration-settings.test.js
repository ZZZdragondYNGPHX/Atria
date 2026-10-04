import express from 'express';
import request from 'supertest';
import { ExtensionsStore } from '../../src/native/extensions-store.js';
import { createNativeExtensionsRouter } from '../../src/endpoints/native-extensions.js';
import { defaultIllustrationSettings, assertIllustrationSettings, createIllustrationDraft, matchDrawingCharacters } from '../../public/shared/illustration-plugin-contract.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';

const character = (id, name = 'Alice', aliases = []) => ({ id, name, aliases, fixedPrompt: 'blue eyes', defaultClothing: 'coat', enabled: true, storyActorId: '' });
function preferences() {
    const settings = defaultIllustrationSettings(); settings.enabled = true;
    settings.characters = [character('alice', 'Alice', ['Al']), character('bob', 'Bob')];
    settings.works.book = { characterIds: ['alice'] }; return settings;
}
test('matching uses only enabled work characters, whole Latin names and explicit ambiguity', () => {
    const settings = preferences();
    expect(createIllustrationDraft('Alice在门前，Bob waits.', settings, 'book').draft.characters.map(item => item.character.id)).toEqual(['alice']);
    expect(createIllustrationDraft('Malice waits.', settings, 'book').draft.characters).toEqual([]);
    expect(createIllustrationDraft('She waits.', settings, 'book').draft.characters).toEqual([]);
    expect(createIllustrationDraft('Alice waits.', settings, 'other').draft.characters).toEqual([]);
    settings.characters[0].enabled = false;
    expect(createIllustrationDraft('Alice waits.', settings, 'book').draft.characters).toEqual([]);
    const matches = matchDrawingCharacters('ALICE waits.', [character('a', 'Alice', ['ALICE']), character('b', 'alice')], ['a', 'b']);
    expect(matches.matched).toEqual([]); expect(matches.ambiguous).toHaveLength(1); expect(matches.ambiguous[0].candidates).toHaveLength(2);
    const cjk = matchDrawingCharacters('小雨站在门口。', [character('rain', '小雨')], ['rain']); expect(cjk.matched[0].id).toBe('rain');
});
test('existing drafts freeze character and preset values; schema excludes secrets', () => {
    const settings = preferences(), { draft } = createIllustrationDraft('Alice', settings, 'book');
    draft.prompt = 'edited by user'; settings.characters[0].fixedPrompt = 'changed'; settings.preset.style = 'new style';
    expect(draft.characters[0].character.fixedPrompt).toBe('blue eyes'); expect(draft.preset.style).toBe(''); expect(draft.prompt).toBe('edited by user');
    expect(() => assertIllustrationSettings({ ...settings, secret: 'bad' })).toThrow();
    settings.preset.parameters.token = 'bad'; expect(() => assertIllustrationSettings(settings)).toThrow();
});
describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('Illustration preferences — %s', (_name, make) => {
    test('authenticated preferences persist with CAS, work isolation and independent extension settings', async () => {
        const h = await make();
        try {
            const store = new ExtensionsStore({ engine: h.engine }); const initial = await store.illustrationSettings(h.handle);
            expect(initial.value.enabled).toBe(false);
            const app = express(); app.use(express.json()); app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
            app.use(createNativeExtensionsRouter({ store: () => store }));
            await request(app).get('/official/illustration').expect(401);
            const saved = await request(app).put('/official/illustration').set('x-user', h.handle).send({ value: preferences(), expectedRevision: initial.revision }).expect(200);
            expect(saved.body.value.works.book.characterIds).toEqual(['alice']);
            await request(app).put('/official/illustration').set('x-user', h.handle).send({ value: preferences(), expectedRevision: initial.revision }).expect(409);
            expect((await new ExtensionsStore({ engine: h.engine }).illustrationSettings(h.handle)).revision).toBe(saved.body.revision);
            expect((await store.settings(h.handle)).value).toEqual({ schemaVersion: 1, folders: [], skills: {} });
            const invalid = preferences(); invalid.works.book.characterIds.push('missing');
            await request(app).put('/official/illustration').set('x-user', h.handle).send({ value: invalid, expectedRevision: saved.body.revision }).expect(400);
            expect((await store.illustrationSettings(h.handle)).revision).toBe(saved.body.revision);
            const other = await make();
            try { expect((await new ExtensionsStore({ engine: other.engine }).illustrationSettings(other.handle)).value).toEqual(defaultIllustrationSettings()); } finally { await other.cleanup(); }
        } finally { await h.cleanup(); }
    });
});
