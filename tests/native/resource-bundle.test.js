import { expect, test, jest } from '@jest/globals';
import { createHash } from 'node:crypto';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { WorldRepo, KnowledgeRepo, AssetStore, ProjectStore, PackageRepo, VersionedJsonResourceHandler, PackageInstaller, buildProjectPackage, createNativeId } from '../../src/native/index.js';
import { NativeLibraryService } from '../../src/native/authoring/library-service.js';
import { createCoreResourceRegistry } from '../../src/native/authoring/resource-registry.js';
import { ResourceBundleService } from '../../src/native/resource-bundle.js';
import { createCoreBundleAdapters } from '../../src/native/resource-bundle-adapters.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
const ref = (type, id, revision) => ({ resourceType: type, resourceId: id, revision, scope: 'library' });
async function setup() {
    const h = await makeTempFsEngine(); const options = { worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), projectStore: new ProjectStore({ directoriesByHandle: () => h.dirs }),
        packageRepo: new PackageRepo({ engine: h.engine }), versionedJsonResources: new VersionedJsonResourceHandler({ engine: h.engine }) };
    options.library = new NativeLibraryService(options); const adapters = createCoreBundleAdapters(options); const service = new ResourceBundleService({ registry: createCoreResourceRegistry(), adapters });
    return { h, options, adapters, service };
}
async function seedWorld({ h, options: o }) {
    const kb = createNativeId('knowledgeBase'), kv = createNativeId('knowledgeRevision'), entries = [{ knowledgeEntryId: createNativeId('knowledgeEntry'), content: 'Harbor', metadata: {} }, { knowledgeEntryId: createNativeId('knowledgeEntry'), content: 'Map', metadata: {} }];
    entries[1].relations = { requiredEntryIds: [entries[0].knowledgeEntryId] };
    await o.knowledgeRepo.commitRevision(h.handle, { knowledgeBaseId: kb, knowledgeRevisionId: kv, entryIds: entries.map(item => item.knowledgeEntryId), metadata: {} }, entries, { createRoot: { knowledgeBaseId: kb, displayName: 'Harbor knowledge', currentRevisionId: null } });
    const binding = createNativeId('knowledgeBinding'); await o.knowledgeRepo.saveBinding(h.handle, { knowledgeBindingId: binding, source: { kind: 'library', knowledgeBaseId: kb, knowledgeRevisionId: kv }, enabled: true, mode: 'augment', metadata: {} });
    const asset = createNativeId('asset'), bytes = Buffer.from('media'); await o.assetStore.put(h.handle, { assetId: asset, contentHash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length, mediaType: 'text/plain' }, bytes);
    const world = createNativeId('world'), revision = createNativeId('worldRevision'); await o.worldRepo.commitRevision(h.handle, { worldId: world, worldRevisionId: revision, knowledgeBindingIds: [binding], assetIds: [asset], baseline: { region: 'Harbor' }, metadata: {} }, { createRoot: { worldId: world, displayName: 'Harbor', currentRevisionId: null } });
    return ref('core.world', world, revision);
}
test('World bundle freezes exact Knowledge/Binding/asset closure and imports fresh identities idempotently', async () => {
    const env = await setup(); const { h, service, options } = env;
    try {
        const original = await seedWorld(env), bundle = await service.export(h.handle, original); expect(bundle.resources).toHaveLength(4);
        const plan = await service.preflight(h.handle, bundle); expect(plan.canImport).toBe(true); expect(plan.existingOrigins).toHaveLength(4);
        const result = await service.import(h.handle, bundle, plan.token); expect(result.root.resourceId).not.toBe(original.resourceId);
        const world = await options.library.getExact(h.handle, result.root), binding = await options.knowledgeRepo.getBinding(h.handle, world.snapshot.revision.knowledgeBindingIds[0]);
        const entries = await options.knowledgeRepo.listEntries(h.handle, binding.source.knowledgeBaseId, binding.source.knowledgeRevisionId);
        expect(entries[1].relations.requiredEntryIds).toEqual([entries[0].knowledgeEntryId]); expect(world.snapshot.revision.metadata.atriaResourceBundle.source).toEqual(original);
        expect(await service.import(h.handle, bundle, plan.token)).toEqual(result); expect(await options.worldRepo.list(h.handle)).toHaveLength(2);
        expect((await options.library.getExact(h.handle, original)).snapshot.revision.baseline).toEqual({ region: 'Harbor' });
    } finally { h.cleanup(); }
});
test('Prompt bundle rewrites exact parent/module closure and derive IDs while preserving originals', async () => {
    const env = await setup(); const { h, service, options: o } = env;
    try {
        const module = { schemaVersion: 1, promptModuleId: createNativeId('promptModule'), revision: 'r1', displayName: 'Voice', target: 'system.foundation', stages: ['stage.main'], body: '{{module.tone}}', parameters: { tone: { type: 'string', default: 'quiet' } } };
        const mr = ref('core.prompt-module', module.promptModuleId, module.revision);
        const parent = { schemaVersion: 1, promptProgramId: createNativeId('promptProgram'), revision: 'r1', displayName: 'Parent', stages: [{ stageId: 'stage.main', moduleRefs: [mr] }] };
        const pr = ref('core.prompt-program', parent.promptProgramId, parent.revision);
        const child = { ...parent, promptProgramId: createNativeId('promptProgram'), parentRef: pr, stages: [{ stageId: 'stage.extra', moduleRefs: [] }], derive: [{ op: 'configure', moduleId: module.promptModuleId, config: { tone: 'warm' } }] };
        for (const [type, value] of [['core.prompt-module', module], ['core.prompt-program', parent], ['core.prompt-program', child]]) await o.versionedJsonResources.commit(h.handle, type, value);
        const bundle = await service.export(h.handle, ref('core.prompt-program', child.promptProgramId, 'r1')), plan = await service.preflight(h.handle, bundle);
        const result = await service.import(h.handle, bundle, plan.token), value = (await o.library.getExact(h.handle, result.root)).snapshot;
        const importedParent = (await o.library.getExact(h.handle, value.parentRef)).snapshot;
        expect(value.derive[0].moduleId).toBe(importedParent.stages[0].moduleRefs[0].resourceId); expect(value.derive[0].moduleId).not.toBe(module.promptModuleId);
        expect((await o.library.getExact(h.handle, pr)).snapshot.stages[0].moduleRefs).toEqual([mr]);
    } finally { h.cleanup(); }
});
test('preflight rejects corruption, missing closure, unreachable nodes and player configuration before writes', async () => {
    const env = await setup(); const { h, service } = env;
    try {
        const bundle = await service.export(h.handle, await seedWorld(env)); const broken = structuredClone(bundle); broken.resources[0].data.entries[0].content = 'tampered'; await expect(service.preflight(h.handle, broken)).rejects.toThrow('corrupted');
        const missing = structuredClone(bundle); missing.resources.shift(); await expect(service.preflight(h.handle, missing)).rejects.toThrow('missing');
        const privateData = structuredClone(bundle); privateData.resources[0].data.revision.metadata.secretRef = { secretId: 'player-key' }; privateData.resources[0].integrity = hashNativeDocument(privateData.resources[0].data); await expect(service.preflight(h.handle, privateData)).rejects.toThrow('player configuration');
        const unreachable = structuredClone(bundle); unreachable.root = unreachable.resources[0].ref; await expect(service.preflight(h.handle, unreachable)).rejects.toThrow('unreachable');
        const asset = structuredClone(bundle); const node = asset.resources.find(item => item.ref.resourceType === 'core.asset'); node.data.data = Buffer.from('bad').toString('base64'); node.integrity = hashNativeDocument(node.data); await expect(service.preflight(h.handle, asset)).rejects.toThrow('integrity');
        const plan = await service.preflight(h.handle, bundle); await expect(service.import(h.handle, bundle, { ...plan.token, bundleHash: 'changed' })).rejects.toThrow('no longer matches');
    } finally { h.cleanup(); }
});
test('interrupted imports report partial progress and resume the same identities without overwriting conflicts', async () => {
    const env = await setup(); const { h, service, adapters, options } = env;
    try {
        const bundle = await service.export(h.handle, await seedWorld(env)), plan = await service.preflight(h.handle, bundle);
        const adapter = adapters.get('core.world'), write = adapter.write; adapter.write = jest.fn().mockRejectedValueOnce(new Error('disk unavailable')).mockImplementation(write);
        await expect(service.import(h.handle, bundle, plan.token)).rejects.toMatchObject({ code: 'native_resource_bundle_interrupted', details: { retryable: true } });
        await expect(service.import(h.handle, bundle, plan.token)).resolves.toMatchObject({ root: plan.root });
        expect(await options.worldRepo.list(h.handle)).toHaveLength(2);
        const target = plan.resources.find(item => item.ref.resourceType === 'core.knowledge-binding');
        await options.knowledgeRepo.saveBinding(h.handle, { ...target.data, enabled: false });
        expect((await service.preflight(h.handle, bundle, plan.token)).conflicts).toHaveLength(1);
        await expect(service.import(h.handle, bundle, plan.token)).rejects.toMatchObject({ code: 'native_resource_bundle_conflict' });
    } finally { h.cleanup(); }
});

test('Project and installed Package resources use verified exact closures, including Generation', async () => {
    const env = await setup(), target = await setup(); const { h, options: o, service } = env;
    try {
        const world = await seedWorld(env), snapshot = (await o.library.getExact(h.handle, world)).snapshot;
        const generation = { schemaVersion: 1, generationProfileId: createNativeId('generationProfile'), revision: 'r1', displayName: 'Portable generation', output: { maxTokens: 512 } };
        const projectId = createNativeId('project'), packageId = createNativeId('package');
        const source = { format: 'atria-project-source', schemaVersion: 1, project: { projectId, packageId, displayName: 'Portable' },
            package: { name: 'Portable', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [], entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [world.resourceId], knowledgeBindingIds: [] }] },
            worlds: [snapshot], knowledge: [], knowledgeBindings: [], assetFiles: [], resources: [{ resourceType: 'core.generation-profile', resource: generation }],
            dependencies: { worlds: [], knowledge: [], knowledgeBindings: snapshot.revision.knowledgeBindingIds, assets: snapshot.revision.assetIds.map(assetId => ({ assetId, contentHash: createHash('sha256').update('media').digest('hex') })), resources: [] } };
        await o.projectStore.create(h.handle, source);
        const projectBundle = await service.export(h.handle, { ...world, scope: 'project', projectId });
        expect(projectBundle.resources).toHaveLength(4);
        const built = await buildProjectPackage({ handle: h.handle, projectId, ...o });
        await new PackageInstaller({ packageRepo: target.options.packageRepo, assetStore: target.options.assetStore }).install(target.h.handle, built.archive);
        const packageRef = { ...world, scope: 'package', packageId, packageVersionId: built.manifest.packageVersionId };
        const portable = await target.service.export(target.h.handle, packageRef);
        expect(portable.resources.every(item => item.ref.scope === 'package')).toBe(true);
        const plan = await target.service.preflight(target.h.handle, portable);
        await expect(target.service.import(target.h.handle, portable, plan.token)).resolves.toMatchObject({ root: plan.root });
        const generationBundle = await target.service.export(target.h.handle, { ...packageRef, resourceType: 'core.generation-profile', resourceId: generation.generationProfileId, revision: 'r1' });
        const gp = await target.service.preflight(target.h.handle, generationBundle);
        await target.service.import(target.h.handle, generationBundle, gp.token);
        expect((await target.options.library.getExact(target.h.handle, gp.root)).snapshot.output.maxTokens).toBe(512);
        await expect(target.service.export(target.h.handle, { ...packageRef, revision: 'missing' })).rejects.toMatchObject({ name: 'NotFoundError' });
    } finally { h.cleanup(); target.h.cleanup(); }
});

test('registered plugin adapters share closure validation and reject cycles without writing', async () => {
    const registry = createCoreResourceRegistry(); registry.register({ resourceType: 'plugin.test', displayName: 'Test resource', provider: { kind: 'core' }, authority: 'native-library', capabilities: ['read', 'create'], schema: { type: 'object' } });
    const resource = ref('plugin.test', 'item_a', 'r1'), data = { value: 'Portable plugin', deps: [] }, values = new Map();
    const adapter = { read: async (_handle, reference) => { if (reference.resourceId === 'item_a') return data; if (values.has(reference.resourceId)) return values.get(reference.resourceId); const e = new Error('missing'); e.name = 'NotFoundError'; throw e; },
        dependencies: async (_h, _r, value) => value.deps, validate: (_r, value) => { if (typeof value.value !== 'string') throw new TypeError('Invalid plugin resource'); },
        rewrite: (item, context) => ({ ref: { ...item.ref, resourceId: context.id('world', item.ref.resourceId) }, data: { ...item.data, origin: item.ref } }),
        inspect: async (_h, r) => values.has(r.resourceId) ? 'same' : 'new', write: async (_h, r, value) => values.set(r.resourceId, value) };
    const service = new ResourceBundleService({ registry, adapters: new Map([['plugin.test', adapter]]) });
    const bundle = await service.export('user', resource), plan = await service.preflight('user', bundle);
    await Promise.all([service.import('user', bundle, plan.token), service.import('user', bundle, plan.token)]); expect(values.size).toBe(1);
    data.deps = [resource]; await expect(service.export('user', resource)).rejects.toThrow('cycle');
    const cyclic = structuredClone(bundle); cyclic.resources[0].data.deps = [resource]; cyclic.resources[0].dependencies = [resource]; cyclic.resources[0].integrity = hashNativeDocument(cyclic.resources[0].data);
    await expect(service.preflight('user', cyclic)).rejects.toThrow('cycle'); expect(values.size).toBe(1);
    expect(() => service.registerAdapter('unknown.type', adapter)).toThrow('registered');
});
