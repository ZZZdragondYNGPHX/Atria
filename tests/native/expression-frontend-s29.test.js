import { jest } from '@jest/globals';
import { makeTempFsEngineHarness } from '../storage/harness/contract-harness.js';
import { services } from './helpers/session-fixture.js';
import { bridgeFixture } from './helpers/frontend-bridge-fixture.js';
import { informationFixture } from './helpers/information-fixture.js';
import { compileFrontend } from '../../src/native/frontend/compiler.js';
import { compileBridge } from '../../src/native/frontend/bridge.js';
import { fixedHostTarget } from '../../public/shared/native-frontend-host.js';
import { assertNativeExperienceContract } from '../../public/shared/native-experience-contract.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { FrontendBridgeService } from '../../src/native/frontend/host-bridge.js';

function fixture(configured = true) {
    const f = bridgeFixture(), actorId = f.manifest.actors[0].actorId;
    f.manifest.actors.push({ actorId: 'actor_' + 'f'.repeat(32), displayName: 'Other' });
    const contract = informationFixture(actorId, f.worldId), info = contract.informationRuntime;
    info.graphs = []; info.views.find(v => v.id === 'player').sources = ['beliefs'];
    info.narration = { mode: 'limited', contextViewId: 'pov', disclosureViewId: 'player',
        ...(configured ? { expression: { actorId, intent: 'reflect', sourceIds: ['beliefs'] } } : {}) };
    f.contract = assertNativeExperienceContract(contract);
    const target = { service: 'host.expression', method: 'status' }, spec = fixedHostTarget(target);
    f.bindings = [{ id: 'expression', kind: 'read', target, inputSchema: spec.inputSchema, outputSchema: spec.outputSchema }];
    const files = new Map([...f.files].filter(([path]) => !path.startsWith('runtime/')));
    files.set('bridge.json', Buffer.from(JSON.stringify({ version: 1, bindings: f.bindings })));
    files.set('Main.aui', Buffer.from('<template><main node-id="root"><output node-id="expression" read="expression" /></main></template>'));
    const compiled = compileFrontend({ source: 'frontend.json', files, mode: 'full', experienceContract: f.contract });
    f.manifest.runtime.experienceContract = f.contract; f.manifest.runtime.experience.frontend.entry = compiled.entry;
    f.files = new Map([...files, ...compiled.files]);
    return f;
}

describe('S29 closed expression status frontend capability', () => {
    let h, svc, host, base, opened, f, serial;
    async function setup(configured = true) {
        f = fixture(configured); svc = services(h); host = new FrontendBridgeService(); serial = 0;
        await svc.packageInstaller.install(h.handle, buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: f.files }).archive);
        base = await svc.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        await write('availability', { available: true }); await write('beliefs', { text: 'PRIVATE CONTEXT WORDS', status: 'believed', channel: 'rumor' });
        opened = await host.open(svc, h.handle, base.session.sessionId);
    }
    async function write(domainId, value) {
        const def = f.contract.lifecycleRuntime.domains.find(d => d.id === domainId);
        base = await svc.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 's29-' + ++serial,
            action: { kind: 'app.command', domainId, recordId: 'main', commandId: 'save', args: { ...def.initial, ...value } } }, { expectedRevisionId: base.revision.revisionId });
    }
    const call = (extra = {}) => host.request(svc, h.handle, { epoch: opened.epoch, revision: opened.revision, componentId: 'Main', bindingId: 'expression', method: 'read.snapshot', input: {}, ...extra });
    beforeEach(async () => { h = await makeTempFsEngineHarness(); });
    afterEach(async () => { host?.dispose(); jest.restoreAllMocks(); await h.cleanup(); });
    test('installed read receipt contains only bounded primitives and never writes state', async () => {
        await setup(); const before = await svc.core.load(h.handle, base.session.sessionId);
        const receipt = await call(); expect(receipt.ok).toBe(true);
        expect(receipt.data).toEqual({ status: 'ready', actorId: f.manifest.actors[0].actorId, intent: 'reflect', reason: '', revisionId: base.revision.revisionId });
        expect(receipt.revision).toBe(base.revision.revisionId); expect(JSON.stringify(receipt)).not.toContain('PRIVATE CONTEXT WORDS');
        expect(await svc.core.load(h.handle, base.session.sessionId)).toEqual(before);
        expect(compileBridge({ version: 1, bindings: f.bindings }, f.contract).bindings[0].outputSchema).toEqual(f.bindings[0].outputSchema);
    });
    test('legacy declaration returns explicit unconfigured fallback', async () => {
        await setup(false); expect((await call()).data).toEqual({ status: 'fallback', actorId: '', intent: '', reason: 'not_configured', revisionId: base.revision.revisionId });
    });
    test('undeclared scopes, caller grant fields, action calls and stale revision cannot escalate', async () => {
        await setup();
        for (const extra of [{ bindingId: 'missing' }, { componentId: 'Child' }, { input: { expression: { actorId: 'forged' }, disclosure: { items: [] } } }, { method: 'action.invoke', idempotencyKey: 'forged' }, { revision: 'forged' }]) expect((await call(extra)).ok).toBe(false);
        const bindings = structuredClone(f.bindings); bindings[0].kind = 'action'; expect(() => compileBridge({ version: 1, bindings }, f.contract)).toThrow();
        bindings[0].kind = 'read'; bindings[0].outputSchema.properties.privateEmotion = { type: 'string' }; expect(() => compileBridge({ version: 1, bindings }, f.contract)).toThrow();
    });
    test('withdrawn actor and changed public source are freshly projected with revision guard', async () => {
        await setup(); await write('availability', { available: false });
        expect((await call()).error.code).toBe('bridge_revision_stale'); opened.revision = base.revision.revisionId;
        expect((await call()).data).toMatchObject({ status: 'fallback', reason: 'scope_unavailable', actorId: '', intent: '' });
        await write('availability', { available: true }); await write('beliefs', { actor: 'actor_' + 'f'.repeat(32), text: 'OTHER PRIVATE' }); opened.revision = base.revision.revisionId;
        expect((await call()).data).toMatchObject({ status: 'fallback', reason: 'source_unavailable' });
        await write('beliefs', { text: 'CURRENT PUBLIC', status: 'suspected' }); opened.revision = base.revision.revisionId;
        const receipt = await call(); expect(receipt.data.status).toBe('ready'); expect(receipt.data.revisionId).toBe(base.revision.revisionId);
        expect(JSON.stringify(receipt)).not.toMatch(/CURRENT PUBLIC|OTHER PRIVATE|sourceRefs|items|epistemic/);
    });
});
