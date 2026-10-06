import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { compileFrontend } from '../../src/native/frontend/compiler.js';
import { compileBridge, EMPTY } from '../../src/native/frontend/bridge.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { bridgeFixture } from './helpers/frontend-bridge-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';

test('fixed Experience workflow and clock bindings use durable Lifecycle gates, causality and replay', async () => {
    const h = await makeTempFsEngineHarness(), svc = services(h), host = new FrontendBridgeService();
    try {
        const f = bridgeFixture();
        f.contract = structuredClone(f.contract);
        f.contract.lifecycleRuntime.workflows = lifecycleFixture().lifecycleRuntime.workflows;
        f.manifest.runtime.experienceContract = f.contract;
        const binding = (id, lifecycle, inputSchema = EMPTY) => ({ id, kind: 'action', target: { lifecycle }, inputSchema, outputSchema: EMPTY });
        const bindings = [binding('begin', { kind: 'workflow.transition', workflowId: 'onboarding', transitionId: 'begin' }),
            binding('summarize', { kind: 'workflow.transition', workflowId: 'onboarding', transitionId: 'summarize' }),
            binding('wait', { kind: 'workflow.transition', workflowId: 'onboarding', transitionId: 'wait' }),
            binding('cancel', { kind: 'workflow.cancel', workflowId: 'onboarding' }),
            binding('advance', { kind: 'clock.advance', commandId: 'advance' }, { type: 'object', properties: { ticks: { type: 'integer', minimum: 1, maximum: 8 } }, required: ['ticks'], additionalProperties: false })];
        f.files.set('bridge.json', Buffer.from(JSON.stringify({ version: 1, bindings })));
        f.files.set('Main.aui', Buffer.from('<template><main node-id="root"><button node-id="go" on:click="go">Begin</button></main></template><contract>' + JSON.stringify({ interactions: { go: bindings.map(item => ({ kind: 'action.invoke', target: item.id, value: { object: item.id === 'advance' ? { ticks: 1 } : {} } })) } }) + '</contract>'));
        const compiled = compileFrontend({ source: 'frontend.json', files: f.files, mode: 'full', experienceContract: f.contract });
        f.manifest.runtime.experience.frontend.entry = compiled.entry;
        const archive = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map([...f.files, ...compiled.files]) }).archive;
        await svc.packageInstaller.install(h.handle, archive);
        let base = await svc.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'ready', action: { kind: 'experience.ready' } }, { expectedRevisionId: base.revision.revisionId });
        const opened = await host.open(svc, h.handle, base.session.sessionId);
        const call = (bindingId, input = {}, idempotencyKey = bindingId) => host.request(svc, h.handle, { epoch: opened.epoch, revision: opened.revision, componentId: 'Main', method: 'action.invoke', bindingId, input, idempotencyKey });
        const begin = await call('begin'); expect(begin.ok).toBe(true); opened.revision = begin.revision;
        expect((await call('begin')).revision).toBe(begin.revision);
        const summary = await call('summarize'); expect(summary.ok).toBe(true); opened.revision = summary.revision;
        base = await svc.core.load(h.handle, base.session.sessionId);
        const queued = base.states.atri_lifecycle.outbox[0];
        expect(queued.cause.revisionId).toBe(summary.revision);
        expect(queued.cause.invocationId).toMatch(/^fb:/);
        expect((await call('wait')).ok).toBe(false);
        expect((await call('advance', { ticks: 9 })).ok).toBe(false);
        expect((await call('advance', { ticks: 1, commandId: 'other' })).ok).toBe(false);
        const resumed = services(h).core;
        const next = await resumed.recordTaskResult(h.handle, base.session.sessionId, { invocationId: queued.invocationId, taskId: queued.taskId, variantId: queued.variantId, payload: { text: 'done' }, lifecycleCause: { revisionId: 'forged' } }, { expectedRevisionId: summary.revision });
        expect(next.states.atri_task_results.records[0].lifecycleCause).toMatchObject({ revisionId: summary.revision, workflowId: 'onboarding', scopeEpoch: 0 });
        opened.revision = next.revision.revisionId;
        const waiting = await call('wait', {}, 'wait-after-result'); expect(waiting.ok).toBe(true); opened.revision = waiting.revision;
        const cancelled = await call('cancel'); expect(cancelled.ok).toBe(true);
        expect((await resumed.load(h.handle, base.session.sessionId)).states.atri_lifecycle.workflows.onboarding.status).toBe('cancelled');
        const changed = structuredClone(bindings); changed[0].target.lifecycle.transitionId = 'unknown';
        expect(() => compileBridge({ version: 1, bindings: changed }, f.contract)).toThrow();
    } finally { host.dispose(); await h.cleanup(); }
});
