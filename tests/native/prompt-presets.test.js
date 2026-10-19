import { promptStageModuleRefs } from '../../public/shared/prompt-module-order.js';
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
            await supertest(app).get('/prompt-scope').expect(401);
            expect((await supertest(app).get('/regex-scopes').set('x-user', h.handle).expect(200)).body.preset).toBeNull();
            const store = new PromptPresetStore({ engine: h.engine });
            const saved = await store.save(h.handle, fixture()); const preset = await store.get(h.handle, saved.presetId);
            routes = [{ runtimeRouteId: 'primary', role: 'role.narrator', promptProgramRef: preset.refs.find(r => r.resourceId === saved.presetId), fallbackRouteRefs: [] }];
            expect((await supertest(app).get('/regex-scopes').set('x-user', h.handle).expect(200)).body.preset.presetId).toBe(saved.presetId);
            expect((await supertest(app).get('/prompt-scope').set('x-user', h.handle).expect(200)).body.preset).toEqual({ presetId: saved.presetId, revision: saved.revision });
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
            expect(promptStageModuleRefs((await library.getExact(h.handle, oldRef)).snapshot.stages[0])[0].revision).not.toBe(first.refs.find(r => r.resourceType === 'core.prompt-module').revision);
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
            first.entries.find(e => e.resourceType === 'core.prompt-program').resource.stages[0].entries = [];
            await store.save(h.handle, first, { id: first.presetId, expectedRevision: first.revision });
            expect((await store.get(h.handle, a.presetId)).entries).toHaveLength(2);
            expect(promptStageModuleRefs((await library.getExact(h.handle, oldRef)).snapshot.stages[0])).toHaveLength(1);
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

test('one logical Module can retain multiple exact revisions through preset import, save and re-export', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const store = new PromptPresetStore({ engine: h.engine }), library = new VersionedJsonResourceHandler({ engine: h.engine });
        const source = fixture(), first = source.entries.find(entry => entry.resourceType === 'core.prompt-module');
        const second = { resourceType: first.resourceType, resource: { ...first.resource, revision: 'second', body: 'Second exact voice' } };
        source.entries.push(second);
        source.entries[0].resource.stages[0].moduleRefs.push({ scope: 'library', resourceType: second.resourceType, resourceId: second.resource.promptModuleId, revision: second.resource.revision });
        const saved = await store.save(h.handle, source, { importing: true });
        const imported = await store.get(h.handle, saved.presetId);
        const modules = imported.entries.filter(entry => entry.resourceType === 'core.prompt-module');
        expect(new Set(modules.map(entry => entry.resource.promptModuleId)).size).toBe(1);
        expect(new Set(modules.map(entry => entry.resource.revision)).size).toBe(2);
        const program = imported.entries.find(entry => entry.resourceType === 'core.prompt-program');
        const references = promptStageModuleRefs(program.resource.stages[0]);
        expect(await Promise.all(references.map(async ref => (await library.getExact(h.handle, ref)).snapshot.body))).toEqual(['Original', 'Second exact voice']);
        modules[1].resource.body = 'Private second voice';
        const changed = await store.save(h.handle, imported, { id: saved.presetId, expectedRevision: imported.revision });
        const next = await store.get(h.handle, saved.presetId);
        expect(next.entries.filter(entry => entry.resourceType === 'core.prompt-module').map(entry => entry.resource.body)).toEqual(['Original', 'Private second voice']);
        expect((await library.getExact(h.handle, references[1])).snapshot.body).toBe('Second exact voice');
        const origin = JSON.parse(next.entries.filter(entry => entry.resourceType === 'core.prompt-module')[1].resource.provenance.at(-1).ref);
        expect((await library.getExact(h.handle, origin.baseRef)).snapshot.body).toBe('Second exact voice');
        expect(next.programRevision).toBe(changed.revision);
        await expect(store.save(h.handle, next, { importing: true })).resolves.toHaveProperty('presetId');
    } finally { await h.cleanup(); }
});

test('same-identity parent and child Programs keep distinct revisions and the explicit main revision', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const store = new PromptPresetStore({ engine: h.engine }), library = new VersionedJsonResourceHandler({ engine: h.engine });
        const source = fixture(), parent = source.entries[0].resource;
        const child = { ...parent, revision: 'child', parentRef: { scope: 'library', resourceType: 'core.prompt-program', resourceId: parent.promptProgramId, revision: parent.revision }, stages: [{ stageId: 'stage.main', moduleRefs: [] }] };
        source.programRevision = child.revision; source.entries.push({ resourceType: 'core.prompt-program', resource: child });
        const saved = await store.save(h.handle, source, { importing: true }), value = await store.get(h.handle, saved.presetId);
        const root = await library.getCurrent(h.handle, 'core.prompt-program', saved.presetId);
        expect(root.snapshot.revision).toBe(value.programRevision);
        expect(root.snapshot.parentRef.resourceId).toBe(saved.presetId); expect(root.snapshot.parentRef.revision).not.toBe(value.programRevision);
        expect(promptStageModuleRefs((await library.getExact(h.handle, root.snapshot.parentRef)).snapshot.stages[0])).toHaveLength(1);
        await expect(store.save(h.handle, value, { id: saved.presetId, expectedRevision: saved.revision })).resolves.toHaveProperty('presetId');
    } finally { await h.cleanup(); }
});

test('upgraded unsaved dependency copies record a base revision that resolves after the Preset owns them', async () => {
    const h = await makeTempFsEngineHarness();
    try {
        const store = new PromptPresetStore({ engine: h.engine }), library = new VersionedJsonResourceHandler({ engine: h.engine });
        const saved = await store.save(h.handle, fixture()), preset = await store.get(h.handle, saved.presetId);
        const module = { ...preset.entries.find(entry => entry.resourceType === 'core.prompt-module').resource, promptModuleId: createNativeId('promptModule'), revision: 'new-copy', body: 'Upstream dependency' };
        const ref = { scope: 'library', resourceType: 'core.prompt-module', resourceId: module.promptModuleId, revision: module.revision };
        module.provenance = [{ source: 'atria.fork', ref: JSON.stringify({ source: ref, baseRef: ref }) }];
        preset.entries.push({ resourceType: 'core.prompt-module', resource: module });
        preset.entries.find(entry => entry.resourceType === 'core.prompt-program').resource.stages[0].entries.push({ entryId: 'upgraded', kind: 'module', moduleRef: ref });
        await store.save(h.handle, preset, { id: saved.presetId, expectedRevision: saved.revision });
        const next = await store.get(h.handle, saved.presetId), copy = next.entries.find(entry => entry.resource.promptModuleId === ref.resourceId);
        const origin = JSON.parse(copy.resource.provenance[0].ref);
        expect(origin.baseRef.revision).toBe(copy.resource.revision);
        expect((await library.getExact(h.handle, origin.baseRef)).snapshot.body).toBe('Upstream dependency');
    } finally { await h.cleanup(); }
});
