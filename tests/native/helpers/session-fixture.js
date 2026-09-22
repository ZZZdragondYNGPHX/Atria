import {
    AssetStore, PackageInstaller, PackageRepo, SessionRepo, SavePointRepo, SessionCore,
    KnowledgeRepo, NativeSaveSystem, buildAtriaPackageContainer, createNativeId,
} from '../../../src/native/index.js';

export function knowledgeSnapshot(content = 'Exact knowledge') {
    const knowledgeBaseId = createNativeId('knowledgeBase');
    const knowledgeRevisionId = createNativeId('knowledgeRevision');
    const knowledgeEntryId = createNativeId('knowledgeEntry');
    return {
        knowledgeBase: { knowledgeBaseId, displayName: 'Knowledge', currentRevisionId: knowledgeRevisionId },
        revision: { knowledgeBaseId, knowledgeRevisionId, entryIds: [knowledgeEntryId], metadata: {} },
        entries: [{ knowledgeEntryId, content, metadata: {} }],
    };
}

export function bindingFor(snapshot, kind = 'package') {
    return { knowledgeBindingId: createNativeId('knowledgeBinding'), source: { kind,
        knowledgeBaseId: snapshot.knowledgeBase.knowledgeBaseId,
        knowledgeRevisionId: snapshot.revision.knowledgeRevisionId }, enabled: true, mode: 'augment', metadata: {} };
}

export function sessionFixture() {
    const knowledge = knowledgeSnapshot();
    const binding = bindingFor(knowledge);
    const worldId = createNativeId('world');
    const worldRevisionId = createNativeId('worldRevision');
    const entryPointId = createNativeId('entryPoint');
    const actorId = createNativeId('actor');
    const manifest = {
        format: 'atria-package', schemaVersion: 2, nativeSchemaVersion: 1,
        packageId: createNativeId('package'), packageVersionId: createNativeId('packageVersion'),
        name: 'Session Work', version: '1.0.0', actors: [{ actorId, displayName: 'Actor' }],
        entryPoints: [{ entryPointId, displayName: 'Start', actorIds: [actorId],
            worldIds: [worldId], primaryWorldId: worldId, knowledgeBindingIds: [],
            initialStateOverlay: { hp: 8 }, initialTimeline: [{ role: 'assistant', content: 'Opening', actorId }] }],
        worlds: [{ world: { worldId, displayName: 'World', currentRevisionId: worldRevisionId },
            revision: { worldId, worldRevisionId, baseline: { hp: 10, location: 'harbor' },
                knowledgeBindingIds: [binding.knowledgeBindingId], assetIds: [], metadata: {} } }],
        knowledge: [knowledge], knowledgeBindings: [binding], assets: [], capabilities: ['narrative', 'knowledge'], permissions: [],
    };
    return { manifest, knowledge, binding, worldId, worldRevisionId, entryPointId };
}

export function services(h, engine = h.engine) {
    const packageRepo = new PackageRepo({ engine });
    const assetStore = new AssetStore({ engine, directoriesByHandle: () => h.dirs });
    const packageInstaller = new PackageInstaller({ packageRepo, assetStore });
    const sessionRepo = new SessionRepo({ engine });
    const savePointRepo = new SavePointRepo({ engine });
    const knowledgeRepo = new KnowledgeRepo({ engine });
    const core = new SessionCore({ sessionRepo, savePointRepo, packageInstaller, knowledgeRepo });
    const saveSystem = new NativeSaveSystem({
        sessionCore: core,
        sessionRepo,
        savePointRepo,
        packageInstaller,
        assetStore,
        knowledgeRepo,
    });
    return {
        core,
        saveSystem,
        sessionRepo,
        savePointRepo,
        packageRepo,
        assetStore,
        packageInstaller,
        knowledgeRepo,
    };
}

export async function installFixture(h, fixture = sessionFixture(), svc = services(h)) {
    const { archive } = buildAtriaPackageContainer({ manifest: fixture.manifest,
        sourceFiles: new Map(), assetPayloads: new Map() });
    await svc.packageInstaller.install(h.handle, archive);
    return { ...fixture, ...svc, start: { packageId: fixture.manifest.packageId,
        packageVersionId: fixture.manifest.packageVersionId, entryPointId: fixture.entryPointId } };
}

export async function publishKnowledge(h, repo, snapshot, binding) {
    const { knowledgeBase, revision, entries } = snapshot;
    if (!await repo.get(h.handle, knowledgeBase.knowledgeBaseId)) {
        await repo.create(h.handle, { ...knowledgeBase, currentRevisionId: null });
    }
    await repo.commitRevision(h.handle, revision, entries);
    if (binding) await repo.saveBinding(h.handle, binding);
}
