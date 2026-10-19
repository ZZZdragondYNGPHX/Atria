import { NativeMemoryAuthority } from '../../src/native/memory-authority.js';
import { ContextPort } from '../../src/native/orchestration/context-port.js';
import { SettingsRepo } from '../../src/storage/repositories/settings-repo.js';
import { buildAtriaPackageContainer, createNativeId } from '../../src/native/index.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { sessionFixture, services } from '../native/helpers/session-fixture.js';
import { informationFixture } from '../native/helpers/information-fixture.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { prepareControllerOwnerRoot } from './fixtures.js';

const grantDigest = 'a'.repeat(64);
describe.each(CONTRACT_HARNESSES)('$name original Memory Context', ({ make }) => {
    let h, f, base, settingsRepo, authority, request, port, allowed, settings;
    beforeEach(async () => {
        h = await make(); allowed = true;
        await prepareControllerOwnerRoot(h.dirs.root);
        attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        f = { ...sessionFixture(), ...services(h) };
        const actorId = f.manifest.actors[0].actorId, otherActorId = createNativeId('actor');
        f.manifest.actors.push({ actorId: otherActorId, displayName: 'Other' });
        f.manifest.entryPoints[0].actorIds.push(otherActorId);
        f.manifest.entryPoints[0].initialTimeline = [
            { role: 'assistant', actorId, content: 'REMEMBERED PROMISE: return the blue book.' },
            { role: 'assistant', actorId: otherActorId, content: 'FORBIDDEN PRIVATE SECRET: hide the blue book.' },
        ];
        const contract = informationFixture(actorId, f.worldId);
        contract.informationRuntime.graphs = [];
        const domain = contract.lifecycleRuntime.domains.find(item => item.id === 'memories');
        domain.recordSchema.properties.sourceMessageIds = { type: 'array', items: { type: 'string', maxLength: 256 }, maxItems: 8 };
        domain.initial.sourceMessageIds = [];
        domain.commands[0].assign.sourceMessageIds = { formula: 'args.sourceMessageIds' };
        contract.informationRuntime.sources.find(source => source.id === 'memories').fields = [['text'], ['sourceMessageIds']];
        const actorView = contract.informationRuntime.views.find(view => view.id === 'actor');
        actorView.sources = ['memories']; actorView.memory = true;
        f.manifest.runtime = { experienceContract: contract };
        const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
        await f.packageInstaller.install(h.handle, archive);
        base = await f.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        base = await f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'memory-availability',
            action: { kind: 'app.command', domainId: 'availability', recordId: 'main', commandId: 'save',
                args: contract.lifecycleRuntime.domains.find(domain => domain.id === 'availability').initial } }, { expectedRevisionId: base.revision.revisionId });
        for (const [index, actor] of [actorId, otherActorId].entries()) {
            base = await f.core.applyLifecycleCommand(h.handle, base.session.sessionId, { type: 'lifecycle', invocationId: 'memory-exposure-' + index,
                action: { kind: 'app.command', domainId: 'memories', recordId: 'exposure-' + index, commandId: 'save',
                    args: { ...domain.initial, actor, text: base.timeline[index].content,
                        sourceMessageIds: [base.timeline[index].messageId] } } }, { expectedRevisionId: base.revision.revisionId });
        }
        settingsRepo = new SettingsRepo({ engine: h.engine });
        settings = { atri_capabilities: { memory_graph: { enabled: true, sourceWritesEnabled: false, memoryOsTokenBudget: 5000 } } };
        await settingsRepo.save(h.handle, settings);
        authority = new NativeMemoryAuthority({ core: f.core, settingsRepo });
        const binding = { sourceAuthority: 'native_session', sourceRef: { sessionId: base.session.sessionId, branchId: base.revision.branchId, revisionId: base.revision.revisionId } };
        request = { ownerRef: { handle: h.handle }, sourceBinding: { ...binding, bindingDigest: hash(binding) }, audience: { kind: 'actor', id: actorId },
            taskPurpose: 'remember-book', grantDigest, inputRefs: [], tokenBudget: { modelContextLimit: 16000, responseReserve: 1000 } };
        port = new ContextPort({ sessionCore: f.core, memoryAuthority: authority, authorizeContext: async () => ({ allowed, grantDigest }) });
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });

    test('original Hybrid reads only legal Actor sources and never persists a ledger or access counter', async () => {
        const before = hash(await f.core.observe(h.handle, base.session.sessionId));
        const context = await port.compile(h.handle, request);
        const memory = context.plan.included.filter(item => item.lane === 'memory');
        expect(JSON.stringify(memory)).toContain('REMEMBERED PROMISE');
        expect(JSON.stringify(memory)).not.toContain('FORBIDDEN PRIVATE SECRET');
        expect(context.evidenceRefs.some(ref => ref.messageId === base.timeline[0].messageId)).toBe(true);
        expect(hash(await f.core.observe(h.handle, base.session.sessionId))).toBe(before);
        await expect(port.revalidate(h.handle, { context, phase: 'consume' })).resolves.toBe(context.plan);
    });

    test('settings revoked after compile block send and consume, including initially empty recall', async () => {
        const context = await port.compile(h.handle, request);
        settings.atri_capabilities.memory_graph.recallEnabled = false;
        await settingsRepo.save(h.handle, settings);
        await expect(port.revalidate(h.handle, { context, phase: 'send' })).rejects.toMatchObject({ code: 'native_orchestration_memory_source_stale' });
        const empty = await port.compile(h.handle, request);
        expect(empty.plan.included.filter(item => item.contextItemId.startsWith('memory:'))).toHaveLength(0);
        settings.atri_capabilities.memory_graph.recallEnabled = true;
        await settingsRepo.save(h.handle, settings);
        await expect(port.revalidate(h.handle, { context: empty, phase: 'consume' })).rejects.toMatchObject({ code: 'native_orchestration_memory_source_stale' });
    });

    test('descriptor pins actual settings bytes before compilation admission', async () => {
        const descriptor = await port.compilationDescriptor(h.handle, request);
        expect(descriptor.memoryDescriptor.settings.value.sourceWritesEnabled).toBe(false);
        settings.atri_capabilities.memory_graph.memoryOsTokenBudget = 6000;
        await settingsRepo.save(h.handle, settings);
        await expect(port.compile(h.handle, request)).rejects.toMatchObject({ code: 'native_orchestration_memory_source_stale' });
    });

    test('asynchronous tokenizer cannot return recall after grant revocation', async () => {
        port.contextOptions.countTokens = async text => { allowed = false; return String(text).length; };
        await expect(port.compile(h.handle, request)).rejects.toMatchObject({ code: 'native_orchestration_context_denied' });
    });

    test('exact external retrieval settings fail closed instead of invoking Browser transport', async () => {
        settings.atri_capabilities.memory_graph.nativeRetrieval = { embed: { retrievalProfileId: 'unavailable', revision: 'exact' } };
        await settingsRepo.save(h.handle, settings);
        await expect(port.compile(h.handle, request)).rejects.toMatchObject({ code: 'native_orchestration_memory_retrieval_scope_unavailable' });
    });
});
