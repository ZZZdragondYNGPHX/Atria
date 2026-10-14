import express from 'express';
import request from 'supertest';
import { describe, expect, jest, test } from '@jest/globals';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { installFixture } from './helpers/session-fixture.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { NativeMemoryAuthority } from '../../src/native/memory-authority.js';
import { createNativeMemoryRouter } from '../../src/endpoints/native-memory.js';
import { registerVisualWake } from '../../src/native/visual-events.js';

const toolRoot = process.env.ATRIA_MCP_SOURCE ? resolve(process.env.ATRIA_MCP_SOURCE) : null;
(toolRoot ? describe : describe.skip)('real MCP Memory Adapter → Native source lifecycle → Session commit', () => {
    let modules, h, f, base, messageId, authority, settings, executor, writes, approvals, loseReply, changeSettings, wake;
    beforeAll(async () => {
        const actions = await import(pathToFileURL(join(toolRoot, 'src/native-memory-actions.js')).href);
        const kernel = await import(pathToFileURL(join(toolRoot, 'src/kernel.js')).href);
        modules = { ...actions, ...kernel };
    });
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); f = await installFixture(h); base = await f.core.create(h.handle, f.start);
        base = await f.core.appendTimeline(h.handle, base.session.sessionId, { role: 'user', content: 'The sword is kept in the harbor.' }); messageId = base.timeline.at(-1).messageId;
        settings = new SettingsRepo({ engine: h.engine }); await settings.save(h.handle, { atri_capabilities: { memory_graph: { sourceWritesEnabled: true } } });
        authority = new NativeMemoryAuthority({ core: f.core, settingsRepo: settings }); wake = jest.fn(async () => {}); registerVisualWake(h.engine, wake);
        const app = express(); app.use(express.json());
        const boot = '12345678-1234-4123-8123-123456789012';
        app.use((req, res, next) => { req.user = { profile: { handle: h.handle } }; res.set('x-atria-server-boot-id', boot); next(); });
        app.use('/api/native/memory', createNativeMemoryRouter(() => authority));
        writes = []; approvals = 0; loseReply = false; changeSettings = false;
        const wrap = result => ({ ok: () => result.status < 400, status: () => result.status, headers: () => result.headers, body: async () => Buffer.from(result.text), dispose: async () => {} });
        const browser = { config: { url: 'http://localhost', timeout: 1000, maxResponseBytes: 1048576 }, start: async () => {}, context: { request: {
            get: async () => ({ ok: () => true, status: () => 200, headers: () => ({ 'content-type': 'application/json' }), body: async () => Buffer.from('{"token":"fixture"}'), dispose: async () => {} }),
            fetch: async (url, options) => {
                const path = new URL(url).pathname;
                if (path.endsWith('/batch')) writes.push(options.data);
                const result = await request(app).post(path).set(options.headers).send(options.data);
                if (loseReply && path.endsWith('/batch') && result.status === 200) throw new Error('Native commit accepted; client acknowledgement lost');
                return wrap(result);
            },
        } } };
        const registry = modules.registerNativeMemoryActions(new modules.ActionRegistry(), browser);
        executor = new modules.RiskExecutor(registry, new modules.PolicyCeiling(registry, registry.ids()), { approve: async () => {
            approvals++; if (changeSettings) await settings.save(h.handle, { atri_capabilities: { memory_graph: { sourceWritesEnabled: false } } });
            return { action: 'accept', content: { authorize: true } };
        } });
    });
    afterEach(async () => { await h.cleanup(); });
    const prepared = async () => {
        const sessionId = base.session.sessionId;
        const observed = (await executor.execute('READ', { action: 'memory.native.observe', input: { sessionId } })).data;
        const selected = (await executor.execute('READ', { action: 'memory.native.sources', input: { sessionId, messageIds: [messageId] } })).data.sources[0];
        return { sessionId, expectedRevisionId: observed.identity.revisionId, expectedBranchId: observed.identity.branchId, expectedLedgerFingerprint: observed.ledgerFingerprint,
            expectedSettingsFingerprint: observed.settingsFingerprint, commitId: 'memory-adapter-commit', messageIds: [messageId],
            facts: [{ action: 'create', text: 'The sword is in the harbor.', type: 'explicit', evidence: [{ episodeId: selected.episodeId, excerpt: 'kept in the harbor' }] }] };
    };
    test('real headless source inspection and exact approved fact commit need no browser document or model', async () => {
        const input = await prepared();
        const result = await executor.execute('MUTATE', { action: 'memory.native.batch.apply', input });
        expect(result.receipt.status).toBe('succeeded'); expect(result.receipt.after.commitReceipt.status).toBe('committed'); expect(approvals).toBe(1);
        expect((await authority.observe(h.handle, { sessionId: input.sessionId })).facts.values).toHaveLength(1);
        expect((await f.core.observe(h.handle, input.sessionId)).timeline).toEqual(base.timeline); expect(wake).not.toHaveBeenCalled();
    });
    test('owner consent changes during trusted approval block a real Native Memory write', async () => {
        const input = await prepared(); changeSettings = true;
        await expect(executor.execute('MUTATE', { action: 'memory.native.batch.apply', input })).rejects.toThrow(/Stale Native Memory/);
        expect(writes).toHaveLength(0); expect((await f.core.observe(h.handle, input.sessionId)).revision.revisionId).toBe(base.revision.revisionId);
    });
    test('lost acknowledgement retains exact recovery identity and one native committed fact', async () => {
        const input = await prepared(); loseReply = true;
        const result = await executor.execute('MUTATE', { action: 'memory.native.batch.apply', input });
        expect(result.receipt.status).toBe('indeterminate'); expect(result.receipt.after.commitId).toBe(input.commitId); expect(writes).toHaveLength(1);
        expect((await f.sessionRepo.getCommitReceipt(h.handle, input.sessionId, input.commitId)).status).toBe('committed');
        expect((await authority.observe(h.handle, { sessionId: input.sessionId })).facts.values).toHaveLength(1); expect(wake).not.toHaveBeenCalled();
    });
    test('real headless Graph adapter performs guarded original CRUD/links/rollup with destructive deletion approval', async () => {
        const sessionId = base.session.sessionId; let serial = 0;
        const graphAct = async (kind, operation, risk = 'MUTATE') => {
            const observed = (await executor.execute('READ', { action: 'memory.native.graph.observe', input: { sessionId } })).data;
            return executor.execute(risk, { action: 'memory.native.' + kind, input: { sessionId, expectedRevisionId: observed.identity.revisionId, expectedBranchId: observed.identity.branchId,
                expectedGraphFingerprint: observed.graphFingerprint, expectedSettingsFingerprint: observed.settingsFingerprint, commitId: 'graph-adapter-' + ++serial, messageIds: [messageId], operation } });
        };
        const first = await graphAct('node.create', { type: 'event', title: 'Source', fields: { summary: 'Sword at harbor' } });
        expect(first.receipt.status).toBe('succeeded'); const firstId = first.receipt.after.result.id;
        const second = await graphAct('node.create', { type: 'event', title: 'Other', fields: { summary: 'Kept sword' } }); const secondId = second.receipt.after.result.id;
        expect((await graphAct('node.edit', { id: firstId, title: 'Edited source', setFields: { summary: 'Exact source-bound edit' } })).receipt.status).toBe('succeeded');
        expect((await graphAct('relation.upsert', { source: { id: firstId }, links: [{ target: { id: secondId }, relation: 'related', direction: 'outgoing' }] })).receipt.status).toBe('succeeded');
        expect((await graphAct('relation.delete', { source: { id: firstId }, target: { id: secondId }, relation: 'related' }, 'DESTRUCTIVE')).receipt.status).toBe('succeeded');
        const rolled = await graphAct('compact', { type: 'event', childIds: [firstId, secondId], summary: 'Source rollup', fields: {} });
        expect(rolled.receipt.status).toBe('succeeded'); const rollupId = rolled.receipt.after.result.rollupNodeId;
        const deleted = await graphAct('node.delete', { id: rollupId }, 'DESTRUCTIVE');
        expect(deleted.receipt.status).toBe('succeeded'); expect(deleted.lease.remaining).toBe(0);
        expect((await authority.observeGraph(h.handle, { sessionId })).nodes.total).toBe(0);
        expect((await f.core.observe(h.handle, sessionId)).timeline).toEqual(base.timeline); expect(wake).not.toHaveBeenCalled();
    });
});
