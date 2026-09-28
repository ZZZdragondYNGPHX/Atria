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
    test('production dispatcher loads compiled bytes without calling World selectors or commands', async () => {
        const build = presentationFixture('component').compile(), env = environment(), calls = [];
        const runtime = await activateNativeExperienceRuntime({ sessionId: 'session', runtime: { experience: { mode: 'component', frontend: { kind: 'native', version: 3, entry: build.entry } } } },
            { getState() { throw new Error('Authority fallback forbidden'); }, dispatchCommandInternal() { throw new Error('Authority fallback forbidden'); } }, {
                ...env, nativePlayHost: { resolveHostSurface: () => env.document.getElementById('surface') },
                fetchImpl: async (url, options) => { calls.push(JSON.parse(options.body).path); const bytes = build.files.get(calls.at(-1)); return { ok: true, arrayBuffer: async () => bytes }; },
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
