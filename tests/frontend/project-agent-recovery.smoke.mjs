// Isolated local Studio / SQLite / Git with the actual browser panel. No model requests.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { chromium } from '../node_modules/playwright/index.mjs';
import { setConfigFilePath } from '../../src/util.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { projectSource, services } from '../agent-intelligence/project-fixture.js';

setConfigFilePath(fileURLToPath(new URL('../../default/config.yaml', import.meta.url)));
const { createNativeStudioRouter } = await import('../../src/endpoints/native-studio.js');

const h = await makeTempSqliteEngineHarness();
let current = services(h), browser, server;
try {
    const source = projectSource(), projectId = source.project.projectId;
    const created = await current.studio.createProject(h.handle, source);
    let task = await current.agent.createTask(h.handle, projectId, { intent: 'Browser recovery fixture', baseRevision: created.revision.revision });
    task = await current.agent.setPlan(h.handle, projectId, task.taskId, { summary: 'Rename', steps: [{ id: 'rename', title: 'Rename', impact: 'low' }] });
    task = await current.agent.executeTool(h.handle, projectId, task.taskId, { name: 'atri_agent_project_save', args: { source: { ...source, project: { ...source.project, displayName: 'Browser committed' } }, stepId: 'rename' } });
    task = await current.agent.beginGeneration(h.handle, projectId, task.taskId, { expectedSequence: task.sequence });
    task = await current.agent.finishGeneration(h.handle, projectId, task.taskId, { attemptId: task.attempts.at(-1).attemptId, status: 'completed',
        conversation: [...task.conversation, { role: 'assistant', content: 'Saved review conversation' }] });
    task = await current.agent.prepareReview(h.handle, projectId, task.taskId);
    const app = express(); app.use(express.json({ limit: '4mb' }));
    app.use((req, _res, next) => { req.user = { profile: { handle: h.handle } }; next(); });
    app.use('/api/native/studio', createNativeStudioRouter(() => current));
    app.get('/__s04', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/atria-studio.css"><style>body{margin:20px;background:#17191d;color:#eee}.atria-studio{max-width:680px}pre{overflow:auto}select{max-width:100%}</style></head><body><main class="atria-studio"><aside id="ai"></aside></main><script type="module">
        import { mountNativeStudioAgent } from '/scripts/native/studio-agent.js';
        globalThis.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
        window.committedRefreshes = 0;
        window.panel = mountNativeStudioAgent({ document, slot: document.getElementById('ai'), projectId: ${JSON.stringify(projectId)}, getRevision: () => ({revision:${JSON.stringify(task.baseRevision)}}), onProjectCommitted: async () => { window.committedRefreshes++; } });
        </script></body></html>`));
    app.use(express.static(fileURLToPath(new URL('../../public', import.meta.url))));
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
    const errors = []; let generations = 0, commits = 0;
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', req => {
        if (req.url().includes('/api/native/generation/execute')) generations++;
        if (req.url().endsWith('/commit') && req.method() === 'POST') commits++;
    });
    const url = `http://127.0.0.1:${server.address().port}/__s04`;
    const select = async id => {
        await page.locator(`select option[value="${id}"]`).waitFor({ state: 'attached' });
        await page.getByRole('combobox', { name: 'Project Tasks' }).selectOption(id);
        await page.getByText('Task conversation', { exact: true }).waitFor();
    };
    await page.goto(url); await select(task.taskId);
    await page.getByText('Task conversation', { exact: true }).click();
    await page.getByText('Saved review conversation', { exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Review & Commit', exact: true }).waitFor();
    current = services(h); await page.reload(); await select(task.taskId);
    await page.getByText('Task conversation', { exact: true }).click();
    await page.getByText('Saved review conversation', { exact: true }).waitFor({ state: 'visible' });
    await page.screenshot({ path: '/tmp/atria-s04-review.png', fullPage: true });
    const save = current.repository.save.bind(current.repository); let failed = false;
    current.repository.save = async (...args) => {
        if (args[1].status === 'completed' && !failed) { failed = true; throw new Error('Browser injected task save failure'); }
        return save(...args);
    };
    await page.getByRole('button', { name: 'Review & Commit', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'The committed changes were recovered.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Review & Commit', exact: true }).count(), 0);
    assert.equal(commits, 1); assert.equal(generations, 0);
    assert.equal(await page.evaluate(() => window.committedRefreshes), 1);
    assert.equal((await current.studio.getProject(h.handle, projectId)).source.project.displayName, 'Browser committed');
    assert.equal((await current.studio.history(h.handle, projectId)).filter(item => item.message.startsWith('Atria Studio ChangeSet')).length, 1);
    current = services(h); await page.setViewportSize({ width: 390, height: 844 }); await page.reload(); await select(task.taskId);
    await page.getByRole('status').filter({ hasText: 'The committed changes were recovered.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Review & Commit', exact: true }).count(), 0);
    await page.screenshot({ path: '/tmp/atria-s04-completed-mobile.png', fullPage: true });
    const revision = await current.studio.getRevision(h.handle, projectId);
    const other = await current.agent.createTask(h.handle, projectId, { intent: 'Conflict fixture', baseRevision: revision.revision });
    const project = await current.studio.getProject(h.handle, projectId);
    await current.studio.saveProjectSource(h.handle, projectId, { source: { ...project.source, project: { ...project.source.project, displayName: 'Human revision' } }, baseRevision: revision.revision });
    await page.reload(); await select(other.taskId);
    await page.getByRole('status').filter({ hasText: 'The Project changed or its Commit could not be verified.' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Review & Commit', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Continue', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(generations, 0); assert.equal(commits, 1); assert.deepEqual(errors, []);
    await page.screenshot({ path: '/tmp/atria-s04-conflict-mobile.png', fullPage: true });
    console.log('S04 browser smoke passed: reload conversation/Review, failed-save receipt recovery, completed/conflict mobile, 1 Commit, 0 generations.');
} finally {
    await browser?.close();
    if (server) await new Promise(resolve => server.close(resolve));
    await h.cleanup();
}
