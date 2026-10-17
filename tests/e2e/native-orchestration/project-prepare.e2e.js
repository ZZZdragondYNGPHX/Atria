import { test, expect } from '@playwright/test';
import express from 'express';
import { fileURLToPath } from 'node:url';
import { projectCommitFixture } from '../../native-orchestration/helpers/project-commit-fixture.js';
import { makeTempFsEngineHarness } from '../../storage/harness/contract-harness.js';
import { NativeGenerationHost } from '../../../src/native/adapters/generation-host.js';
import { createNativeStudioRouter } from '../../../src/endpoints/native-studio.js';
import { createNativeOrchestrationRouter } from '../../../src/endpoints/native-orchestration.js';
import { createOrchestrationAuthoringService } from '../../../src/native/orchestration/authoring-service.js';
import { RunObservationService } from '../../../src/native/orchestration/run-observation-service.js';
import { createNativeId } from '../../../src/native/identity.js';

test.use({ actionTimeout: 15000 });
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    test(`trusted Project preparation uses current review at ${viewport.width}px`, async ({ page }, testInfo) => {
        const f = await projectCommitFixture(makeTempFsEngineHarness);
        let listener;
        try {
            const host = new NativeGenerationHost({ projectCommitAuthority: f.authority });
            const source = { domain: 'project', projectId: f.projectId, taskId: f.taskId };
            const authoring = createOrchestrationAuthoringService(f.h.engine, { projectAgent: f.agent, studio: f.studio });
            await authoring.plans.saveBinding(f.h.handle, createNativeId('orchestrationCommand'), { sourceSelector: source, planRef: f.planRef, expectedVersion: null });
            const observations = new RunObservationService({ engine: f.h.engine, projectAgent: f.agent, studio: f.studio });
            const app = express(); app.use(express.json({ limit: '8mb' }));
            app.use((req, _res, next) => { req.user = { profile: { handle: f.h.handle } }; next(); });
            app.use('/api/native/studio', createNativeStudioRouter(() => f, undefined, () => host));
            app.use('/api/native/orchestration', createNativeOrchestrationRouter(() => ({ ...authoring, observations })));
            app.get('/test', (_req, res) => res.type('html').send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/css/atria-shell.css"><link rel="stylesheet" href="/css/atria-orchestration.css"></head><body><main id="root"></main><script type="module">
                import { mountRunList } from '/scripts/native/orchestration/run-workspace.js';
                import { createOrchestrationClient } from '/scripts/native/orchestration/client.js';
                window.Atria = { getContext: () => ({ getRequestHeaders: () => ({}) }) };
                mountRunList({ document, root: document.querySelector('#root'), client: createOrchestrationClient(),
                    onOpenRun: (runId, source) => { window.prepared = { runId, source }; } });
                </script></body></html>`));
            app.use(express.static(fileURLToPath(new URL('../../../public', import.meta.url))));
            listener = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
            const preparations = [];
            page.on('request', request => { if (request.url().endsWith('/commit/prepare')) preparations.push(request.postDataJSON()); });
            await page.setViewportSize(viewport);
            await page.goto(`http://127.0.0.1:${listener.address().port}/test`);
            await page.getByLabel('Source type', { exact: true }).selectOption('project');
            await page.getByLabel('Project', { exact: true }).selectOption(f.projectId);
            await page.getByLabel('Task', { exact: true }).selectOption(f.taskId);
            await expect(page.getByRole('button', { name: 'Prepare trusted commit', exact: true })).toBeVisible();
            await page.getByRole('button', { name: 'Prepare trusted commit', exact: true }).click();
            await expect.poll(() => page.evaluate(() => window.prepared?.runId)).toMatch(/^orun_/);
            expect(preparations).toHaveLength(1);
            expect(preparations[0]).toMatchObject({ expectedSequence: f.task.sequence, expectedReviewHash: f.input.expectedReviewHash, planRef: f.planRef });
            expect((await f.agent.getTask(f.h.handle, f.projectId, f.taskId)).changeSets).toEqual([]);
            expect((await f.studio.getProject(f.h.handle, f.projectId)).source.project.displayName).toBe(f.source.project.displayName);
            await page.screenshot({ path: testInfo.outputPath('trusted-commit-prepared.png'), fullPage: true });
            await page.reload();
            await expect(page.getByRole('button', { name: 'Prepare trusted commit', exact: true })).toBeVisible();
            await expect(page.locator('.atria-orch-run-list .atria-orch-row')).toHaveCount(1);
        } finally {
            if (listener) await new Promise(resolve => listener.close(resolve));
            await f.cleanup();
        }
    });
}
