import { describe, test, expect } from '@jest/globals';
import { inspectFrontend, planFrontendPatch } from '../../src/native/frontend/authoring.js';
import { editJson } from '../../src/native/frontend/source-edits.js';
import { authoringFixture } from './helpers/frontend-authoring-fixture.js';
import { compileFrontend } from '../../src/native/frontend/compiler.js';
import { AssetStore, KnowledgeRepo, ProjectStore, StudioPreviewHost, StudioService, WorldRepo, ProjectAgentService, createNativeId } from '../../src/native/index.js';
import { createGitClient } from '../../src/git/client.js';
import { makeTempFsEngine } from '../storage/harness/fs-harness.js';
import { createAuthoringOperation, createStudioWorkspace } from '../../public/scripts/native/studio-authoring.js';
import { scriptFixture } from './helpers/frontend-script-fixture.js';


function patch(fixture, kind, id, rest = {}) {
    const entry = inspectFrontend(fixture).entries.find(entry => entry.kind === kind && entry.id === id);
    return planFrontendPatch(fixture, { kind, id, contentHash: entry.contentHash, ...(entry.componentId ? { componentId: entry.componentId } : {}), ...rest });
}
describe('Native v3 source authoring', () => {
    test('source graph exposes semantic identities and source-linked advisory diagnostics', () => {
        const graph = inspectFrontend(authoringFixture());
        expect(graph.status).toBe('passed');
        expect(graph.entries.map(entry => entry.kind)).toEqual(expect.arrayContaining(['view', 'component', 'node', 'style', 'binding', 'message']));
        expect(graph.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'localization_unused_key', path: 'frontend/locales.json' })]));
    });
    test.each([
        ['text', 'New <text> & value', 'Hello', 'New &lt;text&gt; &amp; value'],
        ['class', 'new\'quote', 'class = \'old\'', 'class = \'new&apos;quote\''],
        ['class', null, ' class = \'old\'', ''],
    ])('Node %s edit changes only selected text token', (field, value, before, after) => {
        const fixture = authoringFixture(), edit = patch(fixture, 'node', 'greeting', { field, value });
        expect(edit.after.toString()).toBe(edit.before.toString().replace(before, after));
        fixture.files.set(edit.path, edit.after); expect(inspectFrontend(fixture).status).toBe('passed');
    });
    test('new attribute, component state and style preserve sibling blocks', () => {
        const fixture = authoringFixture();
        let edit = patch(fixture, 'node', 'greeting', { field: 'title', value: 'hello' });
        expect(edit.after.toString()).toContain('class = \'old\' title="hello"');
        edit = patch(fixture, 'component', 'Main', { path: ['uses'], value: [] });
        expect(edit.after.toString()).toBe(edit.before.toString().replace('["locale"]', '[]'));
        edit = patch(fixture, 'style', 'Main', { value: 'p { color: blue; }' });
        expect(edit.after.toString()).toBe(edit.before.toString().replace('/* preserved */ p { color: red; }', 'p { color: blue; }'));
    });
    test('View, Binding and locale target exact source JSON values', () => {
        const fixture = authoringFixture();
        const view = patch(fixture, 'view', 'main', { path: ['surface'], value: 'app.root' });
        expect(view.after.equals(view.before)).toBe(true);
        const binding = patch(fixture, 'binding', 'locale', { path: ['mapping'], value: 'identity' });
        fixture.files.set(binding.path, binding.after);
        expect(inspectFrontend(fixture).status).toBe('passed');
        const message = patch(fixture, 'message', 'greeting', { locale: 'en', value: 'Welcome' });
        expect(message.after.toString()).toBe(message.before.toString().replace('"Hello"', '"Welcome"'));
    });
    test('stale hashes, identity rewrites, derived IR, mixed-content text and prototype paths fail closed', () => {
        const fixture = authoringFixture();
        expect(() => patch(fixture, 'node', 'greeting', { contentHash: '0'.repeat(64), field: 'text', value: 'stale' })).toThrow('conflict');
        expect(() => patch(fixture, 'node', 'greeting', { field: 'node-id', value: 'other' })).toThrow('immutable');
        expect(() => patch(fixture, 'node', 'root', { field: 'text', value: 'lost' })).toThrow('text-only');
        expect(() => patch(fixture, 'view', 'main', { path: ['id'], value: 'other' })).toThrow('immutable');
        expect(() => patch(fixture, 'component', 'Main', { path: ['__proto__'], value: {} })).toThrow('Invalid');
        expect(() => planFrontendPatch(fixture, { kind: 'ir', id: 'Main', value: {} })).toThrow('Unknown');
    });
    test.each([
        ['frontend/Main.aui', '<template><bad node-id="x"/></template>'],
        ['frontend/theme.css', 'p { background: url(https://example.com/x); }'],
        ['frontend/bridge.json', '{ "version": 5, "bindings": [] }'],
        ['frontend/locales.json', '{"version":1}'],
        ['frontend/index.json', '{'],
    ])('invalid %s gets source diagnostics before Build', (path, text) => {
        const fixture = authoringFixture(); fixture.files.set(path, Buffer.from(text));
        const graph = inspectFrontend(fixture);
        expect(graph.status).toBe('failed');
        expect(graph.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ severity: 'error', source: expect.objectContaining({ file: path }) })]));
    });
    test('JSON CST changes keep CRLF and unrelated fields exactly', () => {
        const text = '{\r\n\t"a": { "x": 1 },\r\n\t"b": [1, 2]\r\n}';
        expect(editJson(text, ['a', 'x'], 3)).toBe(text.replace('"x": 1', '"x": 3'));
    });
    test('state and interaction source editors resolve stable component-scoped identities', () => {
        const fixture = authoringFixture();
        const contract = { uses: ['locale'], state: { component: { schema: { type: 'object', properties: { count: { type: 'integer' } }, required: ['count'], additionalProperties: false }, initial: { count: 0 } } },
            interactions: { increment: [{ kind: 'set', target: 'component.count', value: 1 }] } };
        fixture.files.set('frontend/Main.aui', Buffer.from(fixture.files.get('frontend/Main.aui').toString().replace('{ "uses": ["locale"] }', JSON.stringify(contract))));
        const edit = patch(fixture, 'state', 'component', { path: ['initial', 'count'], value: 9 });
        fixture.files.set(edit.path, edit.after);
        expect(inspectFrontend(fixture).status).toBe('passed');
        const interaction = patch(fixture, 'interaction', 'increment', { path: ['0', 'value'], value: 2 });
        expect(interaction.after.toString()).toContain('"value":2');
    });
    test('source-level feature closure and vendor Script diagnostics use production checks', () => {
        const script = scriptFixture(), fixture = authoringFixture(); fixture.files = script.files;
        let graph = inspectFrontend(fixture);
        expect(graph.diagnostics.some(item => /frontend-script/.test(item.message))).toBe(true);
        fixture.source.package.runtime.experience.features = [{ id: 'frontend-script', version: 1, required: true }];
        graph = inspectFrontend(fixture);
        expect(graph.status).toBe('passed');
        expect(graph.features[0].status).toBe('available');
        fixture.files.set('frontend/controller.ts', Buffer.from('export default {\n init() {\n fetch("https://example.com");\n }\n};'));
        graph = inspectFrontend(fixture);
        expect(graph.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ source: expect.objectContaining({ file: 'frontend/controller.ts', line: 3 }) })]));
        expect(graph.diagnostics.find(item => item.severity === 'error').source.start).toBeGreaterThan(10);
    });
    test('attribute values containing > and duplicate JSON keys cannot misdirect edits', () => {
        const fixture = authoringFixture();
        fixture.files.set('frontend/Main.aui', Buffer.from(fixture.files.get('frontend/Main.aui').toString().replace('class = \'old\'', 'title=\'a > b\' class = \'old\'')));
        const edit = patch(fixture, 'node', 'greeting', { field: 'text', value: 'changed' });
        expect(edit.after.toString()).toBe(edit.before.toString().replace('Hello', 'changed'));
        expect(() => editJson('{"a":1,"a":2}', ['a'], 3)).toThrow('duplicate');
    });
    test('Preview diagnostics are produced by the same formal Compiler artifacts', () => {
        const fixture = authoringFixture();
        const build = compileFrontend({ source: 'frontend/index.json', files: fixture.files, mode: 'full' });
        const index = JSON.parse(build.files.get(build.entry));
        const diagnostics = JSON.parse(build.files.get(index.resources.find(ref => ref.kind === 'diagnostics').path));
        expect(inspectFrontend(fixture).diagnostics.map(item => item.code)).toEqual(diagnostics.map(item => item.reasonCode));
    });
});

async function studioFixture() {
    const h = await makeTempFsEngine(), fixture = authoringFixture();
    const projectId = createNativeId('project'), packageId = createNativeId('package'), entryPointId = createNativeId('entryPoint');
    const source = { format: 'atria-project-source', schemaVersion: 1, project: { projectId, packageId, displayName: 'Studio Frontend' },
        package: { ...fixture.source.package, name: 'Studio Frontend', version: '1.0.0', actors: [], capabilities: [], entryPoints: [{ entryPointId, displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
        worlds: [], knowledge: [], knowledgeBindings: [], dependencies: {}, assetFiles: [] };
    const projects = new ProjectStore({ directoriesByHandle: () => h.dirs });
    const studio = new StudioService({ projectStore: projects, worldRepo: new WorldRepo({ engine: h.engine }), knowledgeRepo: new KnowledgeRepo({ engine: h.engine }),
        assetStore: new AssetStore({ engine: h.engine, directoriesByHandle: () => h.dirs }), gitClient: createGitClient({ backend: 'builtin' }), previewHost: new StudioPreviewHost() });
    const created = await studio.createProject(h.handle, source, { files: fixture.files });
    const entry = (await studio.inspectFrontend(h.handle, projectId)).entries.find(item => item.kind === 'node' && item.id === 'greeting');
    const input = { kind: 'node', id: 'greeting', componentId: 'Main', contentHash: entry.contentHash, field: 'text', value: 'Reviewed draft' };
    const operation = createAuthoringOperation({ operationType: 'frontend.patch', target: { resourceType: 'core.project', resourceId: projectId }, input });
    const workspace = createStudioWorkspace({ projectId, baseRevision: created.revision.revision, operations: [operation] });
    return { h, fixture, source, projectId, studio, projects, input, workspace };
}

describe('Studio and Agent semantic patch lifecycle', () => {
    test('multiple semantic edits in one file share the pinned Workspace baseline hash', async () => {
        const { h, studio, projects, projectId, workspace } = await studioFixture();
        try {
            const next = structuredClone(workspace);
            next.operations.push(createAuthoringOperation({ operationType: 'frontend.patch', target: next.operations[0].target, input: { ...next.operations[0].input, field: 'class', value: 'second' } }));
            const result = await studio.executeWorkspace(h.handle, next);
            expect(result.changeSet.validation.status).toBe('passed');
            const text = (await projects.readFile(h.handle, projectId, 'frontend/Main.aui')).toString();
            expect(text).toContain('Reviewed draft'); expect(text).toContain('class = \'second\'');
        } finally { await h.cleanup(); }
    });
    test('formal Preview evaluates source patches without persisting; commit is revision guarded', async () => {
        const { h, studio, projects, projectId, workspace, fixture } = await studioFixture();
        try {
            const evaluated = await studio.evaluateWorkspace(h.handle, workspace, { simulation: false });
            expect(evaluated.validation.status).toBe('passed');
            expect(evaluated.preview.persisted).toBe(false);
            expect(await projects.readFile(h.handle, projectId, 'frontend/Main.aui')).toEqual(fixture.files.get('frontend/Main.aui'));
            const preview = studio.getPreviewUi(h.handle, evaluated.preview.previewId);
            expect(JSON.stringify(preview)).not.toContain('derived-editable');
            const result = await studio.executeWorkspace(h.handle, workspace);
            expect(result.changeSet.validation.status).toBe('passed');
            expect((await projects.readFile(h.handle, projectId, 'frontend/Main.aui')).toString()).toContain('Reviewed draft');
            await expect(studio.executeWorkspace(h.handle, workspace)).rejects.toThrow();
            studio.closePreview(h.handle, evaluated.preview.previewId);
        } finally { await h.cleanup(); }
    });
    test('invalid semantic patch rolls back and retains source coordinates in ChangeSet', async () => {
        const { h, studio, projects, projectId, workspace, fixture } = await studioFixture();
        try {
            const invalid = structuredClone(workspace); invalid.operations[0].input.field = 'onclick'; invalid.operations[0].input.value = 'evil()';
            const result = await studio.executeWorkspace(h.handle, invalid);
            expect(result.changeSet.validation.status).toBe('failed');
            expect(result.changeSet.validation.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ source: expect.objectContaining({ file: 'frontend/Main.aui' }) })]));
            expect(await projects.readFile(h.handle, projectId, 'frontend/Main.aui')).toEqual(fixture.files.get('frontend/Main.aui'));
            expect((await studio.getRevision(h.handle, projectId)).revision).toBe(workspace.baseRevision);
        } finally { await h.cleanup(); }
    });
    test('read-only draft inspection leaves ProjectStore and revision unchanged', async () => {
        const { h, studio, projects, projectId, workspace, fixture } = await studioFixture();
        try {
            const result = await studio.inspectFrontend(h.handle, projectId, { baseRevision: workspace.baseRevision, drafts: [{ path: 'frontend/Main.aui', content: '<template>' }] });
            expect(result.status).toBe('failed');
            expect(await projects.readFile(h.handle, projectId, 'frontend/Main.aui')).toEqual(fixture.files.get('frontend/Main.aui'));
            expect((await studio.getRevision(h.handle, projectId)).revision).toBe(workspace.baseRevision);
            await expect(studio.inspectFrontend(h.handle, projectId, { baseRevision: 'stale' })).rejects.toThrow();
        } finally { await h.cleanup(); }
    });
    test('AI discovers IDs, proposes a patch, dry-runs and stops at human Review', async () => {
        const { h, studio, projects, projectId, workspace, input, fixture } = await studioFixture();
        try {
            const agent = new ProjectAgentService({ studio });
            let task = await agent.createTask(h.handle, projectId, { intent: 'Edit a Node by semantic ID', baseRevision: workspace.baseRevision });
            const call = (name, args) => agent.executeTool(h.handle, projectId, task.taskId, { name, args });
            const graph = await call('atri_agent_frontend_graph', {});
            expect(graph.entries.some(entry => entry.id === input.id)).toBe(true);
            await call('atri_agent_set_plan', { summary: 'Edit greeting', steps: [{ id: 'greeting', title: 'Update greeting', impact: 'low' }] });
            task = await call('atri_agent_frontend_patch', { ...input, stepId: 'greeting' });
            expect(task.operations[0].operation.origin.kind).toBe('agent');
            task = await call('atri_agent_prepare_review', {});
            expect(task.status).toBe('review');
            expect(await projects.readFile(h.handle, projectId, 'frontend/Main.aui')).toEqual(fixture.files.get('frontend/Main.aui'));
            await expect(call('atri_agent_frontend_patch', input)).rejects.toThrow();
            studio.closePreview(h.handle, task.preview.previewId);
        } finally { await h.cleanup(); }
    });
});
