import { describe, test, expect, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { platformFixture, portrait, localization } from './helpers/frontend-platform-fixture.js';
import { assertMediaRef, assertMediaCatalog } from '../../public/shared/native-frontend-media.js';
import { createLocalization, assertLocalization } from '../../public/shared/native-frontend-localization.js';
import { validateFrontendGraph } from '../../src/native/frontend/graph.js';
import { createFrontendResources } from '../../public/scripts/native/frontend/resources.js';
import { createMediaResolver } from '../../public/scripts/native/frontend/media.js';
import { mountNativeFrontend } from '../../public/scripts/native/frontend/runtime.js';
import { createPresentationEnvironment } from '../../public/scripts/native/frontend/platform.js';
import { validateFrontendResources } from '../../src/native/experience-validation.js';
import { fixedHostTarget } from '../../public/shared/native-frontend-host.js';
import { previewBridgeTransport } from '../../public/scripts/native/frontend/preview-bridge.js';
import { compileFrontend } from '../../src/native/frontend/compiler.js';
import { bridgeFixture } from './helpers/frontend-bridge-fixture.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { buildAtriaPackageContainer } from '../../src/native/package-container.js';
import { inspectExperienceHealth } from '../../src/native/experience-health.js';

const wait = () => new Promise(resolve => setTimeout(resolve, 50));
function environment() {
    const dom = new JSDOM('<!doctype html><div id="surface"></div>', { pretendToBeVisual: true }), { window } = dom, { document } = window;
    let sequence = 0; window.URL.createObjectURL = jest.fn(() => 'blob:media-' + (++sequence)); window.URL.revokeObjectURL = jest.fn(); window.HTMLMediaElement.prototype.pause = jest.fn();
    return { dom, window, document, surfaceHost: { mount() { const container = document.createElement('div'); document.body.append(container); return { container, unmount: () => container.remove() }; } } };
}
function find(root, selector) { const own = root.querySelector(selector); if (own) return own; for (const element of root.querySelectorAll('*')) if (element.shadowRoot) { const found = find(element.shadowRoot, selector); if (found) return found; } return null; }

describe('Phase 5 compiled media and localization', () => {
    test('large portrait catalog is metadata only, with exact fallback and install validation', () => {
        const fixture = platformFixture(); fixture.files.set('frontend/media.json', Buffer.from(JSON.stringify({ version: 1, required: false, entries: Array.from({ length: 1000 }, (_, id) => ({ ...portrait, mediaId: id ? 'portrait' + id : 'portrait' })) })));
        const build = fixture.compile(), graph = validateFrontendGraph({ ...build, mode: 'full' });
        expect(graph.resources.filter(ref => ref.kind === 'asset')).toHaveLength(3);
        expect(graph.resources.find(ref => ref.kind === 'media').size).toBeLessThan(400000);
        expect(graph.resources.find(ref => ref.kind === 'media').dependencies).toEqual(['asset:fallback']);
    });
    test.each(['https://evil.test/x', { kind: 'declared', id: 'portrait', url: 'https://evil.test/x' }, { kind: 'url', id: 'portrait' }, { kind: 'host', id: '__proto__' }])('rejects constructed URLs or forged reference shape %j', ref => expect(() => assertMediaRef(ref)).toThrow());
    test.each(['http://images.example/a', 'https://user:secret@images.example/a', 'https://images.example/a#fragment', 'data:image/png;base64,eA=='])('rejects unsafe catalog URL %s', url => expect(() => assertMediaCatalog({ version: 1, required: false, entries: [{ ...portrait, sources: [{ url }] }] })).toThrow());
    test('exact asset sink validates MIME; localization rejects executable formats', () => {
        const fixture = platformFixture(); fixture.files.set('frontend/Main.aui', Buffer.from(fixture.files.get('frontend/Main.aui').toString().replace('asset="audio"', 'asset="fallback"'))); expect(() => fixture.compile()).toThrow(/MIME/);
        const invalid = structuredClone(localization); invalid.catalogs.en.messages.bad = { arg: 'x', format: 'eval' }; expect(() => assertLocalization(invalid)).toThrow();
    });
    test('installation requires declared remote-media feature and permission, including required parity', () => {
        const fixture = platformFixture(), build = fixture.compile();
        const manifest = { entryPoints: [], permissions: [], runtime: { experience: { mode: 'full', frontend: { kind: 'native', version: 3, entry: build.entry } } } };
        expect(() => validateFrontendResources(manifest, build.files)).toThrow(/Permission/);
        manifest.permissions = [{ permission: 'remote-media', required: false }]; manifest.runtime.experience.features = [{ id: 'remote-media', version: 1, required: false }]; expect(() => validateFrontendResources(manifest, build.files)).not.toThrow();
        fixture.files.set('frontend/media.json', Buffer.from(JSON.stringify({ version: 1, required: true, entries: [portrait] }))); const required = fixture.compile(); expect(() => validateFrontendResources(manifest, required.files)).toThrow(/Permission/);
        manifest.permissions[0].required = true; manifest.runtime.experience.features[0].required = true; expect(() => validateFrontendResources(manifest, required.files)).not.toThrow();
    });
    test('installed media/localization graph exposes advisory diagnostics through real Session Health', async () => {
        const h = await makeTempFsEngineHarness(), svc = services(h), fixture = platformFixture(), session = sessionFixture();
        const build = fixture.compile();
        session.manifest.permissions.push({ permission: 'remote-media', required: false });
        session.manifest.runtime = { experience: { mode: 'full', frontend: { kind: 'native', version: 3, entry: build.entry }, features: [{ id: 'remote-media', version: 1, required: false }] } };
        try {
            await svc.packageInstaller.install(h.handle, buildAtriaPackageContainer({ manifest: session.manifest, sourceFiles: build.files }).archive);
            const base = await svc.core.create(h.handle, { packageId: session.manifest.packageId, packageVersionId: session.manifest.packageVersionId, entryPointId: session.entryPointId });
            const health = await inspectExperienceHealth(svc.core, h.handle, base.session.sessionId);
            expect(health.diagnostics).toContainEqual(expect.objectContaining({ code: 'localization_missing_key', sourceId: 'ar:count', severity: 'warning' }));
            expect(health.status).toBe('healthy'); expect(health.anchor.revisionId).toBe(base.revision.revisionId);
        } finally { await h.cleanup(); }
    });
    test('locale fallback, plural/select and Intl formatting remain inert text', () => {
        const data = structuredClone(localization); Object.assign(data.catalogs.en.messages, { select: { arg: 'role', format: 'select', cases: { admin: 'Admin', other: 'Guest' } }, date: { arg: 'value', format: 'date' }, time: { arg: 'value', format: 'time' }, relative: { arg: 'value', format: 'relative', unit: 'day' }, list: { arg: 'value', format: 'list' } });
        const diagnostic = jest.fn(), locale = createLocalization(data, 'en-US', diagnostic);
        expect(locale.locale).toBe('en'); expect(locale.text('count', { count: 1 })).toBe('One item'); expect(locale.text('count', { count: 2 })).toBe('2 items');
        expect(locale.text('greeting', { name: '<script>bad</script>' })).toContain('<script>'); expect(locale.text('select', { role: 'constructor' })).toBe('Guest');
        expect(locale.text('date', { value: '2026-09-29' })).toContain('2026'); expect(locale.text('time', { value: '2026-09-29' })).toBeTruthy(); expect(locale.text('relative', { value: -1 })).toContain('ago'); expect(locale.text('list', { value: ['A', 'B'] })).toContain('and');
        locale.setLocale('ar'); expect(locale.direction).toBe('rtl'); expect(locale.text('select', {})).toBe('Guest'); locale.text('missing'); locale.text('missing'); expect(diagnostic).toHaveBeenCalledTimes(1);
    });
});

describe('Host media resolver', () => {
    async function setup(fetchImage) { const env = environment(), build = platformFixture().compile(), resources = await createFrontendResources({ ...env, entry: build.entry, loadBytes: async path => build.files.get(path) }); const media = await createMediaResolver({ resources, window: env.window, fetchImage }); return { ...env, resources, media, close() { media.dispose(); resources.dispose(); env.window.close(); } }; }
    test('denied/offline fallback, cache, privacy flags, HostIssued refs and revocation', async () => {
        const fetchImage = jest.fn(async () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } })); const env = await setup(fetchImage);
        try {
            expect((await env.media.resolve('portrait')).reasonCode).toBe('media_permission_denied'); expect(fetchImage).not.toHaveBeenCalled();
            env.media.setEnabled(true); const result = await env.media.resolve('portrait'); expect(result.status).toBe('available'); await env.media.resolve('portrait'); expect(fetchImage).toHaveBeenCalledTimes(1);
            expect(fetchImage.mock.calls[0][1]).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' });
            const issued = env.media.issue({ source: { url: 'https://images.example/host.png' }, mediaType: 'image/png', fallbackMediaId: 'portrait' }); expect((await env.media.resolve(issued)).status).toBe('available');
            await expect(env.media.resolve({ kind: 'host', id: 'forged' })).rejects.toThrow();
            expect(() => env.media.issue({ source: { url: 'https://evil.test/host.png' }, mediaType: 'image/png', fallbackMediaId: 'portrait' })).toThrow();
            env.media.setEnabled(false); expect(env.window.URL.revokeObjectURL).toHaveBeenCalledWith(result.url);
            fetchImage.mockRejectedValue(new Error('offline private URL')); env.media.setEnabled(true); expect((await env.media.resolve('portrait')).reasonCode).toBe('media_offline_or_invalid');
        } finally { env.close(); }
    });
    test('late remote completion cannot survive disable, and content/MIME/byte limits fail to fallback', async () => {
        let finish; const env = await setup(() => new Promise(resolve => { finish = resolve; }));
        try { env.media.setEnabled(true); const pending = env.media.resolve('portrait'); env.media.setEnabled(false); finish(new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } })); await expect(pending).rejects.toThrow(/stale/); expect(env.window.URL.createObjectURL).not.toHaveBeenCalled(); } finally { env.close(); }
        for (const response of [new Response('html', { headers: { 'content-type': 'text/html' } }), new Response(new Uint8Array(2097153), { headers: { 'content-type': 'image/png' } })]) { const next = await setup(async () => response); try { next.media.setEnabled(true); expect((await next.media.resolve('portrait')).reasonCode).toBe('media_offline_or_invalid'); } finally { next.close(); } }
    });
    test('cache releases evict unused entries, no-cache releases revoke bytes, integrity failures use fallback', async () => {
        const env = environment(), fixture = platformFixture();
        fixture.files.set('frontend/media.json', Buffer.from(JSON.stringify({ version: 1, required: false, entries: Array.from({ length: 70 }, (_, id) => ({ ...portrait, mediaId: id ? 'portrait' + id : 'portrait', cache: id === 68 ? 'none' : 'session', sources: [{ url: 'https://images.example/' + id + '.png', ...(id === 69 ? { integrity: '0'.repeat(64) } : {}) }] })) })));
        const build = fixture.compile(), resources = await createFrontendResources({ ...env, entry: build.entry, loadBytes: async path => build.files.get(path) }), fetchImage = jest.fn(async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }));
        const media = await createMediaResolver({ resources, window: env.window, fetchImage, enabled: true });
        try {
            for (let id = 0; id < 68; id++) { const result = await media.resolve(id ? 'portrait' + id : 'portrait'); expect(result.status).toBe('available'); result.release(); }
            expect(env.window.URL.revokeObjectURL).toHaveBeenCalled();
            const transient = await media.resolve('portrait68'); transient.release(); expect(env.window.URL.revokeObjectURL).toHaveBeenCalledWith(transient.url);
            expect((await media.resolve('portrait69')).reasonCode).toBe('media_offline_or_invalid');
        } finally { media.dispose(); resources.dispose(); env.window.close(); }
    });
});

describe('input, environment and failure containment', () => {
    test('composition survives unrelated render, commits once, RTL changes preserve nodes and local state', async () => {
        const env = environment(), build = platformFixture().compile(); const runtime = await mountNativeFrontend({ ...env, entry: build.entry, loadBytes: async path => build.files.get(path) });
        try {
            const input = find(env.document, '[data-node-id="input"]'); input.focus(); input.dispatchEvent(new env.window.CompositionEvent('compositionstart')); input.value = '中文'; input.setSelectionRange(1, 1); input.dispatchEvent(new env.window.InputEvent('input', { isComposing: true }));
            runtime.setState('ui', 'count', 4); runtime.setState('draft', 'text', 'external update'); await wait(); expect(input.value).toBe('中文'); expect(input.selectionStart).toBe(1);
            input.dispatchEvent(new env.window.CompositionEvent('compositionend')); await wait(); expect(runtime.getState().draft.text).toBe('中文');
            const instances = runtime.getInstances(); runtime.setLocale('ar'); await wait(); expect(runtime.getInstances()).toEqual(instances); expect(find(env.document, '[data-node-id="input"]')).toBe(input); expect(find(env.document, '[data-atria-frontend-boundary]').dir).toBe('rtl'); expect(find(env.document, '[data-node-id="heading"]').textContent).toContain('مرحبا');
            runtime.announce('Done'); expect(find(env.document, '[aria-live]').textContent).toBe('Done');
        } finally { runtime.dispose(); env.window.close(); }
    });
    test('child resource failure stays local, retry recreates child without resetting sibling state', async () => {
        const env = environment(), build = platformFixture().compile(), index = JSON.parse(build.files.get(build.entry)), child = index.resources.find(ref => ref.id === 'component:Child'); let fail = true; const diagnostics = [];
        const runtime = await mountNativeFrontend({ ...env, entry: build.entry, onDiagnostic: value => diagnostics.push(value), loadBytes: async path => { if (path === child.path && fail) throw new Error('private transport details'); return build.files.get(path); } });
        try {
            expect(find(env.document, '[data-boundary="child"]').dataset.boundaryStatus).toBe('error'); runtime.setState('ui', 'count', 9); await wait(); expect(find(env.document, '[data-node-id="count"]').textContent).toBe('9 items');
            expect(JSON.stringify(diagnostics)).not.toContain('private'); fail = false; find(env.document, '[data-boundary="child"]').querySelector('button').click(); await wait(); expect(find(env.document, '[data-node-id="childText"]').textContent).toBe('Child ready'); expect(runtime.getState().ui.count).toBe(9);
        } finally { runtime.dispose(); env.window.close(); }
    });
    test('child lifecycle invocation and required media decode failures use local boundaries; root resource failure retains Host recovery', async () => {
        const env = environment(), fixture = platformFixture();
        fixture.files.set('frontend/Child.aui', Buffer.from('<template><p node-id="childText">Child</p></template><contract>' + JSON.stringify({ state: { component: { schema: { type: 'object', properties: { count: { type: 'integer' } }, required: ['count'], additionalProperties: false }, initial: { count: 0 } } }, interactions: { bad: [{ kind: 'set', target: 'component.count', value: 'invalid' }] }, lifecycle: { mount: 'bad' } }) + '</contract>'));
        fixture.files.set('frontend/Main.aui', Buffer.from(fixture.files.get('frontend/Main.aui').toString().replace('media="portrait"', 'asset="fallback" boundary="required"')));
        const build = fixture.compile(), runtime = await mountNativeFrontend({ ...env, entry: build.entry, loadBytes: async path => build.files.get(path) });
        try {
            expect(find(env.document, '[data-boundary="child"]').dataset.boundaryStatus).toBe('error');
            find(env.document, '[data-node-id="portrait"]').dispatchEvent(new env.window.Event('error')); expect(find(env.document, '[data-boundary="portrait"]').dataset.boundaryStatus).toBe('error');
            runtime.setState('ui', 'count', 3); await wait(); expect(find(env.document, '[data-node-id="count"]').textContent).toBe('3 items');
        } finally { runtime.dispose(); env.window.close(); }
        const next = environment(), index = JSON.parse(build.files.get(build.entry)), root = index.resources.find(ref => ref.id === 'component:Main'); let unavailable = true;
        const recovering = await mountNativeFrontend({ ...next, entry: build.entry, loadBytes: async path => { if (path === root.path && unavailable) throw new Error('private'); return build.files.get(path); } });
        try { expect(find(next.document, '[role="alert"]').hidden).toBe(false); unavailable = false; await recovering.recover(); expect(find(next.document, '[data-node-id="input"]')).not.toBeNull(); } finally { recovering.dispose(); next.window.close(); }
    });
    test('local read failure retries only its read subscription; sibling state and authority writes remain untouched', async () => {
        const fixture = bridgeFixture(); fixture.files.set('Main.aui', Buffer.from(fixture.files.get('Main.aui').toString().replace('read="notes"', 'read="notes" boundary="local"')));
        const build = compileFrontend({ source: 'frontend.json', files: fixture.files, mode: 'full', experienceContract: fixture.contract }), env = environment();
        const index = JSON.parse(build.files.get(build.entry)), descriptor = JSON.parse(build.files.get(index.resources.find(ref => ref.kind === 'bridge').path));
        const transport = previewBridgeTransport({ descriptor, scopes: { Main: ['notes', 'save', 'page', 'task'], Child: [] }, projections: { notes: [] } });
        let fail = true; const original = transport.request; transport.request = jest.fn(async request => {
            const result = await original(request); if (request.bindingId === 'notes' && fail) return { ...result, ok: false, status: 'failed', data: null, error: { code: 'bridge_projection_unavailable', retryable: true } }; return result;
        });
        const runtime = await mountNativeFrontend({ ...env, entry: build.entry, bridgeTransport: transport, loadBytes: async path => build.files.get(path) });
        try {
            await wait(); expect(find(env.document, '[data-boundary="notes"]').dataset.boundaryStatus).toBe('error'); runtime.setState('draft', 'label', 'keep'); fail = false;
            find(env.document, '[data-boundary="notes"]').querySelector('button').click(); await wait(); expect(find(env.document, '[data-boundary="notes"]').dataset.boundaryStatus).toBe('content'); expect(runtime.getState().draft.label).toBe('keep');
            expect(transport.request.mock.calls.some(([request]) => request.method === 'action.invoke')).toBe(false);
        } finally { runtime.dispose(); env.window.close(); }
    });
    test('required media consent denial fails activation; fixed presentation handles preserve Preview authority', async () => {
        const env = environment(), fixture = platformFixture(); fixture.files.set('frontend/media.json', Buffer.from(JSON.stringify({ version: 1, required: true, entries: [portrait] }))); let build = fixture.compile();
        await expect(mountNativeFrontend({ ...env, entry: build.entry, loadBytes: async path => build.files.get(path), confirmRemoteMedia: () => false })).rejects.toThrow('media_permission_denied');
        fixture.files.set('frontend/media.json', Buffer.from(JSON.stringify({ version: 1, required: false, entries: [portrait] })));
        const target = { service: 'host.presentation', method: 'setLocale' }, schema = fixedHostTarget(target);
        fixture.index.bridge = 'bridge.json'; fixture.files.set('frontend/index.json', Buffer.from(JSON.stringify(fixture.index)));
        fixture.files.set('frontend/bridge.json', Buffer.from(JSON.stringify({ version: 1, bindings: [{ id: 'locale', kind: schema.kind, target, inputSchema: schema.inputSchema, outputSchema: schema.outputSchema }] })));
        fixture.contract.interactions.arabic = [{ kind: 'action.invoke', target: 'locale', value: { object: { locale: 'ar' } } }]; fixture.files.set('frontend/Main.aui', Buffer.from(fixture.files.get('frontend/Main.aui').toString().replace(/<contract>.*?<\/contract>/s, '<contract>' + JSON.stringify(fixture.contract) + '</contract>')));
        build = fixture.compile(); const index = JSON.parse(build.files.get(build.entry)), descriptor = JSON.parse(build.files.get(index.resources.find(ref => ref.kind === 'bridge').path));
        const transport = previewBridgeTransport({ descriptor, scopes: { Main: ['locale'], Child: [] } }), runtime = await mountNativeFrontend({ ...env, entry: build.entry, bridgeTransport: transport, loadBytes: async path => build.files.get(path) });
        try { find(env.document, '[data-node-id="arabic"]').click(); await wait(); expect(find(env.document, '[data-atria-frontend-boundary]').dir).toBe('rtl'); expect(fixedHostTarget({ service: 'host.media', method: 'resolve' }).outputSchema.properties).not.toHaveProperty('url'); } finally { runtime.dispose(); env.window.close(); }
    });
    test('visual viewport and keyboard occlusion react and dispose listeners', () => {
        const env = environment(), frame = env.document.createElement('div'), viewport = new env.window.EventTarget(); Object.assign(viewport, { width: 390, height: 400, offsetTop: 0, offsetLeft: 0 }); Object.defineProperty(env.window, 'visualViewport', { value: viewport });
        const changed = jest.fn(), projection = createPresentationEnvironment(env.window, frame, changed, { textScale: 1.5 });
        expect(projection.get().keyboardInset).toBe(env.window.innerHeight - 400); expect(frame.style.getPropertyValue('--atria-text-scale')).toBe('1.5'); viewport.height = 600; viewport.dispatchEvent(new env.window.Event('resize')); expect(projection.get().visualViewportHeight).toBe(600);
        projection.dispose(); changed.mockClear(); viewport.dispatchEvent(new env.window.Event('resize')); expect(changed).not.toHaveBeenCalled(); env.window.close();
    });
});
