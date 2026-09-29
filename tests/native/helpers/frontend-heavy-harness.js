import { heavyFixture, seedHeavySession } from './frontend-heavy-fixture.js';
import { services } from './session-fixture.js';
import { seedGenerationProfiles } from './generation-fixture.js';
import { ProjectStore, WorldRepo, createNativeId } from '../../../src/native/index.js';
import { buildProjectPackage } from '../../../src/native/package-composition.js';
import { inspectAtriaPackageContainer } from '../../../src/native/package-container.js';
import { resolveNativeRuntimePackage, readFrontendRuntimeResource } from '../../../src/native/runtime-descriptor.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../../src/native/adapters/http-generation-provider.js';

export async function buildHeavyFixture(h, mode) {
    const fixture = heavyFixture(mode), svc = services(h), manifest = fixture.manifest;
    const projectId = createNativeId('project'), projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
    const runtime = structuredClone(manifest.runtime);
    runtime.experience.frontend = { kind: 'native', version: 3, source: 'frontend.json' };
    const source = { format: 'atria-project-source', schemaVersion: 1,
        project: { projectId, packageId: manifest.packageId, displayName: manifest.name },
        package: { name: manifest.name, version: manifest.version, actors: manifest.actors, capabilities: manifest.capabilities, permissions: manifest.permissions, entryPoints: manifest.entryPoints, runtime },
        worlds: manifest.worlds, knowledge: manifest.knowledge, knowledgeBindings: manifest.knowledgeBindings.map(binding => ({ ...binding, source: { ...binding.source, kind: 'project' } })),
        resources: manifest.resources.map(({ resourceType, resource }) => ({ resourceType, resource })), dependencies: {}, assetFiles: [] };
    await projectStore.create(h.handle, source);
    for (const [path, bytes] of fixture.sourceFiles) await projectStore.writeFile(h.handle, projectId, path, bytes);
    const built = await buildProjectPackage({ handle: h.handle, projectId, projectStore, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: svc.knowledgeRepo, assetStore: svc.assetStore });
    await svc.packageInstaller.install(h.handle, built.archive);
    const installed = await svc.packageInstaller.open(h.handle, manifest.packageId, built.manifest.packageVersionId);
    const resolved = resolveNativeRuntimePackage(installed, fixture.entryPointId);
    fixture.manifest = built.manifest;
    fixture.files = inspectAtriaPackageContainer(built.archive).sourceFiles;
    // Browser fixtures are read through the installed, hash-checked resource API.
    const files = new Map([resolved.runtime.experience.frontend.entry, ...resolved.frontendGraph.resources.map(ref => ref.path)].map(path => [path, readFrontendRuntimeResource(installed, resolved, path).bytes]));
    fixture.compiled = { entry: resolved.runtime.experience.frontend.entry, files };
    return { fixture, svc, built, installed, resolved, projectId };
}

export async function heavySession(h, built) {
    const { svc, fixture } = built;
    const base = await seedHeavySession(svc, h, fixture);
    const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/forbidden' });
    const metrics = { providerCalls: 0, deterministicExecutions: 0 };
    const provider = { ...createHttpGenerationProvider(), send() { metrics.providerCalls++; throw new Error('Heavy acceptance must never send to a provider'); } };
    const generation = new NativeGenerationHost({ ...seeded, sessionCore: svc.core, packageInstaller: svc.packageInstaller, providers: { 'provider.openai-compatible': provider } });
    // Keep executeTask, Task scheduler, typed finalization and SessionCore real.
    // Replace only model execution with deterministic output, not a provider.
    generation.execute = async (_owner, _input, signal, onChunk) => {
        metrics.deterministicExecutions++;
        onChunk?.({ text: 'Provisional district summary' });
        await new Promise(resolve => setTimeout(resolve, 30));
        if (signal?.aborted) throw new Error('cancelled');
        return { response: { jsonData: { text: 'District summary ready' } }, snapshot: { contextPlan: {}, promptProgramRef: {}, generationProfileRef: {}, runtimeRouteId: seeded.routes[0].runtimeRouteId } };
    };
    svc.generationHost = generation;
    svc.taskBindings = async () => ({ structured: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } });
    return { base, metrics, generation };
}
