import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { bridgeFixture } from './helpers/frontend-bridge-fixture.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { compileBridge, validateCompiledBridge } from '../../src/native/frontend/bridge.js';
import { FrontendBridgeService, frontendBridgeService } from '../../src/native/frontend/host-bridge.js';
import { createNativeSessionRouter } from '../../src/endpoints/native-session.js';
import { createFrontendBridge } from '../../public/scripts/native/frontend/bridge.js';

const tick = () => new Promise(resolve => setTimeout(resolve, 15));
describe('Frontend Host Bridge v1 data plane', () => {
    let h, svc, f, base, host, opened;
    beforeEach(async () => {
        h = await makeTempFsEngineHarness(); svc = services(h); f = bridgeFixture(); host = new FrontendBridgeService();
        const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: f.files });
        await svc.packageInstaller.install(h.handle, archive);
        base = await svc.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        opened = await host.open(svc, h.handle, base.session.sessionId);
    });
    afterEach(async () => { host?.dispose(); if (base) frontendBridgeService.revoke(h.handle, base.session.sessionId); jest.restoreAllMocks(); await h.cleanup(); });
    const call = (method, bindingId, extra = {}) => host.request(svc, h.handle, { epoch: opened.epoch, revision: opened.revision, componentId: 'Main', method, bindingId, input: {}, ...extra });
    const save = (label = 'saved', extra = {}) => call('action.invoke', 'save', { input: { label }, idempotencyKey: 'save-1', ...extra });
    async function append(id) {
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: id, action: { kind: 'app.command', domainId: 'notes', recordId: id, commandId: 'save', args: { text: id } } }, { expectedRevisionId: base.revision.revisionId });
        opened.revision = base.revision.revisionId;
    }
    test('compiled mappings, target digests and query policies are closed and scope is inferred', () => {
        const bridge = compileBridge({ version: 1, bindings: f.bindings }, f.contract);
        expect(() => validateCompiledBridge(bridge, f.contract)).not.toThrow();
        expect(bridge.bindings[2].mapping.fields.text.input).toBe('label');
        for (const modify of [b => b[2].mapping.fields.text.input = 'unknown', b => b[2].mapping.fields.raw = { constant: 1 }, b => b[1].collection.pageSize = 257, b => b[1].collection.orderBy = 'value', b => b.push(b[0])]) {
            const bindings = structuredClone(f.bindings); modify(bindings); expect(() => compileBridge({ version: 1, bindings }, f.contract)).toThrow();
        }
    });
    test.each([
        ['read.snapshot', 'missing', {}], ['action.invoke', 'save', { componentId: 'Child' }],
        ['read.snapshot', 'save', {}], ['read.page', 'notes', {}],
    ])('denies undeclared/kind/scope mismatch %s %s', async (method, binding, extra) => {
        expect((await call(method, binding, extra)).ok).toBe(false);
        expect((await svc.core.load(h.handle, base.session.sessionId)).revision.revisionId).toBe(base.revision.revisionId);
    });
    test('only typed Application command writes; public Receipt has no Authority snapshot; replay is once-only', async () => {
        const spy = jest.spyOn(svc.core, 'applyLifecycleCommand');
        const [one, two] = await Promise.all([save(), save()]);
        expect(one).toEqual(two); expect(one.ok).toBe(true); expect(one.data).toEqual({}); expect(one.snapshot).toBeUndefined(); expect(spy).toHaveBeenCalledTimes(1);
        expect((await save('different')).error.code).toBe('bridge_idempotency_conflict');
        const current = await svc.core.load(h.handle, base.session.sessionId);
        expect(current.states.atri_lifecycle.domains.notes.records[0].value).toEqual({ text: 'saved' });
        const projection = await call('read.snapshot', 'notes', { revision: one.revision });
        expect(projection.data).toEqual([{ id: 'main', value: { text: 'saved' } }]);
        expect((await save('stale', { idempotencyKey: 'new' })).error.code).toBe('bridge_revision_stale');
    });
    test('snapshot subscription rebinds on revision and scoped handles share compiled semantics', async () => {
        const bridge = await createFrontendBridge({ descriptor: compileBridge({ version: 1, bindings: f.bindings }, f.contract), transport: {
            open: previous => host.open(svc, h.handle, base.session.sessionId, previous), request: body => host.request(svc, h.handle, body),
        } });
        const main = bridge.scope('Main', ['save', 'notes']), child = bridge.scope('Child', []), values = [];
        const stop = main.subscribe('notes', {}, receipt => values.push(receipt)); await tick();
        expect((await child.invoke('save', { label: 'no' })).error.code).toBe('bridge_binding_denied');
        expect((await main.invoke('save', { label: 'yes' })).ok).toBe(true);
        expect(values.at(-1).data[0].value.text).toBe('yes');
        stop(); main.dispose(); child.dispose(); bridge.dispose();
    });
    test('Collection pages use formal projection; cursor binds query/revision/order/epoch', async () => {
        for (const id of ['c', 'a', 'b', 'd']) await append(id);
        const first = await call('read.page', 'page'); expect(first.data.map(item => item.id)).toEqual(['a', 'b']); expect(first.cursor).toBeTruthy();
        const second = await call('read.page', 'page', { cursor: first.cursor }); expect(second.data.map(item => item.id)).toEqual(['c', 'd']); expect(second.cursor).toBeNull();
        expect((await call('read.page', 'page', { input: { search: 'a' }, cursor: first.cursor })).error.code).toBe('bridge_cursor_stale');
        expect((await call('read.page', 'page', { input: { sql: 'select' } })).error.code).toBe('bridge_schema_invalid');
        expect((await call('read.page', 'page', { cursor: 'forged' })).error.code).toBe('bridge_cursor_stale');
        await append('e'); expect((await call('read.page', 'page', { cursor: first.cursor })).error.code).toBe('bridge_cursor_stale');
        opened = await host.open(svc, h.handle, base.session.sessionId, opened.epoch);
        expect((await call('read.page', 'page', { cursor: first.cursor })).error.code).toBe('bridge_cursor_stale');
    });
    test('branch switch and reload revoke handles, including away-and-back between reads', async () => {
        const original = base.revision.branchId;
        const fork = await svc.core.forkBranch(h.handle, base.session.sessionId, { expectedRevisionId: base.revision.revisionId });
        await svc.core.switchBranch(h.handle, base.session.sessionId, original, { expectedRevisionId: fork.revision.revisionId });
        expect((await call('read.snapshot', 'notes')).error.code).toBe('bridge_epoch_stale');
        opened = await host.open(svc, h.handle, base.session.sessionId);
        const old = opened.epoch; opened = await host.open(svc, h.handle, base.session.sessionId, old);
        expect((await call('read.snapshot', 'notes', { epoch: old })).error.code).toBe('bridge_epoch_stale');
    });
    test('Operation delegates scheduler/provider work to typed Host, exposes bounded status and cancels on Epoch', async () => {
        let finish, signal;
        svc.generationHost = { executeTask: jest.fn(async (_owner, input, abort, onChunk) => { signal = abort; expect(input.taskId).toBe('summarize'); onChunk({ text: 'partial' }); await new Promise(resolve => { finish = resolve; }); return { secret: 'not projected' }; }) };
        svc.taskBindings = async () => ({ structured: { scope: 'player', runtimeRouteId: 'chosen-by-host' } });
        const start = await call('operation.start', 'task', { idempotencyKey: 'op' }); expect(start.ok).toBe(true); await tick();
        expect((await call('operation.get', 'task', { operationId: start.operationId })).status).toBe('progress');
        expect((await call('operation.get', 'task', { operationId: 'guessed' })).ok).toBe(false);
        const cancelled = await call('operation.cancel', 'task', { operationId: start.operationId }); expect(cancelled.status).toBe('cancelled'); expect(signal.aborted).toBe(true);
        finish(); await tick(); expect((await call('operation.get', 'task', { operationId: start.operationId })).status).toBe('cancelled');
    });
    test('late Action completion cannot publish into a revoked Experience', async () => {
        const apply = svc.core.applyLifecycleCommand.bind(svc.core); let release;
        svc.core.applyLifecycleCommand = async (...args) => { const result = await apply(...args); await new Promise(resolve => { release = resolve; }); return result; };
        const pending = save(); while (!release) await tick(); host.revoke(h.handle, base.session.sessionId); release();
        expect((await pending).error.code).toBe('bridge_epoch_stale');
    });
    test('HTTP uses authenticated owner and installed graph, rejecting supplied descriptors/target selectors', async () => {
        const app = express(); app.use(express.json()); app.use((req, res, next) => { req.user = { profile: { handle: h.handle } }; next(); }); app.use(createNativeSessionRouter(() => svc));
        const open = await request(app).post('/frontend/open').send({ sessionId: base.session.sessionId }); expect(open.body.ok).toBe(true);
        const response = await request(app).post('/frontend/request').send({ epoch: open.body.epoch, componentId: 'Main', bindingId: 'notes', method: 'read.snapshot', input: {}, revision: open.body.revision });
        expect(response.body.data).toEqual([]); expect(response.headers['cache-control']).toBe('private, no-store');
        expect((await request(app).post('/frontend/open').send({ sessionId: base.session.sessionId, descriptor: {} })).body.ok).toBe(false);
        expect((await host.request(svc, 'another-owner', { epoch: opened.epoch, method: 'status' })).error.code).toBe('bridge_epoch_stale');
    });
    test('Operation completion projects only the declared typed output and replays the same start', async () => {
        let finish;
        svc.generationHost = { executeTask: jest.fn(async () => { await new Promise(resolve => { finish = resolve; }); return { record: { payload: { text: 'result' } }, snapshot: { private: true } }; }) };
        svc.taskBindings = async () => ({});
        const first = await call('operation.start', 'task', { idempotencyKey: 'completed' });
        const replay = await call('operation.start', 'task', { idempotencyKey: 'completed' });
        expect(replay.operationId).toBe(first.operationId); await tick(); finish(); await tick();
        const result = await call('operation.get', 'task', { operationId: first.operationId });
        expect(result).toMatchObject({ ok: true, status: 'completed', data: { text: 'result' } });
        expect(JSON.stringify(result)).not.toContain('private'); expect(svc.generationHost.executeTask).toHaveBeenCalledTimes(1);
    });
    test('Epoch cancellation discards even a non-cooperative Operation completion', async () => {
        let finish, signal;
        svc.generationHost = { executeTask: async (_owner, _input, abort) => { signal = abort; await new Promise(resolve => { finish = resolve; }); return { record: { payload: { text: 'late' } } }; } };
        svc.taskBindings = async () => ({});
        const start = await call('operation.start', 'task', { idempotencyKey: 'late' }); await tick();
        const old = opened.epoch; opened = await host.open(svc, h.handle, base.session.sessionId, old); expect(signal.aborted).toBe(true); finish(); await tick();
        expect((await call('operation.get', 'task', { operationId: start.operationId })).error.code).toBe('bridge_operation_denied');
        expect((await call('operation.get', 'task', { epoch: old, operationId: start.operationId })).error.code).toBe('bridge_epoch_stale');
    });
    test('restore of the current SavePoint is still an Epoch boundary without a new authority revision', async () => {
        const savePoint = await svc.core.createSavePoint(h.handle, base.session.sessionId);
        await svc.core.restoreSavePoint(h.handle, base.session.sessionId, savePoint.saveId, { expectedRevisionId: base.revision.revisionId });
        expect((await call('read.snapshot', 'notes')).error.code).toBe('bridge_epoch_stale');
    });

});
