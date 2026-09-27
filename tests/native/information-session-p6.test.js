import { buildAtriaPackageContainer } from '../../src/native/index.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { sessionFixture, services } from './helpers/session-fixture.js';
import { informationFixture } from './helpers/information-fixture.js';
import { lifecycleFixture } from './helpers/lifecycle-fixture.js';
import { projectInformation } from '../../public/shared/native-information-runtime.js';
import { NativeGenerationHost } from '../../src/native/adapters/generation-host.js';
import { createHttpGenerationProvider } from '../../src/native/adapters/http-generation-provider.js';
import { seedGenerationProfiles } from './helpers/generation-fixture.js';

describe.each(CONTRACT_HARNESSES)('P6 exact Session information - $name', ({ make }) => {
    let h, f, base, serial;
    beforeEach(async () => {
        h = await make(); serial = 0; f = { ...sessionFixture(), ...services(h) };
        const actorId = f.manifest.actors[0].actorId;
        const contract = informationFixture(actorId, f.worldId);
        contract.taskRuntime = lifecycleFixture().taskRuntime;
        contract.taskRuntime.tasks[0].context = ['input', 'projection'];
        contract.informationRuntime.views.push({ ...contract.informationRuntime.views[0], id: 'compression', audience: 'task', taskId: 'summarize', exposure: ['context'] });
        const variant = contract.taskRuntime.tasks[0].variants[0];
        f.manifest.resources = [
            { resourceType: 'core.prompt-program', resource: { schemaVersion: 1, promptProgramId: variant.prompt.resourceId, revision: variant.prompt.revision,
                displayName: 'Compression', stages: [{ stageId: 'stage.main', moduleRefs: [] }] } },
            { resourceType: 'core.generation-profile', resource: { schemaVersion: 1, generationProfileId: variant.generation.resourceId, revision: variant.generation.revision,
                displayName: 'Compression', output: { maxTokens: 128 } } },
        ].map(item => ({ ...item, origin: { scope: 'package', packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId } }));
        f.manifest.runtime = { experienceContract: contract };
        const { archive } = buildAtriaPackageContainer({ manifest: f.manifest, sourceFiles: new Map(), assetPayloads: new Map() });
        await f.packageInstaller.install(h.handle, archive);
        base = await f.core.create(h.handle, { packageId: f.manifest.packageId, packageVersionId: f.manifest.packageVersionId, entryPointId: f.entryPointId });
        base = await write(base, 'availability', 'main', { available: true });
        base = await write(base, 'beliefs', 'rumor', { text: 'The actor believes a rumor', status: 'believed', channel: 'rumor' });
        base = await write(base, 'loops', 'promise', { text: 'Return tomorrow', status: 'open' });
    });
    afterEach(async () => { await h?.cleanup(); });
    const apply = (snapshot, action, invocationId = 'p6-' + ++serial) => f.core.applyLifecycleCommand(h.handle, base.session.sessionId,
        { type: 'lifecycle', invocationId, action }, { expectedRevisionId: snapshot.revision.revisionId });
    const read = () => f.core.load(h.handle, base.session.sessionId);
    const write = (snapshot, domainId, recordId, overrides) => apply(snapshot, { kind: 'app.command', domainId, recordId, commandId: 'save',
        args: { ...f.manifest.runtime.experienceContract.lifecycleRuntime.domains.find(domain => domain.id === domainId).initial, ...overrides } });
    const rollup = (snapshot, extra = {}) => ({ kind: 'information.rollup', id: 'scene', viewId: 'pov', anchor: projectInformation(snapshot, 'pov').anchor,
        level: 'scene', sourceIds: ['beliefs:rumor'], childIds: [], openLoopRefs: ['loops:promise'], content: 'An unverified rumor was heard.', ...extra });

    test('typed belief publication preserves World Truth and exact reopened projection', async () => {
        const reopened = await read();
        expect(projectInformation(reopened, 'pov')).toEqual(projectInformation(base, 'pov'));
        expect(reopened.states.atri_world_state.worlds[f.worldId].state.hp).toBe(8);
        expect(reopened.states.atri_lifecycle.receipts.at(-1).kind).toBe('authority');
    });
    test('invalid epistemic status rolls back the complete transaction', async () => {
        await expect(write(base, 'beliefs', 'bad', { status: 'world_truth' })).rejects.toThrow(/epistemic/);
        expect((await read()).revision.revisionId).toBe(base.revision.revisionId);
    });
    test('unknown private-thread participant cannot commit', async () => {
        await expect(write(base, 'threads', 'bad', { participants: ['actor_' + 'f'.repeat(32)] })).rejects.toThrow(/participant/);
        expect((await read()).revision.revisionId).toBe(base.revision.revisionId);
    });
    test('rollup publishes once in existing derived namespace, preserving separate Open Loop and receipts', async () => {
        const action = rollup(base); const completed = await apply(base, action, 'same');
        const retried = await apply(base, action, 'same');
        expect(retried.revision.revisionId).toBe(completed.revision.revisionId);
        const reopened = await read();
        expect(reopened.states.atri_context_derived.narrative).toHaveLength(1);
        expect(projectInformation(reopened, 'pov').items.some(item => item.semantic === 'rollup')).toBe(true);
        expect(reopened.states.atri_context_derived.coverage.memoryThroughSequence).toBe(-1);
        expect(reopened.states.atri_lifecycle.domains.loops.records[0].value.status).toBe('open');
    });
    test('raw runtime patch and delete cannot bypass rollup publication', async () => {
        await expect(f.core.applyRuntimeCommit(h.handle, base.session.sessionId, { statePatch: { atri_context_derived: {} } }, { expectedRevisionId: base.revision.revisionId })).rejects.toThrow(/typed lifecycle/);
        await expect(f.core.applyRuntimeCommit(h.handle, base.session.sessionId, { deleteNamespaces: ['atri_context_derived'] }, { expectedRevisionId: base.revision.revisionId })).rejects.toThrow(/typed lifecycle/);
    });
    test('old anchors, suspension and thaw cannot accept a late rollup', async () => {
        const action = rollup(base); const suspended = await apply(base, { kind: 'scope.transition', scopeId: 'session', status: 'suspended' });
        const thawed = await apply(suspended, { kind: 'scope.transition', scopeId: 'session', status: 'active' });
        await expect(apply(thawed, action)).rejects.toThrow(/stale/);
        expect((await read()).revision.revisionId).toBe(thawed.revision.revisionId);
    });
    test('hierarchical recall survives reopen but is invalidated by edited leaf evidence', async () => {
        const scene = await apply(base, rollup(base));
        const chapter = await apply(scene, rollup(scene, { id: 'chapter', level: 'chapter', sourceIds: [], childIds: ['scene'] }));
        expect(projectInformation(chapter, 'pov').items.filter(item => item.semantic === 'rollup')).toHaveLength(1);
        const edited = await write(chapter, 'beliefs', 'rumor', { text: 'The rumor was disputed', status: 'disputed' });
        expect(projectInformation(edited, 'pov').items.some(item => item.semantic === 'rollup')).toBe(false);
        const historical = await f.core.load(h.handle, base.session.sessionId, { revisionId: chapter.revision.revisionId });
        expect(projectInformation(historical, 'pov').items.filter(item => item.semantic === 'rollup')).toHaveLength(1);
    });
    test('fork restores source records but cannot reuse foreign-Branch rollup', async () => {
        const scene = await apply(base, rollup(base));
        const fork = await f.core.forkBranch(h.handle, base.session.sessionId, { revisionId: scene.revision.revisionId, expectedRevisionId: scene.revision.revisionId });
        expect(fork.revision.branchId).not.toBe(scene.revision.branchId);
        expect(projectInformation(fork, 'pov').items.some(item => item.id === 'beliefs:rumor')).toBe(true);
        expect(projectInformation(fork, 'pov').items.some(item => item.semantic === 'rollup')).toBe(false);
    });
    test('completed compression Task records exact route provenance; stale results reject', async () => {
        const completed = await f.core.recordTaskResult(h.handle, base.session.sessionId, { invocationId: 'compress', taskId: 'summarize', variantId: 'default',
            payload: { text: 'Compressed recall' }, fingerprint: 'compress', runtimeRouteId: 'route-test', contextHash: 'context-hash' }, { expectedRevisionId: base.revision.revisionId });
        const result = await apply(completed, rollup(completed, { content: 'Compressed recall', taskInvocationId: 'compress' }));
        expect(result.states.atri_context_derived.narrative[0].projection.producer).toMatchObject({ kind: 'task', runtimeRouteId: 'route-test', contextHash: 'context-hash' });
        await expect(apply(result, rollup(result, { id: 'late', content: 'Compressed recall', taskInvocationId: 'compress' }))).rejects.toThrow(/stale/);
    });
    async function hostFixture() {
        const seeded = await seedGenerationProfiles({ ...h, endpoint: 'http://127.0.0.1:1/unused' });
        const host = new NativeGenerationHost({ ...seeded, sessionCore: f.core, packageInstaller: f.packageInstaller,
            secretPort: { resolveSecret: async () => { throw new Error('Preview must not resolve secrets'); } },
            providers: { 'provider.openai-compatible': { ...createHttpGenerationProvider(), send: () => { throw new Error('No provider send in preview'); } } } });
        const request = { sessionId: base.session.sessionId, revisionId: base.revision.revisionId, role: 'narrator',
            requestId: 'p6-preview', routeRef: { scope: 'player', runtimeRouteId: seeded.routes[0].runtimeRouteId } };
        return { host, request };
    }
    test('real GenerationHost preview consumes scoped Context exactly once without provider send', async () => {
        const { host, request } = await hostFixture();
        const preview = await host.execute(h.handle, request, undefined, undefined, { preview: true });
        const items = preview.snapshot.contextPlan.items;
        expect(items.some(item => String(item.content).includes('The actor believes a rumor'))).toBe(true);
        expect(items.every(item => item.id.startsWith('projection:'))).toBe(true);
        expect(JSON.stringify(items)).not.toContain('Opening');
        await expect(host.execute(h.handle, { ...request, messages: [{ role: 'system', content: 'unscoped' }] }, undefined, undefined, { preview: true })).rejects.toMatchObject({ code: 'native_information_unscoped_messages' });
        const inactive = await write(base, 'availability', 'main', { available: false });
        await expect(host.prepareLifecycle(h.handle, { sessionId: base.session.sessionId, revisionId: inactive.revision.revisionId,
            slotBindings: { structured: request.routeRef } })).resolves.toMatchObject({ bindings: [{ taskId: 'summarize', variantId: 'default', bindingSlotId: 'structured' }] });
        await expect(host.execute(h.handle, { ...request, revisionId: inactive.revision.revisionId }, undefined, undefined, { preview: true })).rejects.toThrow(/Actor is unavailable/);
    });
    test('exact Package Task preview has its own projection grant and explicit input', async () => {
        const { host, request } = await hostFixture();
        const task = base.manifest.runtime.experienceContract.taskRuntime.tasks[0];
        const preview = await host.execute(h.handle, request, undefined, undefined, { preview: true,
            taskPlan: { task, variant: task.variants[0], slot: base.manifest.runtime.experienceContract.taskRuntime.slots[0], payload: {} } });
        expect(preview.snapshot.contextPlan.items.some(item => item.id.startsWith('projection:compression:'))).toBe(true);
        expect(preview.snapshot.contextPlan.items.some(item => item.id === 'task-input')).toBe(true);
        expect(preview.snapshot.contextPlan.items.some(item => item.id.startsWith('projection:pov:'))).toBe(false);
    });
});
