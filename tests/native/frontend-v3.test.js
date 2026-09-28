import { describe, expect, test } from '@jest/globals';
import { compileFrontend, compileProjectFrontends } from '../../src/native/frontend/compiler.js';
import { parseAui } from '../../src/native/frontend/aui-parser.js';
import { validateFrontendGraph } from '../../src/native/frontend/graph.js';
import { canonicalJson, hash, compileBridge, validateCompiledBridge } from '../../src/native/frontend/bridge.js';
import { assertFrontendExperience, frontendFeatureAvailability } from '../../public/shared/native-frontend-contract.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { validateFrontendResources } from '../../src/native/experience-validation.js';
import { assertAtriaProjectSource } from '../../src/native/project-source.js';
import { buildProjectPackage, PackageInstaller } from '../../src/native/package-composition.js';
import { buildAtriaPackageContainer, inspectAtriaPackageContainer } from '../../src/native/package-container.js';
import { StudioPreviewHost } from '../../src/native/studio-preview.js';
import { resolveNativeRuntimePackage, readFrontendRuntimeResource } from '../../src/native/runtime-descriptor.js';
import { ProjectStore, WorldRepo, KnowledgeRepo, AssetStore, PackageRepo, createNativeId } from '../../src/native/index.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';

const sourcePath = 'frontend/frontend.json';
const template = '<!-- kept -->\n<template><main node-id="root"><p node-id="greeting">Hello &amp; welcome</p></main></template>\n<style>main { color: red; }</style>';
function fixture() {
    const index = { format: 'atria-frontend-source', version: 3, primaryView: 'main',
        views: [{ id: 'main', root: 'Main', surface: 'app.root' }], components: [{ id: 'Main', source: 'Main.aui' }] };
    const files = new Map([[sourcePath, Buffer.from(JSON.stringify(index))], ['frontend/Main.aui', Buffer.from(template)]]);
    return { index, files };
}
const compile = files => compileFrontend({ source: sourcePath, files, mode: 'full' });
const validate = result => validateFrontendGraph({ ...result, mode: 'full' });
const sourceExperience = { mode: 'full', frontend: { kind: 'native', version: 3, source: sourcePath } };
function mutateIr(result, kind, change) {
    const index = JSON.parse(result.files.get(result.entry));
    const ref = index.resources.find(item => item.kind === kind);
    const ir = JSON.parse(result.files.get(ref.path)); change(ir);
    const bytes = Buffer.from(canonicalJson(ir));
    ref.contentHash = hash(bytes); ref.size = bytes.length;
    ref.path = ref.path.replace(/[a-f0-9]{64}/, ref.contentHash);
    result.files.set(ref.path, bytes);
    result.files.set(result.entry, Buffer.from(canonicalJson(index)));
}

describe('Native Frontend v3 compiler skeleton', () => {
    test('minimal source produces deterministic exact IR with source spans and stable identities', () => {
        const { files } = fixture();
        const result = compile(files), graph = validate(result);
        expect([...result.files]).toEqual([...compile(files).files]);
        expect(graph.index.primaryView).toBe('view:main');
        expect(graph.resources.map(ref => ref.kind).sort()).toEqual(['bridge', 'component', 'provenance', 'style', 'view']);
        const cst = parseAui(template, 'Main.aui');
        expect(cst.cst.source).toBe(template);
        const span = cst.spans.find(item => item.id === 'greeting');
        expect(template.slice(span.start, span.end)).toBe('<p node-id="greeting">Hello &amp; welcome</p>');
        expect(parseAui('\n' + template, 'Main.aui').ast).toEqual(cst.ast);
    });

    test.each([
        '<template><script node-id="x"></script></template>',
        '<template><div node-id="x" onclick="alert(1)"></div></template>',
        '<template><img node-id="x" src="https://example.com/x" /></template>',
        '<template><div node-id="x" style="color:red"></div></template>',
        '<template><div node-id="x">{{ world.secret }}</div></template>',
        '<template><div node-id="x"><span node-id="x" /></div></template>',
        '<template><div node-id="x"></span></template>',
        '<template><div /></template>',
        '<template><div node-id="x" read="unknown" /></template>',
        '<template><component node-id="x" ref="Missing" /></template>',
        '<template><img node-id="x" asset="missing" /></template>',
        '<template><div node-id="x" /></template><script>throw Error()</script>',
        '<template><div node-id="x" /></template><contract>{"controller":"controller.ts"}</contract>',
        '<template><div node-id="x" /></template><style>@import "https://evil/style.css";</style>',
        '<template><div node-id="x" /></template><style>div { background: url(https://evil/x); }</style>',
        '<template><div node-id="x" /></template><style>div { background: url(resource:missing); }</style>',
        '<template><div node-id="x" /></template><style>div { color: red;</style>',
    ])('fails closed for unsupported or invalid author source: %s', text => {
        const { files } = fixture(); files.set('frontend/Main.aui', Buffer.from(text));
        expect(() => compile(files)).toThrow();
    });

    test('links components, static styles and exact local media; rejects cycles and missing resources', () => {
        const { files, index } = fixture();
        index.components.push({ id: 'Card', source: 'Card.aui' });
        index.assets = [{ id: 'portrait', source: 'portrait.png', mediaType: 'image/png' }];
        files.set(sourcePath, Buffer.from(JSON.stringify(index)));
        files.set('frontend/Main.aui', Buffer.from('<template><component node-id="card" ref="Card" /></template>'));
        files.set('frontend/Card.aui', Buffer.from('<template><img node-id="portrait" asset="portrait" /></template><style>img { background: url("resource:portrait"); }</style>'));
        files.set('frontend/portrait.png', Buffer.from([137, 80, 78, 71]));
        expect(validate(compile(files)).resources.find(ref => ref.id === 'component:Card').dependencies).toContain('asset:portrait');
        files.set('frontend/Card.aui', Buffer.from('<template><component node-id="cycle" ref="Main" /></template>'));
        expect(() => compile(files)).toThrow(/Cyclic/);
    });

    test('links typed reads and materializes contract/schema digests, rejecting unknown targets', () => {
        const { files, index } = fixture(); index.bridge = 'bindings.json';
        files.set(sourcePath, Buffer.from(JSON.stringify(index)));
        const binding = { id: 'inventory', kind: 'read', target: { resourceId: 'inventory' },
            inputSchema: { type: 'object', properties: {}, additionalProperties: false }, outputSchema: { type: 'integer' } };
        files.set('frontend/bindings.json', Buffer.from(JSON.stringify({ version: 1, bindings: [binding] })));
        files.set('frontend/Main.aui', Buffer.from('<template><div node-id="root" read="inventory" /></template>'));
        const experienceContract = { dataResources: [{ resourceId: 'inventory', assetId: 'asset_' + 'a'.repeat(32), contentHash: 'a'.repeat(64) }] };
        const result = compileFrontend({ source: sourcePath, files, mode: 'full', experienceContract });
        const graph = validateFrontendGraph({ ...result, mode: 'full', experienceContract });
        expect(graph.bridge.bindings[0]).toMatchObject({ mapping: 'identity', contractDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
        expect(() => validate(result)).toThrow(/Unknown typed/);
        const manifest = { runtime: { experience: { mode: 'full', frontend: { kind: 'native', version: 3, entry: result.entry } }, experienceContract }, entryPoints: [] };
        expect(() => validateFrontendResources(manifest, result.files, new Map([[experienceContract.dataResources[0].assetId, Buffer.from('"wrong"')]]))).toThrow(/public schema/);
        expect(() => validateFrontendResources(manifest, result.files, new Map([[experienceContract.dataResources[0].assetId, Buffer.from('3')]]))).not.toThrow();
    });

    test('Action/Operation link only existing typed targets; forged mapping, schemas and digests fail', () => {
        const contract = lifecycleFixture();
        const outputSchema = { type: 'object', properties: {}, additionalProperties: false };
        const source = { version: 1, bindings: [
            { id: 'save', kind: 'action', target: { domainId: 'notes', commandId: 'save' }, inputSchema: contract.lifecycleRuntime.domains[0].commands[0].argsSchema, outputSchema },
            { id: 'summary', kind: 'operation', target: { taskId: 'summarize' }, inputSchema: contract.taskRuntime.tasks[0].inputSchema, outputSchema },
        ] };
        const compiled = compileBridge(source, contract);
        expect(() => validateCompiledBridge(compiled, contract)).not.toThrow();
        const forged = structuredClone(compiled); forged.bindings[0].mapping = 'eval';
        expect(() => validateCompiledBridge(forged, contract)).toThrow(/identity mismatch/);
        const changed = structuredClone(contract); changed.lifecycleRuntime.domains[0].commands[0].event = 'notes.changed';
        expect(() => validateCompiledBridge(compiled, changed)).toThrow(/identity mismatch/);
        source.bindings[0].inputSchema = outputSchema;
        expect(() => compileBridge(source, contract)).toThrow(/schema/);
        source.bindings[0].target.commandId = 'unknown';
        expect(() => compileBridge(source, contract)).toThrow(/Unknown typed/);
    });

    test('feature declarations do not imply support and style diagnostics retain source location', () => {
        expect(frontendFeatureAvailability([{ id: 'frontend-script', version: 1, required: false }])[0])
            .toMatchObject({ status: 'unsupported', reasonCode: 'frontend_feature_not_implemented' });
        expect(() => frontendFeatureAvailability([{ id: 'frontend-script', version: 1, required: true }])).toThrow(/Unsupported required/);
        const { files } = fixture();
        files.set('frontend/Main.aui', Buffer.from('<template><div node-id="root" /></template><style>@import "remote";</style>'));
        let error;
        try { compile(files); } catch (cause) { error = cause; }
        expect(error).toMatchObject({ code: 'frontend_style_invalid', source: { file: 'frontend/Main.aui', start: expect.any(Number) } });
    });

    test('entry overrides compile independent exact graphs and cannot overwrite authored runtime files', () => {
        const pkg = { runtime: { experience: sourceExperience }, entryPoints: [{ entryPointId: 'entrypoint_one', runtime: { experience: { ...sourceExperience, mode: 'component' } } }] };
        const result = compileProjectFrontends(pkg, fixture().files);
        expect(result.packageSource.runtime.experience.frontend.entry).not.toBe(result.packageSource.entryPoints[0].runtime.experience.frontend.entry);
        expect([...result.files.keys()].filter(path => path.endsWith('/index.json'))).toHaveLength(2);
        const { files } = fixture(); files.set('runtime/frontend/package/index.json', Buffer.from('{}'));
        expect(() => compileProjectFrontends(pkg, files)).toThrow(/collides/);
    });

    test('installed validator rejects tampered bytes and rehashed malicious IR', () => {
        const { files } = fixture();
        let result = compile(files);
        const component = validate(result).resources.find(ref => ref.kind === 'component');
        result.files.set(component.path, Buffer.from('{}'));
        expect(() => validate(result)).toThrow(/integrity/);
        result = compile(files);
        mutateIr(result, 'component', ir => { ir.root.tag = 'iframe'; });
        expect(() => validate(result)).toThrow(/semantic element/);
        result = compile(files);
        mutateIr(result, 'component', ir => { ir.root.asset = 'undeclared'; ir.root.tag = 'img'; ir.root.children = []; });
        expect(() => validate(result)).toThrow(/closure/);
    });

    test('authoring and installed contracts are disjoint; path traversal and legacy source are rejected', () => {
        expect(() => assertFrontendExperience(sourceExperience)).toThrow();
        expect(() => assertFrontendExperience({ mode: 'full', componentModelVersion: 2 }, { authoring: true })).toThrow();
        const { files, index } = fixture(); index.components[0].source = '../Main.aui';
        files.set(sourcePath, Buffer.from(JSON.stringify(index)));
        expect(() => compile(files)).toThrow(/path/);
        const pkg = { runtime: { experience: sourceExperience }, entryPoints: [] };
        const built = compileProjectFrontends(pkg, fixture().files);
        expect(built.files.has('frontend/Main.aui')).toBe(false);
        expect(pkg.runtime.experience.frontend.source).toBe(sourcePath);
    });
});

test('formal Project Build -> Preview -> install -> reopen consumes the same compiled graph in every layout mode', async () => {
    const h = await makeTempFsEngine();
    try {
        const projectStore = new ProjectStore({ directoriesByHandle: () => h.dirs });
        const worldRepo = new WorldRepo({ engine: h.engine }), knowledgeRepo = new KnowledgeRepo({ engine: h.engine });
        const assetStore = new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs });
        const installer = new PackageInstaller({ packageRepo: new PackageRepo({ engine: h.engine }), assetStore });
        for (const mode of ['component', 'hybrid', 'full']) {
            const projectId = createNativeId('project'), packageId = createNativeId('package'), entryPointId = createNativeId('entryPoint');
            const source = { format: 'atria-project-source', schemaVersion: 1,
                project: { projectId, packageId, displayName: 'Frontend v3' },
                package: { name: 'Frontend v3', version: '1.0.0', actors: [], capabilities: [], permissions: [],
                    entryPoints: [{ entryPointId, displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }],
                    runtime: { experience: { ...sourceExperience, mode } } },
                worlds: [], knowledge: [], knowledgeBindings: [], dependencies: {}, assetFiles: [] };
            const legacy = structuredClone(source); legacy.package.runtime.experience = { mode, componentModelVersion: 2, component: 'old.json' };
            expect(() => assertAtriaProjectSource(legacy)).toThrow();
            await projectStore.create(h.handle, source);
            for (const [path, bytes] of fixture().files) await projectStore.writeFile(h.handle, projectId, path, bytes);
            // These optional source bytes are inert, even if bundled. No eval,
            // npm or author controller execution occurs in build/install/open.
            await projectStore.writeFile(h.handle, projectId, 'controller.ts', 'throw new Error("must never execute")');
            const built = await buildProjectPackage({ handle: h.handle, projectId, projectStore, worldRepo, knowledgeRepo, assetStore });
            const inspected = inspectAtriaPackageContainer(built.archive);
            expect(inspected.sourceFiles.has('frontend/Main.aui')).toBe(false);
            const preview = new StudioPreviewHost().create({ projectId, archive: built.archive });
            await installer.install(h.handle, built.archive);
            const opened = await installer.open(h.handle, packageId, built.packageVersion.packageVersionId);
            const resolved = resolveNativeRuntimePackage(opened, entryPointId);
            expect(resolved.runtime).toEqual(preview.runtime);
            expect(readFrontendRuntimeResource(opened, resolved, resolved.runtime.experience.frontend.entry).mediaType).toBe('application/json');
            expect(() => readFrontendRuntimeResource(opened, resolved, 'controller.ts')).toThrow(/author source/);
            expect(() => readFrontendRuntimeResource(opened, resolved, sourcePath)).toThrow(/author source/);
            for (const ref of resolved.frontendGraph.resources) expect(readFrontendRuntimeResource(opened, resolved, ref.path).bytes.length).toBe(ref.size);
            expect(resolved.frontendGraph.index).toEqual(JSON.parse(preview.sourceFiles.get(preview.runtime.experience.frontend.entry)));
            const bad = structuredClone(built.manifest); bad.runtime.experience = sourceExperience;
            expect(() => buildAtriaPackageContainer({ manifest: bad, sourceFiles: fixture().files })).toThrow();
            const required = structuredClone(built.manifest);
            required.runtime.experience.features = [{ id: 'frontend-script', version: 1, required: true }];
            expect(() => buildAtriaPackageContainer({ manifest: required, sourceFiles: inspected.sourceFiles })).toThrow(/Unsupported required/);
        }
    } finally { await h.cleanup(); }
});
