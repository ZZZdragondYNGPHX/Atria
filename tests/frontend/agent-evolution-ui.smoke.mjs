// Real browser, shared production pane in both entrances; fixture APIs only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../../public');
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>Evolution pane fixture</title><main><section id="rp"></section><section id="project"></section></main>'); return; }
        const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
        if (!path.startsWith(root + sep) || !path.endsWith('.js')) throw new Error('Not an asset');
        res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(path));
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ headless: true }); const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(async () => {
        const { mountAgentEvolution } = await import('/scripts/native/agent-evolution-panel.js');
        window.calls = []; window.disposers = [];
        for (const entrance of ['rp', 'project']) {
            let experience = null;
            const scope = entrance === 'project' ? { domain: 'project', projectId: 'fixture-project' } : { domain: 'rp_chat', charDir: 'Actor', name: 'fixture', isGroup: false, groupId: '' };
            const state = { readOnly: false, owner: null, scope: null };
            const request = async (group, action, value) => {
                window.calls.push({ entrance, group, action, value });
                if (group === 'experience') {
                    if (action === 'target') return { subject: entrance, target: { kind: 'source', id: entrance } };
                    if (action === 'submit') { experience = { sequence: 1, retentionDays: 30, feedback: [{ id: 'feedback', signal: value.feedback.signal, status: 'active', applicability: 'current', kind: 'explicit', note: value.feedback.note, source: { id: entrance } }] }; return experience; }
                    if (action === 'deleteScope') { experience = null; return { deleted: true }; }
                    return experience;
                }
                if (action === 'inspect') return structuredClone(state);
                if (action === 'budget') { state.owner = { sequence: 1, limits: value.limits, totals: { requests: 0, tokens: 0 }, unsettled: 0 }; return state.owner; }
                if (action === 'catalog') return { choices: [{ label: 'Original local field', baseHash: 'base', target: { kind: 'project-strategy', taskId: 'pristine', field: 'maxRepairRounds' } }], routes: [{ routeId: 'fixture-route', role: 'role.studio' }] };
                if (action === 'configure') { state.scope = { sequence: 1, policy: { mode: value.mode, reason: null }, jobs: [], publications: [] }; return state.scope; }
                if (action === 'mode') { state.scope.policy.mode = value.mode; state.scope.sequence++; return state.scope; }
                if (action === 'start') { state.scope.jobs = [{ id: 'bounded-job', status: 'queued', candidates: [], dependencies: { feedbackRefs: [{ id: 'feedback' }] } }]; return { status: 'queued' }; }
                return {};
            };
            window.disposers.push(mountAgentEvolution({ slot: document.getElementById(entrance), scope, sourceKind: entrance === 'rp' ? 'evidence' : 'project_task', sourceId: entrance, request }));
        }
    });
    for (const entrance of ['rp', 'project']) {
        const pane = page.locator('#' + entrance); await pane.getByText('Feedback and local evolution', { exact: true }).click();
        await pane.getByLabel('Public note').fill('<img src=x onerror="window.injected=true"> Preserve my choice.'); await pane.getByRole('button', { name: 'Save feedback', exact: true }).click();
        await pane.getByText('correction · active · current', { exact: true }).waitFor(); assert.equal(await page.evaluate(() => window.injected), undefined);
        await pane.getByText('Shared account budget', { exact: true }).click(); await pane.getByLabel('Total request limit').fill('40'); await pane.getByLabel('Total token limit').fill('100000');
        await pane.getByRole('button', { name: 'Save budget', exact: true }).click();
        await pane.getByText('Choose a local target and policy', { exact: true }).click(); await pane.getByRole('button', { name: 'Load available targets', exact: true }).click();
        await pane.getByText('Choose a local target and policy', { exact: true }).click(); assert.equal(await pane.getByLabel('Policy', { exact: true }).inputValue(), 'review');
        await pane.getByRole('button', { name: 'Declare this field and enable policy', exact: true }).click();
        await pane.getByRole('button', { name: 'Evaluate a candidate', exact: true }).click(); await pane.getByText('Job · queued', { exact: true }).waitFor();
        await pane.getByRole('button', { name: 'Pause', exact: true }).click(); assert.ok((await pane.textContent()).includes('Policy: paused'));
        await pane.getByRole('button', { name: 'Delete scope feedback and derived reports', exact: true }).click();
    }
    const calls = await page.evaluate(() => window.calls);
    assert.equal(calls.filter(c => c.action === 'configure').length, 2); assert.ok(calls.filter(c => c.action === 'configure').every(c => c.value.mode === 'review' && c.value.price === null));
    assert.equal(calls.filter(c => c.action === 'publish').length, 0); assert.deepEqual(errors, []);
    await page.evaluate(() => window.disposers.forEach(fn => fn())); assert.equal(await page.locator('.atria-agent-evolution').count(), 0);
    console.log('Evolution browser pane: RP + Project feedback, budget, default review, finite job, pause, delete and escaped text passed');
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
