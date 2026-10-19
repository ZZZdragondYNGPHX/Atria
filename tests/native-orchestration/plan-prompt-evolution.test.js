import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { EvolutionTargets } from '../../src/native/agent-intelligence/evolution-targets.js';
import { PromptPresetStore } from '../../src/native/model-prompt-runtime/presets.js';
import { PromptCandidateStore } from '../../src/native/model-prompt-runtime/prompt-candidates.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
const before = 'Use the selected Native facts. Produce a concise response.';
const after = 'Explain the selected Project facts with concrete, concise examples.';
async function setup(make, { nodeProgram = false } = {}) {
    const f = await projectModelFixture(make, { configurePlan: async ({ h, plan, seeded, route }) => {
        const presets = new PromptPresetStore({ engine: h.engine });
        const saved = await presets.save(h.handle, { format: 'atria.prompt-preset', schemaVersion: 1, programId: seeded.prompt.promptProgramId,
            entries: [{ resourceType: 'core.prompt-module', resource: { ...seeded.module, target: 'system.style' } },
                { resourceType: 'core.prompt-program', resource: seeded.prompt }, { resourceType: 'core.generation-profile', resource: seeded.generation }] });
        const preset = await presets.get(h.handle, saved.presetId);
        const selected = { ...route, promptProgramRef: preset.refs.find(ref => ref.resourceType === 'core.prompt-program'),
            generationProfileRef: preset.refs.find(ref => ref.resourceType === 'core.generation-profile') };
        if (nodeProgram) {
            const ref = selected.promptProgramRef;
            const original = await seeded.library.getExact(h.handle, ref);
            plan.dependencyPins.push({ pinId: 'node.program', port: 'model', resourceRef: ref, integrity: hash(original.snapshot) });
            plan.definition.nodes[0].dependencyPinIds.push('node.program'); plan.definition.nodes[0].policy.promptPinId = 'node.program';
        } else { await seeded.persistence.saveRuntimeRoute(h.handle, selected); plan.dependencyPins[0].integrity = hash(selected); }
    } });
    const targets = new EvolutionTargets({ host: f.host }), scope = { domain: 'project', projectId: f.projectId }, subject = f.projectId;
    const choice = (await targets.catalog(f.h.handle, scope, subject)).find(item => item.target.kind === 'plan-prompt');
    if (!choice) { await f.cleanup(); throw new Error('Missing original native Plan Prompt choice'); }
    const route = await f.persistence.getRuntimeRoute(f.h.handle, f.route.runtimeRouteId);
    return { ...f, targets, scope, subject, choice, target: choice.target, route };
}
async function prepare(f) {
    const handle = f.h.handle;
    await f.targets.declare(handle, f.scope, f.subject, f.target, f.choice.baseHash);
    const capture = await f.targets.capture(handle, f.scope, f.subject, f.target);
    const candidate = await f.targets.prepare(handle, f.scope, f.subject, f.target, capture, after);
    return { capture, candidate };
}

describe.each(harnesses)('$name original native Plan Prompt evolution', ({ make }) => {
    test('a Node Program candidate updates only its Plan pin and Binding, then the real Executor consumes it', async () => {
        const f = await setup(make, { nodeProgram: true }), handle = f.h.handle;
        try {
            const { candidate } = await prepare(f);
            const revision = await f.plans.getRevision(handle, candidate.planRef);
            expect(revision.dependencyPins.find(pin => pin.pinId === 'node.program').resourceRef)
                .not.toEqual(f.plan.dependencyPins.find(pin => pin.pinId === 'node.program').resourceRef);
            await f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId);
            expect(await f.persistence.getRuntimeRoute(handle, f.route.runtimeRouteId)).toEqual(f.route);
            await f.run(); expect(JSON.stringify(f.requests[0])).toContain(after);
            await f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId, true);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(f.planRef);
            expect(await f.persistence.getRuntimeRoute(handle, f.route.runtimeRouteId)).toEqual(f.route);
        } finally { await f.cleanup(); }
    }, 30000);

    test('original exact Prompt revisions and a new immutable Plan are consumed by the real Project executor; Draft and charged Run survive rollback', async () => {
        const f = await setup(make), handle = f.h.handle;
        try {
            const draft = await f.plans.get(handle, f.target.planRef.planId), oldPreflight = await f.preflight();
            const { candidate } = await prepare(f);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(f.planRef);
            expect(await f.persistence.getRuntimeRoute(handle, f.route.runtimeRouteId)).toEqual(f.route);
            const checked = await f.targets.check(handle, f.scope, f.subject, f.target, candidate.candidateId);
            expect(checked.actual).toEqual(checked.base); expect(candidate.diff).toEqual({ field: 'body', before, after });
            let gates = 0;
            await f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId, false, null, async () => { gates++; });
            await f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId, false, null, async () => { gates++; });
            expect(gates).toBe(1);
            await expect(f.start(oldPreflight)).rejects.toThrow(); expect(f.requests).toEqual([]);
            await f.run();
            expect(JSON.stringify(f.requests[0])).toContain(after); expect(JSON.stringify(f.requests[0])).not.toContain(before);
            const root = await f.authority.execution.runs.get(handle, f.effects[0].runId);
            expect(root.planRef).toEqual(candidate.planRef);
            expect((await f.plans.get(handle, f.target.planRef.planId))).toEqual(expect.objectContaining({ definition: draft.definition, draftVersion: draft.draftVersion }));
            await f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId, true);
            await f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId, true);
            expect(await f.persistence.getRuntimeRoute(handle, f.route.runtimeRouteId)).toEqual(f.route);
            expect((await f.plans.getBinding(handle, f.sourceSelector))).toMatchObject({ planRef: f.planRef, version: 2 });
            expect((await f.authority.execution.runs.get(handle, root.runId)).planRef).toEqual(candidate.planRef);
            await expect(f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId)).rejects.toThrow('candidate_consumed');
            await f.targets.discard(handle, f.scope, f.subject, f.target, candidate.candidateId);
            const original = new PromptCandidateStore({ engine: f.h.engine });
            await expect(original.discard(handle, candidate.promptCandidateRef.presetId, candidate.promptCandidateRef.candidateId)).rejects.toThrow('native_prompt_candidate_conflict');
            expect((await f.plans.getRevision(handle, candidate.planRef)).evolutionSource.promptCandidateRef).toEqual(candidate.promptCandidateRef);
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 30000);

    test('a user Binding change in the durable publication gate keeps the original route and refuses the candidate', async () => {
        const f = await setup(make), handle = f.h.handle;
        try {
            const { candidate } = await prepare(f);
            await expect(f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId, false, null, () => f.plans.saveBinding(handle,
                createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 }))).rejects.toThrow('binding_stale');
            expect(await f.persistence.getRuntimeRoute(handle, f.route.runtimeRouteId)).toEqual(f.route);
            expect((await f.plans.getBinding(handle, f.sourceSelector))).toMatchObject({ planRef: f.planRef, version: 1 }); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('failure after the original route write rolls back its shared Engine transaction including the Binding', async () => {
        const f = await setup(make), handle = f.h.handle;
        try {
            const { candidate } = await prepare(f), plans = f.targets.nativePlans(), save = plans.saveBinding.bind(plans);
            plans.saveBinding = async () => { throw new Error('Synthetic Binding write failure after original route'); };
            await expect(f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId)).rejects.toThrow('Synthetic Binding');
            plans.saveBinding = save;
            expect(await f.persistence.getRuntimeRoute(handle, f.route.runtimeRouteId)).toEqual(f.route);
            expect((await f.targets.check(handle, f.scope, f.subject, f.target, candidate.candidateId)).actual.planRef).toEqual(f.planRef);
            await f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId);
            expect((await f.plans.getBinding(handle, f.sourceSelector))).toMatchObject({ planRef: candidate.planRef, version: 1 }); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test.each([false, true])('unknown publication ACK saved=%s is observed before retry; neither resource creates a new version', async saved => {
        const f = await setup(make), handle = f.h.handle;
        try {
            const { candidate } = await prepare(f), plans = f.targets.nativePlans(), write = plans.writeEvolution.bind(plans);
            plans.writeEvolution = async (...args) => {
                if (saved) await write(...args);
                throw new StorageCommitUnknownError(new Error('Synthetic full original Engine ACK loss'));
            };
            await expect(f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId)).rejects.toMatchObject({ code: 'storage_commit_unknown' });
            plans.writeEvolution = write;
            const checked = await f.targets.check(handle, f.scope, f.subject, f.target, candidate.candidateId);
            expect(checked.actual).toEqual(saved ? checked.desired : checked.base);
            await f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).version).toBe(1); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('independent original Route edits prevent rollback instead of being overwritten', async () => {
        const f = await setup(make), handle = f.h.handle;
        try {
            const { candidate } = await prepare(f);
            await f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId);
            const edited = { ...await f.persistence.getRuntimeRoute(handle, f.route.runtimeRouteId), displayName: 'New user-owned route edit' };
            await f.persistence.saveRuntimeRoute(handle, edited);
            await expect(f.targets.write(handle, f.scope, f.subject, f.target, candidate.candidateId, true)).rejects.toThrow('native_prompt_candidate_conflict');
            expect(await f.persistence.getRuntimeRoute(handle, f.route.runtimeRouteId)).toEqual(edited);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(candidate.planRef); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    });
});
