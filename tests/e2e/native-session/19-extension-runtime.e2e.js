import { test, expect } from '@playwright/test';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { makeTempFsEngine } from '../../storage/harness/fs-harness.js';
import { ExtensionsStore } from '../../../src/native/extensions-store.js';
import { createNativeExtensionsRouter } from '../../../src/endpoints/native-extensions.js';

if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });
let fixture, server, baseURL, store;

test.beforeAll(async () => {
    fixture = await makeTempFsEngine(); store = new ExtensionsStore({ engine: fixture.engine });
    const app = express(); app.use(express.json());
    // Disposable authenticated fixture: no production account or data root.
    app.use((req, _res, next) => { if (req.headers.cookie?.includes('extension-fixture=owner')) req.user = { profile: { handle: fixture.handle } }; next(); });
    app.get('/fixture', (_req, res) => res.type('html').send('<!doctype html><html><body></body></html>'));
    app.use('/api/native/extensions', createNativeExtensionsRouter({ store: () => store }));
    app.use(express.static(fileURLToPath(new URL('../../../public', import.meta.url))));
    server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
    baseURL = 'http://127.0.0.1:' + server.address().port;
});

test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); await fixture.cleanup(); });

test('authenticated real browser modules activate, load relative resources, and clean up on change/disable', async ({ page, context }) => {
    const targets = { global: true, presets: [], works: [] };
    const local = await store.save(fixture.handle, { name: 'Local', kind: 'local', enabled: true, targets, entrypoint: 'index.js', files: {
        'index.js': `export function activate(sdk) {
            const node = document.createElement('p'); node.id = 'local-output'; node.textContent = 'Local active'; sdk.ui.mount(node);
            sdk.events.listen(document, 'fixture', () => { window.localEvents = (window.localEvents || 0) + 1; });
            sdk.timers.interval(() => { window.localTicks = (window.localTicks || 0) + 1; }, 10);
            return () => { window.localCleanups = (window.localCleanups || 0) + 1; };
        }`,
    } });
    const external = await store.save(fixture.handle, { name: 'External', kind: 'external', enabled: true, targets,
        sourceUrl: 'https://example.com/fixture.git', entrypoint: 'src/main.js', files: {
            'src/main.js': `import { label } from './helper.js';
                export async function activate(sdk) {
                    const data = await (await fetch(new URL('../data.json', import.meta.url))).json();
                    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = sdk.assetUrl('style.css'); sdk.ui.mount(css);
                    const node = document.createElement('p'); node.id = 'external-output'; node.textContent = label + data.value; sdk.ui.mount(node);
                }`,
            'src/helper.js': 'export const label = "External ";', 'data.json': '{"value":"loaded"}', 'style.css': '#external-output { color: rgb(1, 2, 3); }',
        } });
    await context.addCookies([{ name: 'extension-fixture', value: 'owner', url: baseURL }]);
    await page.goto(baseURL + '/fixture');
    await page.evaluate(async ({ local, external }) => {
        const { createExtensionRuntime } = await import('/scripts/native/extension-runtime.js');
        window.extensionHost = createExtensionRuntime({ document });
        window.extensionRecords = [local, external];
        await window.extensionHost.reconcile(window.extensionRecords, { packageId: 'work', presetId: 'preset' });
    }, { local, external });
    await expect(page.locator('#local-output')).toHaveText('Local active');
    await expect(page.locator('#external-output')).toHaveText('External loaded');
    await expect(page.locator('#external-output')).toHaveCSS('color', 'rgb(1, 2, 3)');
    await page.evaluate(async () => {
        document.dispatchEvent(new Event('fixture'));
        await window.extensionHost.reconcile(window.extensionRecords, { packageId: 'other', presetId: 'preset' });
        document.dispatchEvent(new Event('fixture'));
    });
    expect(await page.evaluate(() => ({ events: window.localEvents, cleanups: window.localCleanups }))).toEqual({ events: 2, cleanups: 1 });
    const { revision: _revision, ...value } = local;
    await store.save(fixture.handle, { ...value, enabled: false }, local.revision);
    await page.evaluate(async () => {
        const records = await (await fetch('/api/native/extensions/plugins')).json();
        await window.extensionHost.reconcile(records, { packageId: 'other', presetId: 'preset' });
        document.dispatchEvent(new Event('fixture'));
    });
    await expect(page.locator('#local-output')).toHaveCount(0);
    expect(await page.evaluate(() => window.localEvents)).toBe(2);
    expect((await page.request.get(baseURL + `/api/native/extensions/files/${local.id}/${local.revision}/index.js`)).status()).toBe(409);
    await page.evaluate(() => window.extensionHost.dispose());
    await expect(page.locator('[data-atri-extension]')).toHaveCount(0);
});
