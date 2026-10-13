import { jest } from '@jest/globals';
import { a2uiFixture, a2uiMessages } from './helpers/a2ui-s32-fixture.js';
import { makeTempFsEngineHarness, makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';
import { parseA2uiComponent, A2UI_VERSION } from '../../src/native/frontend/a2ui-adapter.js';
import { compileFrontend, compileProjectFrontends } from '../../src/native/frontend/compiler.js';
import { inspectFrontend, planFrontendPatch } from '../../src/native/frontend/authoring.js';

const policy = { actions: { confirm: 'save' }, fallbackText: 'Closed', feedback: { pending: 'Working', failed: 'Failed' } };
const parse = messages => parseA2uiComponent(JSON.stringify(messages), 'external.a2ui.json', policy);
const components = messages => messages[2].updateComponents.components;
const compiledComponent = (f, id) => {
    const graph = JSON.parse(f.compiled.files.get(f.compiled.entry));
    return JSON.parse(f.compiled.files.get(graph.resources.find(ref => ref.id === 'component:' + id).path));
};

describe('S32 bounded A2UI v0.9.1 -> existing Native frontend consumer', () => {
    test('formal Project Build consumes exact source bytes and emits only existing v3 IR', () => {
        const f = a2uiFixture(), source = structuredClone(f.manifest);
        source.runtime.experience.frontend = { kind: 'native', version: 3, source: 'frontend.json' };
        const result = compileProjectFrontends(source, f.sourceFiles);
        expect(result.files.has('External.a2ui.json')).toBe(false);
        const external = compiledComponent(f, 'External');
        expect(external.uses).toEqual(['save']);
        expect(external.presentation.interactions['a2ui.confirm']).toEqual([{ kind: 'action.invoke', target: 'save', value: { object: { label: '已由界面确认' } } }]);
        expect(external.controller).toBeUndefined();
        expect(JSON.stringify(external)).not.toMatch(/catalogId|updateComponents|updateDataModel/);
        const graph = JSON.parse(f.compiled.files.get(f.compiled.entry));
        const provenance = JSON.parse(f.compiled.files.get(graph.resources.find(ref => ref.kind === 'provenance').path));
        expect(provenance.sources.some(item => item.file === 'External.a2ui.json' && /^[a-f0-9]{64}$/.test(item.contentHash))).toBe(true);
    });
    test('text-only compatibility removes all interaction capabilities; deleted surface uses declared fallback', () => {
        const external = compiledComponent(a2uiFixture({ interactive: false }), 'External');
        expect(external.uses).toEqual([]); expect(external.presentation.interactions).toEqual({});
        expect(JSON.stringify(external.root)).not.toContain('button');
        const deleted = compiledComponent(a2uiFixture({ deleted: true }), 'External');
        expect(deleted.uses).toEqual([]); expect(deleted.root.children[0]).toContain('已关闭');
    });
    test.each([
        ['version', m => m[0].version = 'v0.8'],
        ['catalog', m => m[0].createSurface.catalogId = 'https://untrusted.invalid/catalog'],
        ['unknown component', m => components(m)[1].component = 'WebView'],
        ['undeclared event', m => components(m)[3].action.event.name = 'publish'],
        ['unknown source field', m => components(m)[1].secret = 'PRIVATE'],
        ['hidden Native path', m => components(m)[1].text = { path: '/states/private' }],
        ['expression payload', m => components(m)[1].text = { call: 'readSecret' }],
        ['unknown child', m => components(m)[0].children.push('absent')],
        ['cycle', m => components(m)[0].children.push('root')],
        ['shared child', m => components(m)[0].children.push('title')],
        ['unreachable node', m => components(m).push({ id: 'hidden', component: 'Text', text: 'hidden' })],
        ['duplicate ID', m => components(m).push(components(m)[1])],
        ['wrong surface', m => m[2].updateComponents.surfaceId = 'other'],
        ['incremental path outside subset', m => m[1].updateDataModel.path = '/title'],
        ['empty accessible label', m => m[1].updateDataModel.value.label = ' '],
        ['oversized source', m => components(m)[1].text = 'x'.repeat(70000)],
        ['state after delete', m => { m.push({ version: A2UI_VERSION, deleteSurface: { surfaceId: 'notes' } }); m.push(m[1]); }],
    ])('rejects %s before publication', (_name, mutate) => {
        const messages = a2uiMessages(); mutate(messages); expect(() => parse(messages)).toThrow();
    });
    test('schema-invalid mapped input or non-action binding is rejected by the original compiler', () => {
        expect(() => a2uiFixture({ mutate: m => components(m)[3].action.event.context = { bad: 'value' } })).toThrow();
        const f = a2uiFixture(), files = new Map(f.sourceFiles), index = JSON.parse(files.get('frontend.json'));
        index.components[1].a2ui.actions.confirm = 'notes'; files.set('frontend.json', Buffer.from(JSON.stringify(index)));
        expect(() => compileFrontend({ source: 'frontend.json', files, mode: 'full', experienceContract: f.contract })).toThrow('action binding unavailable');
    });
    test('public protocol text cannot become markup or a Native data expression', () => {
        const f = a2uiFixture({ mutate: m => { components(m)[1].text = '<script>PRIVATE()</script> ${states.private}'; components(m)[3].action.event.context = { label: '${states.private}' }; } });
        const external = compiledComponent(f, 'External');
        expect(external.root.children[0].children[0].children).toEqual(['<script>PRIVATE()</script> ${states.private}']);
        expect(external.presentation.interactions['a2ui.confirm'][0].value).toEqual({ object: { label: '${states.private}' } });
    });
    test('Studio inspection preserves source ownership and disallows synthetic node edits', () => {
        const f = a2uiFixture(), source = { package: structuredClone(f.manifest) };
        source.package.runtime.experience.frontend = { kind: 'native', version: 3, source: 'frontend.json' };
        const snapshot = { source, files: f.sourceFiles }, graph = inspectFrontend(snapshot);
        expect(graph.diagnostics.filter(item => item.severity === 'error')).toEqual([]);
        const entry = graph.entries.find(item => item.kind === 'node' && item.componentId === 'External');
        expect(entry.readOnly).toBe(true);
        expect(() => planFrontendPatch(snapshot, { ownerId: 'package', kind: 'node', id: entry.id, componentId: 'External', field: 'text', value: 'unsafe', contentHash: entry.contentHash })).toThrow();
    });
});

describe.each([['FS', makeTempFsEngineHarness], ['SQLite', makeTempSqliteEngineHarness]])('S32 %s original Bridge authority', (_name, make) => {
    let h, svc, host, f, base, opened;
    beforeEach(async () => {
        h = await make(); svc = services(h); host = new FrontendBridgeService(); f = a2uiFixture();
        await svc.packageInstaller.install(h.handle, buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: f.files }).archive);
        base = await svc.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        opened = await host.open(svc, h.handle, base.session.sessionId);
    });
    afterEach(async () => { host?.dispose(); jest.restoreAllMocks(); await h?.cleanup(); });
    const request = extra => ({ epoch: opened.epoch, revision: opened.revision, componentId: 'External', bindingId: 'save', method: 'action.invoke', input: { label: '已由界面确认' }, idempotencyKey: 'a2ui-click-1', ...extra });
    test('user event mapping writes once, advances exact revision and rejects stale/revoked/cross-owner interactions', async () => {
        const spy = jest.spyOn(svc.core, 'applyLifecycleCommand');
        const [one, duplicate] = await Promise.all([host.request(svc, h.handle, request()), host.request(svc, h.handle, request())]);
        expect(one.ok).toBe(true); expect(duplicate).toEqual(one); expect(spy).toHaveBeenCalledTimes(1);
        const current = await svc.core.load(h.handle, base.session.sessionId);
        expect(current.revision.revisionId).not.toBe(base.revision.revisionId);
        expect(current.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('已由界面确认');
        expect((await host.request(svc, h.handle, request({ idempotencyKey: 'new' }))).error.code).toBe('bridge_revision_stale');
        expect((await host.request(svc, h.handle, request({ revision: current.revision.revisionId, bindingId: 'task' }))).error.code).toBe('bridge_binding_denied');
        expect((await host.request(svc, 'other', request())).error.code).toBe('bridge_epoch_stale');
        host.revoke(h.handle, base.session.sessionId);
        expect((await host.request(svc, h.handle, request({ revision: current.revision.revisionId }))).error.code).toBe('bridge_epoch_stale');
        expect(await svc.core.load(h.handle, base.session.sessionId)).toEqual(current);
    });
});
