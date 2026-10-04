import { createNativeId } from '../../src/native/identity.js';
import { illustrationContentHash } from '../../src/native/session-illustrations.js';
import { emptyIllustrations } from '../../public/shared/native-illustration-contract.js';
import { createHeadlessConversation } from '../../public/scripts/native/frontend/conversation.js';
import { bridgeReceipt, bridgeDescriptorDigest } from '../../public/shared/native-frontend-bridge.js';
import { describe, expect, test, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { presentationFixture } from './helpers/frontend-presentation-fixture.js';
import { compileStyle, linkStyle, validateCompiledStyle } from '../../src/native/frontend/styles.js';
import { assertPresentationContract, styleValue } from '../../public/shared/native-frontend-presentation.js';
import { mountNativeFrontend } from '../../public/scripts/native/frontend/runtime.js';
import { activateNativeExperienceRuntime } from '../../public/scripts/native/experience/ui/live.js';
import { createFrontendResources } from '../../public/scripts/native/frontend/resources.js';
import { createFrameScheduler } from '../../public/scripts/native/frontend/platform.js';

function environment() {
    const dom = new JSDOM('<!doctype html><div id="surface"></div>', { url: 'http://localhost', pretendToBeVisual: true });
    const { window } = dom, { document } = window;
    const surface = document.getElementById('surface');
    const surfaceHost = { mount() { const container = document.createElement('div'); surface.append(container); return { container, unmount: () => container.remove() }; } };
    return { dom, window, document, surfaceHost };
}
function editContract(fixture, transform) {
    const path = 'frontend/Main.aui', source = fixture.files.get(path).toString();
    fixture.files.set(path, Buffer.from(source.replace(/<contract>(.*?)<\/contract>/s, (_, text) => { const contract = JSON.parse(text); transform(contract); return '<contract>' + JSON.stringify(contract) + '</contract>'; })));
}

describe('Native Frontend v3 presentation', () => {
    test.each(['component', 'hybrid', 'full'])('compiles semantic components and large bounded local lists in %s', mode => {
        expect(presentationFixture(mode).compile().files.size).toBeGreaterThan(10);
    });
    test.each([
        contract => { contract.interactions.next[0].target = 'missing'; },
        contract => { contract.nodeRefs.push('rowLabel'); },
        contract => { contract.interactions.increment = [{ kind: 'focus', target: 'root' }]; },
        contract => { contract.interactions.increment = [{ kind: 'emit', target: 'missing', value: 1 }]; },
        contract => { contract.lifecycle = { mount: 'next' }; },
        contract => { contract.interactions.increment = [{ kind: 'toggle', target: 'ui.count' }]; },
        contract => { contract.interactions.increment = [{ kind: 'set', target: 'component.missing', value: 1 }]; },
    ])('rejects invalid local references before packaging', change => {
        const fixture = presentationFixture(); editContract(fixture, change); expect(() => fixture.compile()).toThrow();
    });
    test.each([
        ['prop:count="ui.count"', 'prop:unknown="ui.count"'],
        ['on:increase="receive"', 'on:unknown="receive"'],
        ['<span node-id="slotA">', '<span node-id="slotA" slot="missing">'],
        ['<main node-id="root">', '<main node-id="root" bind:text="ui.title">'],
        ['<main node-id="root">', '<main node-id="root" popover="auto">'],
    ])('rejects invalid component or DOM sinks', (from, to) => {
        const fixture = presentationFixture(); fixture.files.set('frontend/Main.aui', Buffer.from(fixture.files.get('frontend/Main.aui').toString().replace(from, to))); expect(() => fixture.compile()).toThrow();
    });
    test('supports CSS layers, media/container queries, variables, keyframes and isolated font families', () => {
        const source = '@font-face{font-family:"Custom";src:url(resource:font) format("woff2");font-weight:100 900}@layer app{div{--font:"Custom";font:16px var(--font);display:grid;filter:blur(1px);background:url(resource:image)}}@container(width>100px){div::before{content:"ok"}}@media(prefers-reduced-motion:no-preference){div{animation:fade 1s}}@keyframes fade{from{opacity:0}to{opacity:1}}';
        const compiled = linkStyle(source, ['Custom']);
        expect(compiled.css).toContain('__atri_font_0__');
        expect(compiled.fonts[0]).toMatchObject({ family: '__atri_font_0__', descriptors: { weight: '100 900' } });
        expect(validateCompiledStyle(compiled)).toEqual(['font', 'image']);
    });
    test.each(['@import "remote.css";', 'a{background:url(https://example.com/x)}', 'a{background:image-set("https://example.com/x" 1x)}', 'a{background:image("https://example.com/x")}', 'a{background:src("https://example.com/x")}', 'a{--remote:url(https://example.com/x)}', '@font-face{font-family:X;src:local("Arial")}', 'a{background:attr(data-url url)}', 'a{color:red'])('rejects non-exact or malformed CSS resource sinks: %s', css => expect(() => compileStyle(css)).toThrow());
    test('typed dynamic styles do not accept strings in numeric sinks or arbitrary CSS tokens', () => {
        expect(styleValue({ type: 'length' }, 12)).toBe('12px');
        expect(() => styleValue({ type: 'length' }, 'url(https://x)')).toThrow();
        expect(() => assertPresentationContract({ dynamicStyles: { unsafe: { property: '--asset', type: 'token', tokens: ['url(x)'] } } })).toThrow();
    });
    test('escaped CSS URL functions cannot bypass exact resources', () => {
        expect(() => compileStyle(String.raw`a{background:u\72l("https://evil.test")}`)).toThrow();
    });
    test('lifecycle, scoped preferences, NodeRef revocation and frame disposal', async () => {
        const fixture = presentationFixture();
        editContract(fixture, contract => {
            contract.interactions.mounted = [{ kind: 'set', target: 'view.visits', value: 4 }];
            contract.interactions.unmounted = [{ kind: 'set', target: 'prefs.compact', value: true }];
            contract.lifecycle = { mount: 'mounted', unmount: 'unmounted' };
        });
        const build = fixture.compile(), env = environment(), storage = { read: () => undefined, write: jest.fn() };
        const runtime = await mountNativeFrontend({ ...env, entry: build.entry, loadBytes: async path => build.files.get(path), stateStorage: storage });
        expect(runtime.getState().view.visits).toBe(4);
        const id = runtime.getInstances().find(item => item.componentId === 'Main').id;
        const handle = runtime.getNodeRef(id, 'title'); expect(handle).not.toHaveProperty('node');
        expect(() => runtime.getNodeRef(id, 'root')).toThrow();
        const callback = jest.fn(); runtime.scheduler.frame(callback); runtime.dispose();
        await new Promise(resolve => setTimeout(resolve, 30));
        expect(callback).not.toHaveBeenCalled(); expect(storage.write).toHaveBeenCalledWith('prefs', 'compact', 'player', true);
        expect(() => handle.measure()).toThrow(/Stale/); expect(env.document.querySelector('[data-atria-frontend-boundary]')).toBeNull(); env.dom.window.close();
    });
    test('Package prose bindings register exact committed rows and keep illustrations after plugin disable', async () => {
        const fixture = presentationFixture(), env = environment();
        const content = '**Alice** at the window.\n\nBob waits.';
        const entry = { messageId: createNativeId('message'), activeVariantId: createNativeId('variant'), role: 'assistant', content };
        const revision = { revisionId: createNativeId('revision'), branchId: createNativeId('branch') };
        const annotationId = createNativeId('annotation'), imageVersionId = createNativeId('imageVersion');
        const state = emptyIllustrations();
        state.annotations.push({ annotationId, anchor: { messageId: entry.messageId, variantId: entry.activeVariantId, revisionId: revision.revisionId, contentHash: illustrationContentHash(content), start: 2, end: content.length, quote: content.slice(2) }, selectedImageVersionId: imageVersionId, createdAt: 1 });
        state.images.push({ annotationId, imageVersionId, assetId: createNativeId('asset'), width: 512, height: 768, alt: 'Window scene', prompt: '', negativePrompt: '', parameters: {}, createdAt: 1 });
        editContract(fixture, contract => {
            contract.state.ui.schema.properties.rows.items.properties.messageId = { type: 'string', maxLength: 128 };
            contract.state.ui.schema.properties.rows.items.required.push('messageId');
            contract.state.ui.initial.rows.forEach((row, index) => { row.messageId = index === 0 ? entry.messageId : ''; });
            contract.state.ui.initial.rows[0].label = content;
        });
        const source = fixture.files.get('frontend/Main.aui').toString().replace('<span node-id="rowLabel" bind:text="item.label" />', '<div node-id="rowLabel" bind:prose="item.label" />');
        fixture.files.set('frontend/Main.aui', Buffer.from(source));
        const build = fixture.compile(), headless = createHeadlessConversation({ runtime: { snapshot: { session: { sessionId: createNativeId('session') }, revision, timeline: [entry], illustrations: state } } });
        const runtime = await mountNativeFrontend({ ...env, entry: build.entry, loadBytes: async path => build.files.get(path), hostServices: headless });
        const find = (root, selector) => root.querySelector(selector) ?? [...root.querySelectorAll('*')].filter(node => node.shadowRoot).map(node => find(node.shadowRoot, selector)).find(Boolean);
        const prose = find(env.document, '[data-node-id="rowLabel"]');
        expect(prose.querySelector('figure img').alt).toBe('Window scene'); expect(prose.querySelector('strong').textContent).toBe('Alice');
        // The Host renderer works with no enabled extension or plugin UI.
        expect(env.document.querySelector('[data-atri-extension]')).toBeNull();
        runtime.dispose(); env.dom.window.close();
    });
    test('production dispatcher loads compiled bytes without calling World selectors or commands', async () => {
        const build = presentationFixture('component').compile(), env = environment(), calls = [];
        const runtime = await activateNativeExperienceRuntime({ sessionId: 'session', runtime: { experience: { mode: 'component', frontend: { kind: 'native', version: 3, entry: build.entry } } } },
            { getState() { throw new Error('Authority fallback forbidden'); }, dispatchCommandInternal() { throw new Error('Authority fallback forbidden'); } }, {
                ...env, nativePlayHost: { resolveHostSurface: () => env.document.getElementById('surface') },
                fetchImpl: async (url, options) => { if (url.endsWith('/frontend/open')) return { ok: true, json: async () => bridgeReceipt({ epoch: 'test-epoch', revision: 'test-revision', data: { descriptorDigest: await bridgeDescriptorDigest({ format: 'atria-compiled-bridge', version: 1, bindings: [] }) } }) }; calls.push(JSON.parse(options.body).path); const bytes = build.files.get(calls.at(-1)); return { ok: true, arrayBuffer: async () => bytes }; },
            });
        expect(calls).toContain(build.entry); expect(runtime.getInstances().length).toBe(3);
        expect(calls.some(path => path.endsWith('.aui'))).toBe(false); await runtime.dispose(); env.dom.window.close();
    });
    test('resource corruption fails closed and disposal revokes pending loads', async () => {
        const build = presentationFixture().compile(), env = environment();
        const resources = await createFrontendResources({ ...env, entry: build.entry, loadBytes: async path => path === build.entry ? build.files.get(path) : Buffer.from('corrupt') });
        await expect(resources.json('view:main', 'view')).rejects.toThrow(/integrity/); resources.dispose(); await expect(resources.json('view:main', 'view')).rejects.toThrow(/disposed/); env.dom.window.close();
    });
    test('late route and overlay loads cannot replace the latest View or leave its content inert', async () => {
        const build = presentationFixture().compile(), env = environment();
        const index = JSON.parse(build.files.get(build.entry));
        const blockedPath = index.resources.find(ref => ref.id === 'component:Other').path;
        let release, blocked;
        const gate = new Promise(resolve => { release = resolve; });
        const loaded = new Promise(resolve => { blocked = resolve; });
        const runtime = await mountNativeFrontend({ ...env, entry: build.entry, loadBytes: async path => { if (path === blockedPath) { blocked(); await gate; } return build.files.get(path); } });
        const late = runtime.navigate('other'); await loaded;
        await runtime.navigate('dialog'); release(); await late;
        expect([...env.document.querySelectorAll('[data-atria-frontend-boundary]')].map(node => node.dataset.atriaFrontendBoundary)).toEqual(['dialog']);
        await Promise.all([runtime.openOverlay('main'), runtime.openOverlay('other')]);
        const outer = env.document.querySelector('[data-atria-frontend-boundary]');
        expect(outer.shadowRoot.querySelector('[data-atria-frontend-boundary]').dataset.atriaFrontendBoundary).toBe('other');
        expect(outer.shadowRoot.querySelector('[data-atria-frontend-boundary]').shadowRoot.firstChild.inert).toBe(false);
        runtime.closeOverlay(); expect(outer.shadowRoot.firstChild.inert).toBe(false);
        runtime.dispose(); env.dom.window.close();
    });
    test('scheduler coalesces frames, applies motion policy and bounds requests', () => {
        let flush; const window = { requestAnimationFrame: jest.fn(callback => { flush = callback; return 1; }), cancelAnimationFrame: jest.fn(), matchMedia: () => ({ matches: true }) };
        const scheduler = createFrameScheduler(window, { hidden: false }), ordinary = jest.fn(), animation = jest.fn();
        scheduler.frame(ordinary); scheduler.frame(animation, { animation: true }); expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1); flush(42);
        expect(ordinary).toHaveBeenCalledWith(42); expect(animation).not.toHaveBeenCalled();
        for (let i = 0; i < 256; i++) scheduler.frame(ordinary); expect(() => scheduler.frame(ordinary)).toThrow(); scheduler.dispose();
    });
});


describe('Native option identity bindings', () => {
    function optionsFixture() {
        const fixture = presentationFixture();
        editContract(fixture, contract => {
            contract.state.ui.initial.rows = [{ id: 'a', label: 'Same label' }, { id: 'b', label: 'Same label' }];
            contract.state.ui.initial.title = 'b';
            contract.nodeRefs = [];
            contract.interactions.replaceOptions = [{ kind: 'set', target: 'ui.rows', value: [{ object: { id: 'b', label: 'Renamed label' } }] }];
        });
        fixture.files.set('frontend/Main.aui', Buffer.from(fixture.files.get('frontend/Main.aui').toString().replace(/<template>[\s\S]*?<\/template>/,
            '<template><main node-id="root"><select node-id="choice" aria-label="Choice" bind:value="ui.title"><option node-id="option" each="ui.rows" item-key="id" bind:value="item.id" bind:text="item.label"/></select><button node-id="replaceOptions" on:click="replaceOptions">Replace options</button></main></template>')));
        return fixture;
    }
    test('separates stable option IDs from labels and synchronizes after option updates', async () => {
        const fixture = optionsFixture(), build = fixture.compile(), env = environment();
        const runtime = await mountNativeFrontend({ ...env, entry: build.entry, loadBytes: async path => build.files.get(path) });
        const find = (root, selector) => root.querySelector(selector) ?? [...root.querySelectorAll('*')].filter(el => el.shadowRoot).map(el => find(el.shadowRoot, selector)).find(Boolean);
        try {
            const select = find(env.document, 'select');
            expect(select.value).toBe('b');
            expect([...select.options].map(o => o.value)).toEqual(['a', 'b']);
            select.value = 'a'; select.dispatchEvent(new env.window.Event('change'));
            expect(runtime.getState().ui.title).toBe('a');
            select.value = 'b'; select.dispatchEvent(new env.window.Event('change'));
            find(env.document, '[data-node-id="replaceOptions"]').click();
            await new Promise(resolve => setTimeout(resolve, 40));
            expect(select.value).toBe('b');
            expect(select.options.length).toBe(1);
            expect(select.options[0].textContent).toBe('Renamed label');
            // Options never write into their read-only item source, even on synthetic input.
            select.options[0].dispatchEvent(new env.window.Event('input'));
            expect(runtime.getState().ui.rows).toEqual([{ id: 'b', label: 'Renamed label' }]);
        } finally { runtime.dispose(); env.dom.window.close(); }
    });
    test.each([
        ['<option node-id="option"', '<option node-id="option" bind:checked="ui.title"'],
        ['bind:value="ui.title"', 'bind:value="item.id"'],
        ['<option node-id="option"', '<button node-id="option"'],
    ])('does not relax checked, form-write or arbitrary-element restrictions: %s', (before, after) => {
        const fixture = optionsFixture();
        fixture.files.set('frontend/Main.aui', Buffer.from(fixture.files.get('frontend/Main.aui').toString().replace(before, after)));
        expect(() => fixture.compile()).toThrow();
    });
});
