import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AtriaBrowser } from '../src/browser.js';
import { Provenance } from '../src/provenance.js';
import { ActionRegistry, PolicyCeiling, RiskExecutor } from '../src/kernel.js';
import { registerMemoryMutations } from '../src/memory-mutations.js';
import { invokeBrowserAdapter } from '../src/capability-bridge.js';

// Trusted disposable-test setup, not an MCP capability. Import only the real
// product editor/renderer; never fabricate a Preview or a Host Bridge response.
export async function verifyNativeUi({ origin, repo, artifacts, projectId, baseRevision, sessionId, workspace, evaluation, fork }) {
    const browser = new AtriaBrowser({ url: origin, timeout: 30000, channel: process.env.ATRIA_TEST_BROWSER_CHANNEL });
    const provenance = new Provenance(repo, browser);
    try {
        await browser.open({ width: 1440, height: 1000 });
        const page = browser.page;
        await page.waitForFunction(() => Boolean(globalThis.Atria?.getContext?.()?.getRequestHeaders));
        const post = (path, input) => page.evaluate(async ({ path, input }) => {
            const response = await fetch(path, { method: 'POST', headers: { ...globalThis.Atria.getContext().getRequestHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
            if (!response.ok) throw new Error('Native verification request failed: ' + response.status);
            return response.json();
        }, { path, input });
        const settle = async () => { await Promise.all([...browser.pendingEvidence]); return provenance.snapshot(); };
        const opened = await post('/api/native/session/frontend/open', { sessionId });
        assert.equal(opened.ok, true, JSON.stringify(opened));
        const before = await settle();
        assert.equal(before.experience.identity.experienceEpoch, opened.epoch);
        await fork();
        const revoked = await post('/api/native/session/frontend/request', { epoch: opened.epoch, method: 'status' });
        assert.equal(revoked.error.code, 'bridge_epoch_stale');
        const stale = await settle();
        assert.equal(stale.experience.state, 'STALE');
        assert.equal(stale.server.serverBootId, before.server.serverBootId);
        assert.equal(stale.browserFreshness, 'CURRENT');
        const reopened = await post('/api/native/session/frontend/open', { sessionId, previous: opened.epoch });
        assert.equal(reopened.ok, true); assert.notEqual(reopened.epoch, opened.epoch);
        await settle();
        await post('/api/native/session/frontend/close', { epoch: reopened.epoch });

        await page.evaluate(async sessionId => {
            await globalThis.Atria.openNativeSession(sessionId);
            const context = globalThis.Atria.getContext();
            const session = await context.getCapabilityApi('memory-graph').openSession(context);
            if (!session) throw new Error('Real Native Memory session unavailable');
        }, sessionId);
        const registry = registerMemoryMutations(new ActionRegistry(), browser);
        const executor = new RiskExecutor(registry, new PolicyCeiling(registry, registry.ids()), {
            approve: async () => ({ action: 'accept', content: { authorize: true, uses: 1 } }),
        });
        const inspect = () => executor.execute('READ', { action: 'memory.mutation.inspect' });
        const originalMemory = await inspect();
        const memoryReceipts = [];
        const memory = async (risk, action, operation) => {
            const observed = await inspect();
            const result = await executor.execute(risk, { action, input: { target: observed.target, graphHash: observed.graphHash, operation } });
            assert.equal(result.receipt.status, 'succeeded', JSON.stringify(result)); memoryReceipts.push(result.receipt); return result;
        };
        const created = await memory('MUTATE', 'memory.node.create', { type: 'event', title: 'MCP populated native Memory', fields: {} });
        const nodeId = created.receipt.created[0].id;
        await assert.rejects(executor.execute('MUTATE', { action: 'memory.node.edit', input: { target: originalMemory.target, graphHash: originalMemory.graphHash,
            operation: { id: nodeId, title: 'must reject stale graph', setFields: {} } } }), /Stale Memory/);
        await memory('MUTATE', 'memory.node.edit', { id: nodeId, title: 'MCP edited native Memory', setFields: {} });
        const second = await memory('MUTATE', 'memory.node.create', { type: 'event', title: 'MCP second native Memory', fields: {} });
        const secondId = second.receipt.created[0].id;
        await memory('MUTATE', 'memory.relation.upsert', { source: { id: nodeId }, links: [{ target: { id: secondId }, relation: 'related_to', direction: 'outgoing' }] });
        const memoryReads = {};
        for (const [action, input] of [['memory.schema', {}], ['memory.nodes.list', { activeOnly: false }], ['memory.graph.edges', { excludeInternal: false }],
            ['memory.node.get', { id: nodeId }], ['memory.search.keyword', { query: 'MCP' }], ['memory.resolve', { query: 'MCP edited native Memory' }], ['memory.injection', {}], ['memory.recall.last', {}]]) {
            memoryReads[action] = await invokeBrowserAdapter(browser, action, input);
        }
        assert.equal(memoryReads['memory.node.get'].value.id, nodeId);
        assert.equal(memoryReads['memory.node.get'].value.title, 'MCP edited native Memory');
        assert.ok(memoryReads['memory.nodes.list'].value.some(node => node.id === secondId));
        assert.ok(memoryReads['memory.graph.edges'].value.some(edge => edge.from === nodeId && edge.to === secondId));
        assert.ok(memoryReads['memory.search.keyword'].value.some(node => node.id === nodeId));
        assert.ok(memoryReads['memory.resolve'].value.matches.some(node => node.id === nodeId));
        await memory('DESTRUCTIVE', 'memory.relation.delete', { source: { id: nodeId }, target: { id: secondId }, relation: 'related_to', direction: 'outgoing' });
        const compacted = await memory('MUTATE', 'memory.compact', { type: 'event', childIds: [nodeId, secondId], summary: 'MCP compacted native Memory', fields: {} });
        const populatedMemory = await inspect();
        assert.notEqual(populatedMemory.graphHash, originalMemory.graphHash);
        await memory('DESTRUCTIVE', 'memory.node.delete', { id: nodeId });
        await memory('DESTRUCTIVE', 'memory.node.delete', { id: secondId });
        await memory('DESTRUCTIVE', 'memory.node.delete', { id: compacted.receipt.created[0].id });
        await page.evaluate(async () => {
            await globalThis.Atria.nativeSessionRuntime.reload();
            const context = globalThis.Atria.getContext();
            await context.getCapabilityApi('memory-graph').openSession(context);
        });
        const cleanedMemory = await invokeBrowserAdapter(browser, 'memory.nodes.list', { activeOnly: false });
        assert.ok(cleanedMemory.value.every(node => ![nodeId, secondId, compacted.receipt.created[0].id].includes(node.id)), 'Owned nodes stay deleted after reload');

        // Render the exact Preview returned in the MCP evaluation receipt.
        const exact = await page.evaluate(async ({ previewId }) => {
            const { nativeStudioClient } = await import('/scripts/native/studio-client.js');
            const { mountStudioPreviewUi } = await import('/scripts/native/studio-preview-ui.js');
            const result = await nativeStudioClient.getPreviewUi(previewId);
            const root = document.createElement('main'); root.id = 'mcp-verification-preview';
            document.body.replaceChildren(root);
            await mountStudioPreviewUi(document, root, result.model, result.experience.mode,
                item => { root.dataset.diagnostic = String(item.reasonCode || item.message); },
                { entry: result.experience.frontend.entry, files: result.compiledFiles, bridgeProjections: result.bridgeProjections });
            return { previewId: result.previewId, packageVersionId: result.packageVersionId, format: result.model.format };
        }, { previewId: evaluation.preview.previewId });
        assert.equal(exact.previewId, evaluation.preview.previewId);
        assert.equal(exact.packageVersionId, evaluation.preview.packageVersionId);
        assert.equal(exact.format, 'atria-frontend-index');
        await page.getByText('MCP REVIEWED Fixture', { exact: true }).waitFor();
        const captures = [];
        for (const [name, width, height] of [['preview-desktop', 1440, 1000], ['preview-narrow', 390, 844]]) {
            await browser.resize({ width, height });
            const snapshot = await browser.snapshot();
            assert.match(snapshot.accessibility, /MCP REVIEWED Fixture/);
            await writeFile(join(artifacts, name + '.jpg'), (await browser.screenshot()).bytes);
            captures.push({ name, snapshot, provenance: await settle() });
        }
        // Exercise the actual Source Graph editor and its own formal evaluation.
        await page.evaluate(async ({ projectId, baseRevision }) => {
            const { mountFrontendEditor } = await import('/scripts/native/studio-frontend-editor.js');
            const root = document.createElement('main'); root.id = 'mcp-verification-editor'; document.body.replaceChildren(root);
            globalThis.__verificationEditor = await mountFrontendEditor({ document, root, projectId, baseRevision, stageOperations: () => { throw new Error('Verification must not apply UI drafts'); } });
        }, { projectId, baseRevision });
        const previewLabel = await page.evaluate(async () => (await import('/scripts/atria-shell/localization.js')).translateShellText('Preview draft'));
        await page.getByRole('button', { name: previewLabel, exact: true }).click();
        await page.locator('.atria-studio-preview-canvas').getByText('MCP READ Fixture', { exact: true }).waitFor();
        const editor = await settle();
        assert.equal(editor.preview.identity.projectId, projectId);
        assert.equal(editor.preview.identity.baseRevision, baseRevision);
        assert.ok(editor.preview.identity.workspaceId);
        assert.ok(editor.preview.identity.operationsFingerprint);
        assert.equal(editor.preview.uiLoaded, true);
        assert.notEqual(editor.preview.identity.previewId, evaluation.preview.previewId, 'Another Preview cannot stand in for the reviewed Preview');
        await browser.resize({ width: 1440, height: 1000 });
        await writeFile(join(artifacts, 'source-editor-preview.jpg'), (await browser.screenshot()).bytes);
        await page.evaluate(() => globalThis.__verificationEditor.dispose());
        const evidence = { scope: 'Real Atria editor/renderer in a disposable test-mounted surface; not full shell navigation or human approval UX',
            epoch: { before, stale, reopened }, memory: { originalMemory, populatedMemory, reads: memoryReads, cleanedMemory, receipts: memoryReceipts, approval: 'deterministic trusted harness; not client human UX' }, reviewedPreview: { workspace, evaluation, exact, captures }, editor,
            diagnostics: browser.events };
        await writeFile(join(artifacts, 'native-ui.json'), JSON.stringify(evidence, null, 2));
        return evidence;
    } catch (error) {
        if (browser.page && !browser.page.isClosed()) {
            await writeFile(join(artifacts, 'native-ui-failure.json'), JSON.stringify({ snapshot: await browser.snapshot(), scope: browser.scopedEvidence, diagnostics: browser.events }, null, 2));
            await writeFile(join(artifacts, 'native-ui-failure.jpg'), (await browser.screenshot()).bytes);
        }
        throw error;
    } finally { await browser.close(); }
}
