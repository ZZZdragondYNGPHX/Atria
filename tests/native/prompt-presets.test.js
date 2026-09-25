import { describe, test, expect } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { createNativeId } from '../../src/native/identity.js';
import { PromptPresetStore } from '../../src/native/model-prompt-runtime/presets.js';
import { VersionedJsonResourceHandler } from '../../src/native/model-prompt-runtime/persistence.js';
import express from 'express';
import supertest from 'supertest';
import { createNativeGenerationRouter } from '../../src/endpoints/native-generation.js';

function fixture() {
    const module = { schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: createNativeId('revision'), displayName: 'Foundation', target: 'system.foundation', stages: ['stage.main'], body: 'Original' };
    const ref = { scope: 'library', resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: module.revision };
    const program = { schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: createNativeId('revision'), displayName: 'Author preset', stages: [{ stageId: 'stage.main', moduleRefs: [ref] }] };
    const generation = { schemaVersion: 1, generationProfileId: createNativeId('generationProfile'), revision: createNativeId('revision'), displayName: 'Settings', output: { maxTokens: 512 } };
    return { format: 'atria.prompt-preset', schemaVersion: 1, programId: program.promptProgramId, categories: [], moduleCategories: {}, entries: [{ resourceType: 'core.prompt-program', resource: program }, { resourceType: 'core.prompt-module', resource: module }, { resourceType: 'core.generation-profile', resource: generation }] };
}

describe('isolated Prompt presets', () => {
    test('Regex stays with each preset across duplicate imports, pinned revisions and deletion', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const store = new PromptPresetStore({ engine: h.engine }), library = new VersionedJsonResourceHandler({ engine: h.engine });
            const source = fixture();
            source.regexScripts = [{ id: 'same-id', scriptName: 'Preset rule', findRegex: 'before', replaceString: 'after', placement: [1] }];
            const a = await store.save(h.handle, source), b = await store.save(h.handle, source, { importing: true });
            const first = await store.get(h.handle, a.presetId), second = await store.get(h.handle, b.presetId);
            expect(first.regexScripts).toEqual(second.regexScripts);
            const pinned = first.refs.find(r => r.resourceId === a.presetId);
            first.regexScripts[0].replaceString = 'changed';
            const updated = await store.save(h.handle, first, { id: a.presetId, expectedRevision: first.revision });
            expect((await store.resolveRegex(h.handle, pinned)).regexScripts[0].replaceString).toBe('changed');
            expect((await store.get(h.handle, b.presetId)).regexScripts[0].replaceString).toBe('after');
            await expect(store.delete(h.handle, a.presetId, a.revision)).rejects.toThrow();
            await store.delete(h.handle, a.presetId, updated.revision);
            expect(await store.resolveRegex(h.handle, pinned)).toBeNull();
            expect((await library.getExact(h.handle, pinned)).snapshot.promptProgramId).toBe(a.presetId);
            expect(await store.list(h.handle)).toHaveLength(1);
            await expect(store.get(h.handle, a.presetId)).rejects.toThrow();
            source.regexScripts.push(source.regexScripts[0]);
            await expect(store.save(h.handle, source)).rejects.toThrow('duplicate Regex');
        } finally { await h.cleanup(); }
    });

    test('Regex HTTP resolves the narrator route owner and clears it on deletion', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const library = new VersionedJsonResourceHandler({ engine: h.engine });
            let routes = [];
            const app = express(); app.use(express.json());
            app.use((req, res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
            app.use(createNativeGenerationRouter(() => ({ library, persistence: { listRuntimeRoutes: async () => routes } })));
            await supertest(app).get('/regex-scopes').expect(401);
            expect((await supertest(app).get('/regex-scopes').set('x-user', h.handle).expect(200)).body.preset).toBeNull();
            const store = new PromptPresetStore({ engine: h.engine });
            const saved = await store.save(h.handle, fixture()); const preset = await store.get(h.handle, saved.presetId);
            routes = [{ runtimeRouteId: 'primary', role: 'role.narrator', promptProgramRef: preset.refs.find(r => r.resourceId === saved.presetId), fallbackRouteRefs: [] }];
            expect((await supertest(app).get('/regex-scopes').set('x-user', h.handle).expect(200)).body.preset.presetId).toBe(saved.presetId);
            routes.push({ ...routes[0], runtimeRouteId: 'second' });
            await supertest(app).get('/regex-scopes').set('x-user', h.handle).expect(400);
            await supertest(app).get('/regex-scopes?routeId=primary').set('x-user', h.handle).expect(200);
            await supertest(app).delete('/presets/' + saved.presetId).set('x-user', h.handle).send({ expectedRevision: 'stale' }).expect(409);
            await supertest(app).delete('/presets/' + saved.presetId).set('x-user', h.handle).send({ expectedRevision: saved.revision }).expect(200);
            expect((await supertest(app).get('/regex-scopes?routeId=primary').set('x-user', h.handle).expect(200)).body.preset).toBeNull();
        } finally { await h.cleanup(); }
    });

    test('imports independently, preserves partial classification and exports a complete editable closure', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const store = new PromptPresetStore({ engine: h.engine }), library = new VersionedJsonResourceHandler({ engine: h.engine });
            const source = fixture();
            const a = await store.save(h.handle, source, { importing: true });
            const b = await store.save(h.handle, source, { importing: true });
            let first = await store.get(h.handle, a.presetId); const second = await store.get(h.handle, b.presetId);
            expect(a.presetId).not.toBe(b.presetId);
            expect(first.categories[0].name).toBe('Author preset');
            expect(first.refs.every(r => !second.refs.some(s => r.resourceId === s.resourceId))).toBe(true);
            await expect(store.assertPair(h.handle, first.refs.find(r => r.resourceType === 'core.prompt-program'), second.refs.find(r => r.resourceType === 'core.generation-profile'))).rejects.toThrow('same Prompt preset');
            await store.assertPair(h.handle, first.refs.find(r => r.resourceType === 'core.prompt-program'), first.refs.find(r => r.resourceType === 'core.generation-profile'));
            const originalModule = first.entries.find(e => e.resourceType === 'core.prompt-module');
            await expect(library.commit(h.handle, originalModule.resourceType, originalModule.resource)).rejects.toThrow('preset');
            const oldRef = first.refs.find(r => r.resourceType === 'core.prompt-program');
            originalModule.resource.body = 'Changed only here';
            const update = await store.save(h.handle, first, { id: a.presetId, expectedRevision: first.revision });
            await expect(store.save(h.handle, first, { id: a.presetId, expectedRevision: first.revision })).rejects.toThrow();
            first = await store.get(h.handle, a.presetId);
            expect(update.revision).not.toBe(a.revision);
            expect((await store.get(h.handle, b.presetId)).entries.find(e => e.resourceType === 'core.prompt-module').resource.body).toBe('Original');
            expect((await library.getExact(h.handle, oldRef)).snapshot.stages[0].moduleRefs[0].revision).not.toBe(first.refs.find(r => r.resourceType === 'core.prompt-module').revision);
            first.categories = [{ id: 'a', name: 'Root', parentId: null }, { id: 'b', name: 'Child', parentId: 'a' }];
            first.moduleCategories = {}; // empty author categories survive the all-unclassified fallback
            const c = await store.save(h.handle, first, { importing: true });
            const copied = await store.get(h.handle, c.presetId);
            expect(copied.categories.slice(0, 2)).toEqual(first.categories);
            expect(copied.categories[2].name).toBe('Author preset');
            expect(Object.values(copied.moduleCategories)).toEqual([copied.categories[2].id]);
            const partial = fixture();
            const extra = fixture().entries[1]; partial.entries.push(extra);
            partial.categories = [{ id: 'a', name: 'Root', parentId: null }, { id: 'b', name: 'Nested', parentId: 'a' }];
            partial.moduleCategories = { [extra.resource.promptModuleId]: 'b' };
            const partialResult = await store.save(h.handle, partial, { importing: true });
            const partialCopy = await store.get(h.handle, partialResult.presetId);
            expect(partialCopy.categories).toEqual(partial.categories);
            expect(Object.values(partialCopy.moduleCategories)).toEqual(['b']);
            first.entries = first.entries.filter(e => e.resourceType !== 'core.prompt-module');
            first.entries.find(e => e.resourceType === 'core.prompt-program').resource.stages[0].moduleRefs = [];
            await store.save(h.handle, first, { id: first.presetId, expectedRevision: first.revision });
            expect((await store.get(h.handle, a.presetId)).entries).toHaveLength(2);
            expect((await library.getExact(h.handle, oldRef)).snapshot.stages[0].moduleRefs).toHaveLength(1);
            expect(await store.list(h.handle)).toHaveLength(4);
            await expect(store.get('another-user', a.presetId)).rejects.toThrow();
        } finally { await h.cleanup(); }
    });

    test('HTTP requires ownership and rejects stale writes while round-tripping exported presets', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const app = express(); app.use(express.json());
            app.use((req, res, next) => { if (req.headers['x-user']) req.user = { profile: { handle: req.headers['x-user'] } }; next(); });
            app.use(createNativeGenerationRouter(() => ({ library: new VersionedJsonResourceHandler({ engine: h.engine }) })));
            await supertest(app).get('/presets').expect(401);
            await supertest(app).post('/presets').send({ preset: fixture() }).expect(401);
            const created = await supertest(app).post('/presets').set('x-user', h.handle).send({ preset: fixture(), importing: true }).expect(200);
            const url = '/presets/' + created.body.presetId;
            await supertest(app).get(url).set('x-user', 'other-user').expect(404);
            const exported = await supertest(app).get(url).set('x-user', h.handle).expect(200);
            await supertest(app).put(url).set('x-user', h.handle).send({ preset: exported.body, expectedRevision: 'stale' }).expect(409);
            await supertest(app).put(url).set('x-user', h.handle).send({ preset: exported.body, expectedRevision: exported.body.revision }).expect(200);
            const imported = await supertest(app).post('/presets').set('x-user', h.handle).send({ preset: exported.body, importing: true }).expect(200);
            expect(imported.body.presetId).not.toBe(created.body.presetId);
        } finally { await h.cleanup(); }
    });

    test('rejects cycles, foreign references, duplicate generation profiles and mixed ownership without writes', async () => {
        const h = await makeTempFsEngineHarness();
        try {
            const store = new PromptPresetStore({ engine: h.engine });
            const source = fixture(); source.categories = [{ id: 'a', name: 'A', parentId: 'a' }];
            await expect(store.save(h.handle, source)).rejects.toThrow('cycle');
            source.categories = [];
            source.entries[0].resource.stages[0].moduleRefs[0].resourceId = createNativeId('promptModule');
            await expect(store.save(h.handle, source)).rejects.toThrow('inside');
            expect(await store.list(h.handle)).toEqual([]);
            const a = await store.save(h.handle, fixture()), b = await store.save(h.handle, fixture());
            const first = await store.get(h.handle, a.presetId), second = await store.get(h.handle, b.presetId);
            first.entries.push(second.entries.find(e => e.resourceType === 'core.prompt-module'));
            await expect(store.save(h.handle, first, { id: a.presetId, expectedRevision: a.revision })).rejects.toThrow('outside');
            const invalid = fixture(); invalid.entries.push(fixture().entries[2]);
            await expect(store.save(h.handle, invalid)).rejects.toThrow('one generation');
        } finally { await h.cleanup(); }
    });
});
