import { test, expect } from '@playwright/test';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { setConfigFilePath } from '../../../src/util.js';
import { createImageRegistry } from '../../../src/native/image-registry.js';
import { makeTempFsEngineHarness } from '../../storage/harness/contract-harness.js';
import { setupVisual, visualPng } from '../../native/helpers/visual-fixture.js';

let harness, fixture, listener, baseURL;
test.describe.configure({ mode: 'serial' });
test.use({ actionTimeout: 12000 });

test.beforeAll(async () => {
    setConfigFilePath(fileURLToPath(new URL('../../../default/config.yaml', import.meta.url)));
    const { createNativeGenerationRouter } = await import('../../../src/endpoints/native-generation.js');
    harness = await makeTempFsEngineHarness();
    fixture = await setupVisual(harness, { registry: createImageRegistry({ fetchImpl: async () => Response.json({ data: [{ b64_json: visualPng.toString('base64') }] }) }), adapter: 'provider.openai-images', model: 'gpt-image-1' });
    const prepared = await fixture.prepare();
    const started = await fixture.images.start(harness.handle, { prepareId: prepared.prepareId, approval: fixture.approval(prepared) });
    await fixture.images.wait(harness.handle, started.operationId);
    const app = express(); app.use(express.json({ limit: '4mb' }));
    app.use((req, _res, next) => { req.user = { profile: { handle: harness.handle } }; next(); });
    app.use('/api/native/generation', createNativeGenerationRouter(() => fixture.host));
    app.get('/api/native/session/asset/:id', async (req, res) => { const asset = await fixture.f.assetStore.read(harness.handle, req.params.id); res.type(asset.mediaType || 'image/png').send(asset.bytes); });
    app.get('/fixture', (_req, res) => res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/atria-tokens.css"><style>body{margin:0;padding:24px;background:var(--atri-canvas);color:var(--atri-text-primary);font:14px/1.65 var(--atri-font-sans)}main{max-width:980px;margin:auto}*{box-sizing:border-box}</style><main class="atri-illustration-ui" id="media"></main><script type="module">
        import { mountVisualGallery } from '/scripts/native/visual-gallery-ui.js';
        import { ILLUSTRATION_CSS } from '/scripts/native/illustration-ui.js';
        import { loadEntryLocalization } from '/scripts/entry-localization.js';
        window.__i18n=await loadEntryLocalization();
        const style=document.createElement('style');style.textContent=ILLUSTRATION_CSS;document.head.append(style);
        const context=${JSON.stringify({ sessionId: fixture.view.session.sessionId, branchId: fixture.view.revision.branchId })};
        window.errors=[];window.jobs=[];
        const sdk={context,illustrations:{visual:async(domain,action,input={})=>{const r=await fetch('/api/native/generation/visual/'+domain+'/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...context,...input})});const value=await r.json();if(!r.ok)throw Object.assign(new Error(value.error),{status:r.status});return value;}}};
        window.gallery=await mountVisualGallery({document,parent:document.querySelector('main'),sdk,report:e=>window.errors.push(e.message),onJob:j=>window.jobs.push(j)});
        </script></html>`));
    app.use(express.static(fileURLToPath(new URL('../../../public/', import.meta.url))));
    listener = app.listen(0, '127.0.0.1'); await new Promise(resolve => listener.once('listening', resolve));
    baseURL = 'http://127.0.0.1:' + listener.address().port;
});

test.afterAll(async () => { listener?.closeAllConnections(); if (listener) await new Promise(resolve => listener.close(resolve)); await harness?.cleanup(); });

for (const [width, language] of [[1440, 'en'], [900, 'zh-cn'], [320, 'zh-cn']]) test(`Gallery and Media Studio real FS drafts and approval at ${width}px ${language}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(language => localStorage.setItem('language', language), language);
    await page.goto(baseURL + '/fixture');
    const en = language === 'en';
    const main = page.locator('main');
    await expect(main.getByRole('button', { name: en ? 'Use this version' : '使用此版本', exact: true })).toBeVisible();
    await main.getByRole('button', { name: en ? 'Use this version' : '使用此版本', exact: true }).dblclick();
    await expect(main).toContainText(en ? 'displayed' : '当前显示');
    await main.getByRole('button', { name: en ? 'Open Media Studio' : '打开图片编辑', exact: true }).click();
    await expect(main.getByLabel(en ? 'Edit prompt' : '编辑提示词', { exact: true })).toBeVisible();
    await main.getByText(en ? 'Rectangle coordinates in pixels' : '矩形区域（像素）', { exact: true }).click();
    await main.getByRole('button', { name: en ? 'Add rectangle' : '添加矩形区域', exact: true }).click();
    await main.getByRole('button', { name: en ? 'Save draft' : '保存草稿', exact: true }).click();
    await expect(main).toContainText(en ? 'Draft synced' : '草稿已同步');
    await main.getByRole('button', { name: en ? 'Preview edit task' : '预览编辑任务', exact: true }).click();
    await expect(main.getByRole('button', { name: en ? 'Approve generation' : '确认生成', exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.jobs)).toEqual([]);
    await page.screenshot({ path: info.outputPath('media-approval.png'), fullPage: true });
    await main.getByRole('button', { name: en ? 'Cancel' : '取消', exact: true }).click();
    await expect(main.getByRole('button', { name: en ? 'Approve generation' : '确认生成', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => window.errors)).toEqual([]);
    await page.reload();
    await main.getByRole('button', { name: en ? 'Open Media Studio' : '打开图片编辑', exact: true }).click();
    await expect(main.getByLabel(en ? 'Edit prompt' : '编辑提示词', { exact: true })).toBeVisible();
    const drafts = await fixture.images.store.list(harness.handle, 'draft');
    expect(drafts.some(draft => draft.commands.length > 0)).toBe(true);
});
