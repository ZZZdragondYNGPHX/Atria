import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { sessionFixture, services } from '../native/helpers/session-fixture.js';
import { informationFixture } from '../native/helpers/information-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { prepareControllerOwnerRoot } from './fixtures.js';

const grantDigest = 'a'.repeat(64);
const countTokens = text => Math.max(1, Math.ceil(String(text).length / 4));

describe.each(CONTRACT_HARNESSES)('$name ContextPort original Session compiler', ({ make }) => {
    let h, f, base, request, port, allowed, actorId, serial;
    beforeEach(async () => {
        h = await make(); serial = 0; allowed = true;
        await prepareControllerOwnerRoot(h.dirs.root);
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        f = { ...sessionFixture(), ...services(h) };
        actorId = f.manifest.actors[0].actorId;
        f.manifest.runtime = { experienceContract: informationFixture(actorId, f.worldId) };
        const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
        await f.packageInstaller.install(h.handle, archive);
        base = await f.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        base = await write(base, 'availability', 'main', { available: true });
        base = await write(base, 'beliefs', 'mine', { text: 'ACTOR PRIVATE RUMOR', status: 'believed', channel: 'rumor' });
        base = await write(base, 'memories', 'mine', { text: 'NARRATOR ONLY MEMORY' });
        const binding = { sourceAuthority: 'native_session', sourceRef: { sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId } };
        request = { ownerRef: { handle: h.handle }, sourceBinding: { ...binding, bindingDigest: hashNativeDocument(binding) }, audience: { kind: 'actor', id: actorId },
            taskPurpose: 'actor-cognition', grantDigest, inputRefs: [], tokenBudget: { modelContextLimit: 16000, responseReserve: 1000 } };
        port = new ContextPort({ sessionCore: f.core, authorizeContext: async () => ({ allowed, grantDigest }), contextOptions: { countTokens } });
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    const write = (snapshot, domainId, recordId, overrides) => f.core.applyLifecycleCommand(h.handle, base.session.sessionId,
        { type: 'lifecycle', invocationId: 'context-' + ++serial, action: { kind: 'app.command', domainId, recordId, commandId: 'save',
            args: { ...f.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === domainId).initial, ...overrides } } },
        { expectedRevisionId: snapshot.revision.revisionId });

    test('actual provider consumes the actor-selected plan, never the narrator-wide plan', async () => {
        const context = await port.compile(h.handle, request);
        expect(JSON.stringify(context.plan.included)).toContain('ACTOR PRIVATE RUMOR');
        expect(JSON.stringify(context.plan.included)).not.toContain('NARRATOR ONLY MEMORY');
        const resolved = { model: { limits: { contextTokens: 16000 } }, generation: { output: { maxTokens: 1000 } } };
        const actual = await port.provider(h.handle, { context }).buildRequestContextPlan({ requestId: 'ctx-1' }, resolved);
        expect(JSON.stringify(actual.items)).toContain('ACTOR PRIVATE RUMOR');
        expect(JSON.stringify(actual.items)).not.toContain('NARRATOR ONLY MEMORY');
        await expect(port.revalidate(h.handle, { context, phase: 'consume' })).resolves.toBe(context.plan);
        expect(context.evidenceRefs.length).toBeGreaterThan(0);
    });

    test('audience and owner cannot be changed or a persisted proof reused as permission', async () => {
        const context = await port.compile(h.handle, request);
        await expect(port.revalidate(h.handle, { context, phase: 'consume', audience: { kind: 'narrator' } })).rejects.toMatchObject({ code: 'native_orchestration_context_audience_mismatch' });
        await expect(port.revalidate(h.handle, { context: structuredClone(context), phase: 'send' })).rejects.toMatchObject({ code: 'native_orchestration_context_proof_invalid' });
        await expect(port.revalidate('another-owner', { context, phase: 'send' })).rejects.toMatchObject({ code: 'native_orchestration_context_proof_invalid' });
        await expect(port.compile(h.handle, { ...request, ownerRef: { handle: 'another-owner' } })).rejects.toMatchObject({ code: 'native_orchestration_context_owner_mismatch' });
        const ref = request.sourceBinding.sourceRef, source = { kind: 'session', ...ref };
        expect(() => port.assertSource(h.handle, { context, source })).not.toThrow();
        for (const forged of [{ ...source, kind: 'task' }, { ...source, sessionId: 'other-session' }, { ...source, revisionId: 'other-revision' }, { ...source, branchId: 'other-branch' }]) {
            expect(() => port.assertSource(h.handle, { context, source: forged })).toThrow('native_orchestration_context_source_mismatch');
        }
    });

    test('grant revocation blocks send and consume before evidence is returned', async () => {
        const context = await port.compile(h.handle, request);
        allowed = false;
        for (const phase of ['send', 'consume']) await expect(port.revalidate(h.handle, { context, phase })).rejects.toMatchObject({ code: 'native_orchestration_context_denied' });
        await expect(port.compile(h.handle, request)).rejects.toMatchObject({ code: 'native_orchestration_context_denied' });
    });

    test('current source moves invalidate both saved plans and late asynchronous compilations', async () => {
        const context = await port.compile(h.handle, request);
        await write(base, 'beliefs', 'mine', { text: 'Edited source' });
        for (const phase of ['send', 'consume']) await expect(port.revalidate(h.handle, { context, phase })).rejects.toMatchObject({ code: 'native_orchestration_context_source_stale' });
        await expect(port.compile(h.handle, request)).rejects.toMatchObject({ code: 'native_orchestration_context_source_stale' });
    });

    test('unavailable actor and unimplemented domains fail closed without raw-history fallback', async () => {
        const unavailable = await write(base, 'availability', 'main', { available: false });
        const binding = { ...request.sourceBinding, sourceRef: { ...request.sourceBinding.sourceRef, revisionId: unavailable.revision.revisionId } };
        delete binding.bindingDigest;
        await expect(port.compile(h.handle, { ...request, sourceBinding: { ...binding, bindingDigest: hashNativeDocument(binding) } })).rejects.toMatchObject({ code: 'native_orchestration_context_audience_denied' });
        const unknown = { sourceAuthority: 'rp_chat', sourceRef: {} };
        await expect(port.compile(h.handle, { ...request, sourceBinding: { ...unknown, bindingDigest: hashNativeDocument(unknown) } })).rejects.toMatchObject({ code: 'native_orchestration_context_domain_unavailable' });
    });

    test('a source change during original Memory evidence read rejects the compiled snapshot', async () => {
        const delayed = new ContextPort({ sessionCore: f.core, authorizeContext: async () => ({ allowed: true, grantDigest }), contextOptions: { countTokens },
            readMemoryEvidence: async () => { await write(base, 'beliefs', 'mine', { text: 'Changed during retrieval' }); return []; } });
        await expect(delayed.compile(h.handle, request)).rejects.toMatchObject({ code: 'native_orchestration_context_source_stale' });
    });
});

test('original authorization is mandatory', () => {
    expect(() => new ContextPort()).toThrow('native_orchestration_context_authority_required');
});
