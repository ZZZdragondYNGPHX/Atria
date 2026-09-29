import { jest } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { buildHeavyFixture, heavySession } from './helpers/frontend-heavy-harness.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';
import { StudioPreviewHost } from '../../src/native/studio-preview.js';
import { buildAtriaPackageContainer } from '../../src/native/package-container.js';
import { readFrontendRuntimeResource } from '../../src/native/runtime-descriptor.js';
import { projectConversation } from '../../public/shared/native-frontend-host.js';

describe.each(['component', 'hybrid', 'full'])('heavy frontend integrated %s', mode => {
    let h, built, session, host, opened;
    beforeAll(async () => {
        h = await makeTempFsEngineHarness(); built = await buildHeavyFixture(h, mode); session = await heavySession(h, built);
        host = new FrontendBridgeService(); opened = await host.open(built.svc, h.handle, session.base.session.sessionId);
    }, 30000);
    afterAll(async () => { host?.dispose(); await h?.cleanup(); });
    const call = (componentId, bindingId, method, extra = {}) => host.request(built.svc, h.handle, {
        epoch: opened.epoch, revision: opened.revision, componentId, bindingId, method, input: {}, ...extra,
    });
    const refresh = async () => { session.base = await built.svc.core.load(h.handle, session.base.session.sessionId); opened.revision = session.base.revision.revisionId; };

    test('formal Build / Preview / installed resource identity and required preflight fail closed', () => {
        const previewHost = new StudioPreviewHost();
        const preview = previewHost.create({ projectId: built.projectId, archive: built.built.archive });
        expect(preview.runtime).toEqual(built.resolved.runtime);
        expect(built.resolved.frontendGraph.resources.filter(ref => ref.kind === 'view')).toHaveLength(6);
        for (const ref of built.resolved.frontendGraph.resources) expect(readFrontendRuntimeResource(built.installed, built.resolved, ref.path).bytes).toEqual(preview.sourceFiles.get(ref.path));
        for (const path of ['Story.aui', 'controller.ts', 'vendor/layout.js', 'frontend.json']) {
            expect(built.fixture.files.has(path)).toBe(false);
            expect(() => readFrontendRuntimeResource(built.installed, built.resolved, path)).toThrow();
        }
        for (const features of [[], [{ id: 'frontend-wasm', version: 1, required: true }]]) {
            const manifest = structuredClone(built.built.manifest); manifest.runtime.experience.features = features;
            expect(() => buildAtriaPackageContainer({ manifest, sourceFiles: built.fixture.files })).toThrow();
        }
        expect(built.resolved.runtime.frontendFeatures.every(feature => feature.status === 'available')).toBe(true);
    });

    test('cross-panel writes share one Authority, stale pages/writes fail and presentation never edits Timeline', async () => {
        const timeline = session.base.timeline;
        const page = await call('People', 'people', 'read.page'); expect(page.data).toHaveLength(8);
        const all = [...page.data]; let cursor = page.cursor;
        while (cursor) { const next = await call('People', 'people', 'read.page', { cursor }); expect(next.ok).toBe(true); all.push(...next.data); cursor = next.cursor; }
        expect(new Set(all.map(row => row.id)).size).toBe(25);
        expect((await call('Phone', 'savechurch', 'action.invoke', { input: { supplies: 99 }, idempotencyKey: 'wrong-scope' })).error.code).toBe('bridge_binding_denied');
        const epoch = opened.epoch, oldRevision = opened.revision;
        for (const [component, id, input] of [['Phone', 'sms', { text: 'Meet at church' }], ['Phone', 'social', { text: 'Service starts soon' }], ['Phone', 'mail', { text: 'Supply invoice' }], ['Church', 'church', { supplies: 24 }], ['Schedule', 'schedule', { text: 'Morning service', done: true }], ['People', 'people', { text: 'Keeper', affinity: 4 }]]) {
            const action = { input, idempotencyKey: `write-${id}` };
            const one = await call(component, `save${id}`, 'action.invoke', action);
            expect(one.ok).toBe(true); expect(one.data).toEqual({});
            expect(await call(component, `save${id}`, 'action.invoke', action)).toEqual(one);
            await refresh(); expect(opened.epoch).toBe(epoch);
        }
        expect((await call('People', 'people', 'read.page', { cursor: page.cursor })).error.code).toBe('bridge_cursor_stale');
        expect((await call('Church', 'savechurch', 'action.invoke', { revision: oldRevision, input: { supplies: 99 }, idempotencyKey: 'stale' })).error.code).toBe('bridge_revision_stale');
        expect(session.base.timeline).toEqual(timeline);
        expect(session.base.states.atri_lifecycle.domains.church.records[0].value.supplies).toBe(24);
        expect(session.base.states.atri_lifecycle.domains.schedule.records[0].value.done).toBe(true);
    });

    test('Headless equals Managed projection; real scheduled AI completion is typed and never a Timeline draft', async () => {
        const first = await call('Story', 'messages', 'read.page');
        expect(first.data).toEqual(projectConversation(session.base).slice(0, 2));
        expect((await call('Story', 'messages', 'read.page', { cursor: first.cursor })).data[0].content).toContain('<img');
        const timeline = session.base.timeline;
        const request = { idempotencyKey: 'summary' };
        const start = await call('Story', 'task', 'operation.start', request); expect(start.ok).toBe(true);
        expect((await call('Story', 'task', 'operation.start', request)).operationId).toBe(start.operationId);
        let status;
        for (let i = 0; i < 200; i++) {
            status = await call('Story', 'task', 'operation.get', { operationId: start.operationId });
            if (['completed', 'failed', 'cancelled'].includes(status.status)) break;
            expect(status.data).toBeNull();
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(status).toMatchObject({ ok: true, status: 'completed', data: { text: 'District summary ready' } });
        await refresh();
        expect(session.base.timeline).toEqual(timeline);
        expect(session.base.states.atri_task_results.records).toHaveLength(1);
        expect(session.metrics).toEqual({ providerCalls: 0, deterministicExecutions: 1 });
    });

    test('SavePoint restore revokes old handles and reopens durable cross-panel state without replay', async () => {
        const saved = await call('Story', 'checkpoint', 'action.invoke', { idempotencyKey: 'checkpoint' }); expect(saved.ok).toBe(true);
        const apply = jest.spyOn(built.svc.core, 'applyLifecycleCommand');
        expect((await call('Church', 'savechurch', 'action.invoke', { input: { supplies: 99 }, idempotencyKey: 'after-save' })).ok).toBe(true);
        await refresh();
        expect((await call('Story', 'restore', 'action.invoke', { input: { saveId: saved.data.saveId }, idempotencyKey: 'restore' })).ok).toBe(true);
        expect((await call('Story', 'status', 'read.snapshot')).error.code).toBe('bridge_epoch_stale');
        opened = await host.open(built.svc, h.handle, session.base.session.sessionId);
        expect((await call('Church', 'church', 'read.page')).data[0].value.supplies).toBe(24);
        expect(apply).toHaveBeenCalledTimes(1); apply.mockRestore();
        expect(session.metrics.providerCalls).toBe(0);
    });
});
