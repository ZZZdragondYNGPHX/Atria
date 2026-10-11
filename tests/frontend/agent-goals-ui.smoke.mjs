import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../../public');
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') {
            res.setHeader('Content-Type', 'text/html');
            res.end('<!doctype html><html data-atria-appearance="dark"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/css/atria-tokens.css"><link rel="stylesheet" href="/css/atria-shell.css"><title>Goal pane fixture</title><body style="margin:16px;background:var(--atri-canvas);color:var(--atri-text-primary);font-family:var(--atri-font-sans)"><main><section id="rp"></section><section id="project"></section></main></body></html>'); return;
        }
        const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
        if (!path.startsWith(root + sep) || !/\.(js|css)$/.test(path)) throw new Error('Not an asset');
        res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ channel: process.env.ENGINE_BROWSER || 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(async () => {
        const { mountAgentGoals } = await import('/scripts/native/agent-goals-panel.js');
        window.calls = []; window.disposers = []; window.failRequest = false; window.readOnly = false; window.holdNext = false;
        for (const entrance of ['rp', 'project']) {
            const scope = entrance === 'rp' ? { domain: 'rp_chat', charDir: 'Actor', name: 'story', isGroup: false, groupId: '' } : { domain: 'project', projectId: 'project' };
            const goal = { goalId: entrance, sequence: 0, intent: 'Save the agreed outcome <img src=x onerror=alert(1)>', status: 'waiting',
                criteria: [{ criterionId: 'result', description: 'Saved source meets the agreed result' }], progress: [{ criterionId: 'result', status: 'unmet' }],
                blockers: [{ code: 'goal_criteria_unmet' }], evidence: [], budget: { maxRequests: 2, maxTokens: 64000 }, taskId: entrance === 'project' ? 'task' : null };
            const request = async (action, input) => {
                window.calls.push({ entrance, action, input });
                if (window.holdNext) { window.holdNext = false; await new Promise(resolve => { window.releaseHeld = resolve; }); }
                if (window.failRequest) throw new Error('Private details must not be shown');
                if (action === 'context') return { scope, goals: [structuredClone(goal)], readOnly: window.readOnly };
                if (action === 'inspect') return { goal: structuredClone(goal), wakes: [{ status: 'unknown' }], compute: entrance === 'project' ? {
                    attempts: [{ status: 'unknown', estimatedTokens: 100 }], localWork: [{ status: 'unknown' }],
                } : null };
                if (action === 'control') { goal.status = { pause: 'paused', resume: 'active', cancel: 'cancelled' }[input.action]; goal.sequence++; }
                if (action === 'wake' || action === 'evaluate') { goal.status = 'completed'; goal.progress[0].status = 'satisfied'; goal.sequence++; }
                return structuredClone(goal);
            };
            window.disposers.push(mountAgentGoals({ slot: document.getElementById(entrance), scope, request }));
        }
    });
    for (const entrance of ['rp', 'project']) {
        const pane = page.locator('#' + entrance);
        await pane.getByText('Persistent goals', { exact: true }).click();
        await pane.getByText('Waiting for evidence', { exact: true }).waitFor();
        assert.equal(await pane.locator('img').count(), 0);
        await pane.getByRole('button', { name: 'Inspect evidence and usage', exact: true }).click();
        await pane.getByText('Evidence and usage', { exact: true }).waitFor();
        await page.evaluate(() => { window.holdNext = true; });
        await pane.getByRole('button', { name: 'Pause goal', exact: true }).click();
        await pane.locator('[aria-busy="true"]').waitFor();
        assert.equal(await pane.getByRole('button', { name: 'Check saved evidence', exact: true }).isDisabled(), true);
        await page.evaluate(() => window.releaseHeld()); await pane.getByText('Paused', { exact: true }).waitFor();
        assert.equal(await pane.getByRole('button', { name: 'Resume goal', exact: true }).evaluate(node => document.activeElement === node), true);
        assert.equal(await pane.getByRole('button', { name: 'Check saved evidence', exact: true }).isDisabled(), true);
        await pane.getByRole('button', { name: 'Resume goal', exact: true }).click(); await pane.getByText('Ready', { exact: true }).waitFor();
        await pane.getByRole('button', { name: 'Check saved evidence', exact: true }).click(); await pane.getByText('Completed', { exact: true }).waitFor();
        assert.equal(await pane.getByRole('button', { name: 'Cancel goal', exact: true }).isDisabled(), true);
    }
    await page.evaluate(() => { window.failRequest = true; });
    const project = page.locator('#project');
    await project.getByRole('button', { name: 'Refresh goals', exact: true }).click();
    await project.getByRole('status').filter({ hasText: 'Could not update' }).waitFor();
    assert.equal((await page.locator('body').textContent()).includes('Private details'), false);
    await page.evaluate(() => { window.failRequest = false; window.readOnly = true; });
    await project.getByRole('button', { name: 'Refresh goals', exact: true }).click();
    await project.getByText('Read-only mode: goals can be inspected; controls are unavailable.', { exact: true }).waitFor();
    assert.equal(await project.getByRole('button', { name: 'Check saved evidence', exact: true }).isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
    await page.screenshot({ path: process.env.ATRIA_GOALS_SCREENSHOT || 'E:/Dev/Atria-Private/hm1-20261010/Document/s14-goals-ui-mobile-v1.png', fullPage: true });
    const calls = await page.evaluate(() => window.calls);
    assert.equal(calls.filter(call => call.entrance === 'rp' && call.action === 'wake').length, 1);
    assert.equal(calls.filter(call => call.entrance === 'rp' && call.action === 'bind').length, 0);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.disposers.forEach(dispose => dispose()));
    assert.equal(await page.locator('.atria-agent-goals').count(), 0);
    console.log('Goals browser pane: RP + Project, controls, source status, escaped text, errors, readonly, narrow layout and disposal passed');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
