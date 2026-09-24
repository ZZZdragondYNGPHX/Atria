import { disableExtensions } from '../_lib/fixtures.js';
import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { FsEngine } from '../../../src/storage/engines/fs-engine.js';
import { createNativeId } from '../../../src/native/identity.js';
import { seedGenerationProfiles } from '../../native/helpers/generation-fixture.js';
import { startServer, tearDownServer } from '../_lib/server.js';
import { awaitMainUI } from '../_lib/page.js';
import { seedNativeSessionDataRoot, createAndOpenNativeSession } from './_helpers.js';

let server; let provider; let seeded;
test.describe.configure({ mode: 'serial' });
if (process.env.PW_NATIVE_CHANNEL) test.use({ channel: process.env.PW_NATIVE_CHANNEL });

test.beforeAll(async () => {
    provider = createServer(async (req, res) => {
        let body = ''; for await (const bytes of req) body += bytes;
        const input = JSON.parse(body);
        if (!input.messages?.some(item => item.content?.includes('selected Native facts'))) { res.writeHead(400).end(); return; }
        res.setHeader('Content-Type', 'text/event-stream');
        const chunk = content => 'data: ' + JSON.stringify({ choices: [{ delta: { content } }] }) + '\n\n';
        if (input.messages.some(item => item.content?.includes('Stop this request'))) {
            res.write(chunk('Uncommitted streaming draft'));
            const timer = setTimeout(() => res.end(chunk(' late result') + 'data: [DONE]\n\n'), 30000);
            res.on('close', () => clearTimeout(timer));
        } else res.end(chunk('Native P4 reply ') + chunk('from the exact configured route.') + 'data: [DONE]\n\n');
    });
    await new Promise(done => provider.listen(0, '127.0.0.1', done));
    seeded = await seedNativeSessionDataRoot({ suffix: 'p4-generation' });
    const root = resolve(seeded.dataRoot, seeded.handle);
    const engine = new FsEngine({ directoriesByHandle: () => ({ root, assets: resolve(root, 'assets') }) });
    await seedGenerationProfiles({ engine, handle: seeded.handle, endpoint: `http://127.0.0.1:${provider.address().port}/v1/chat/completions`, roles: ['narrator', 'studio'], streaming: true });
    await engine.close();
    writeFileSync(resolve(root, 'secrets.json'), JSON.stringify({ api_key_custom: [{ id: 'p4-synthetic-key', value: 'p4-test-only', active: true, label: 'P4 test' }], _migrated: true }));
    disableExtensions({ dataRoot: seeded.dataRoot, names: ['stable-diffusion'] });
    server = await startServer({ batchKey: 'generation', scenarioId: 'p4-generation', useExistingDataRoot: seeded.dataRoot });
});

test.afterAll(async () => {
    await tearDownServer(server, { removeData: false });
    await new Promise(done => { provider?.closeAllConnections(); provider?.close(done); });
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`Native Play sends through P4 at ${viewport.width}px`, async ({ page }, info) => {
        await page.setViewportSize(viewport);
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => localStorage.setItem('language', 'en'));
        await awaitMainUI(page, server.baseURL);
        await createAndOpenNativeSession(page, seeded.start);
        const composer = page.locator('[data-atria-composer="native"]');
        await expect(composer).toBeVisible();
        await composer.getByRole('textbox', { name: 'Message', exact: true }).fill('Explain the harbour route.');
        const request = page.waitForResponse(response => response.url().includes('/api/native/generation/execute'));
        await composer.getByRole('button', { name: 'Send', exact: true }).click();
        const response = await request;
        expect(response.status(), await response.text()).toBe(200);
        await expect(page.locator('[data-atria-conversation="native"]')).toContainText('Native P4 reply');
        const directory = info.outputPath('visual'); mkdirSync(directory, { recursive: true });
        await page.screenshot({ path: resolve(directory, `play-${viewport.width}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Timeline', exact: true }).click();
        await expect(page.locator('[data-atria-native-play-drawer="true"]')).toBeVisible();
        await page.screenshot({ path: resolve(directory, `timeline-${viewport.width}.png`), fullPage: true });
        await page.locator('.atria-dock__close:visible, .atria-sheet-close:visible').click();
        await composer.getByRole('textbox', { name: 'Message', exact: true }).fill('Stop this request');
        await composer.getByRole('button', { name: 'Send', exact: true }).click();
        await expect(page.locator('[data-atria-draft="true"]')).toContainText('Uncommitted streaming draft');
        await page.screenshot({ path: resolve(directory, `stream-${viewport.width}.png`), fullPage: true });
        await composer.getByRole('button', { name: 'Stop', exact: true }).click();
        await expect(composer.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
        await expect(page.locator('[data-atria-draft="true"]')).toHaveCount(0);
        expect(await page.evaluate(() => window.Atria.nativeSessionRuntime.snapshot.timeline.some(item => item.content?.includes('Uncommitted streaming draft')))).toBe(false);
        await page.screenshot({ path: resolve(directory, `stopped-${viewport.width}.png`), fullPage: true });
        expect(errors).toEqual([]);
    });

    test(`Studio Agent generates and yields to human takeover at ${viewport.width}px`, async ({ page }, info) => {
        await page.setViewportSize(viewport);
        await page.addInitScript(() => localStorage.setItem('language', 'en'));
        await awaitMainUI(page, server.baseURL);
        const projectId = createNativeId('project');
        const packageId = createNativeId('package');
        const source = { format: 'atria-project-source', schemaVersion: 1,
            project: { projectId, packageId, displayName: 'P4 Studio', createdAt: 10, updatedAt: 10 },
            package: { name: 'P4 Studio', version: '1.0.0', actors: [], capabilities: ['narrative'], permissions: [],
                entryPoints: [{ entryPointId: createNativeId('entryPoint'), displayName: 'Main', actorIds: [], worldIds: [], knowledgeBindingIds: [] }] },
            worlds: [], knowledge: [], knowledgeBindings: [], assetFiles: [], dependencies: { worlds: [], knowledge: [], knowledgeBindings: [], assets: [] } };
        await page.evaluate(async source => {
            const response = await fetch('/api/native/studio/projects', { method: 'POST', headers: window.Atria.getContext().getRequestHeaders(), body: JSON.stringify({ source }) });
            if (!response.ok) throw new Error(await response.text());
            await window.Atria.shell.getWorkspaceHost().openBuild(source.project.projectId);
        }, source);
        await page.getByRole('button', { name: 'AI', exact: true }).first().click();
        const agent = page.locator('[data-atria-studio-ai="agent"]');
        await agent.getByRole('textbox', { name: 'Project Agent intent' }).fill('Inspect this project. Do not edit or commit.');
        const request = page.waitForResponse(response => response.url().includes('/api/native/generation/execute'));
        await agent.getByRole('button', { name: 'Create Task', exact: true }).click();
        const response = await request;
        expect(response.status(), await response.text()).toBe(200);
        await expect(agent).toContainText('Native P4 reply');
        await agent.getByRole('button', { name: 'Human Takeover', exact: true }).click();
        await expect(agent).toContainText('taken_over');
        await expect(agent.getByRole('button', { name: 'Review & Commit', exact: true })).toHaveCount(0);
        const directory = info.outputPath('visual'); mkdirSync(directory, { recursive: true });
        await page.screenshot({ path: resolve(directory, `studio-${viewport.width}.png`), fullPage: true });
    });
}
