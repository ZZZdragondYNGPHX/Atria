import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { EvolutionTargets } from '../../src/native/agent-intelligence/evolution-targets.js';
import { assertPlanStrategyTarget } from '../../src/native/orchestration/plan-evolution-contracts.js';
import { createNativeId } from '../../src/native/identity.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
async function setup(make, { review = false } = {}) {
    const f = await projectModelFixture(make, { configurePlan: async ({ plan }) => {
            if (!review) return;
            const [agent, output] = plan.definition.nodes;
            const reviews = [3, 5].map((maxRounds, i) => ({ nodeId: createNativeId('orchestrationNode'), kind: 'review', label: 'Review ' + i,
                inputs: [{ name: 'response', type: 'json', required: true }], outputs: [{ name: 'response', type: 'json', required: false }],
                dependencyPinIds: [agent.policy.agentPinId], capabilities: [], policy: { agentPinId: agent.policy.agentPinId, maxRounds } }));
            plan.definition.nodes = [agent, ...reviews, output];
            plan.definition.edges = plan.definition.nodes.slice(0, -1).map((node, i) => ({ edgeId: createNativeId('orchestrationEdge'),
                from: { nodeId: node.nodeId, port: 'response' }, to: { nodeId: plan.definition.nodes[i + 1].nodeId, port: 'response' }, condition: 'always', maxVisits: 1, loopBack: false }));
        } }), targets = new EvolutionTargets({ host: f.host });
    const scope = { domain: 'project', projectId: f.projectId }, subject = f.projectId;
    const choices = await targets.catalog(f.h.handle, scope, subject), choice = choices.find(item => item.target.kind === 'plan-strategy'
        && item.target.fieldPath === (review ? 'reviewPolicy.maxRounds' : 'limits.maxSteps'));
    if (!choice) { await f.cleanup(); throw new Error('Missing real native Plan strategy choice'); }
    return { ...f, targets, scope, subject, choice, target: choice.target };
}

describe.each(harnesses)('$name original Plan strategy evolution', ({ make }) => {
    test('declared Review rounds tighten only the exact original node; Binding rollback preserves both immutable revisions and the Draft', async () => {
        const f = await setup(make, { review: true }), { targets, target, scope, subject } = f, handle = f.h.handle;
        try {
            const base = await f.plans.getRevision(handle, f.planRef), draft = await f.plans.get(handle, f.planRef.planId);
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const capture = await targets.capture(handle, scope, subject, target);
            expect(capture.body).toBe(3);
            const candidate = await targets.prepare(handle, scope, subject, target, capture, 1);
            const revised = await f.plans.getRevision(handle, candidate.planRef);
            const expected = structuredClone(base.definition); expected.nodes.find(node => node.nodeId === target.nodeId).policy.maxRounds = 1;
            expect(revised.definition).toEqual(expected); expect(revised.dependencyPins).toEqual(base.dependencyPins);
            expect((await f.plans.get(handle, f.planRef.planId)).definition).toEqual(draft.definition);
            let gates = 0;
            await targets.write(handle, scope, subject, target, candidate.candidateId, false, null, async () => { gates++; });
            await targets.write(handle, scope, subject, target, candidate.candidateId, false, null, async () => { gates++; });
            expect(gates).toBe(1);
            const remaining = (await targets.catalog(handle, scope, subject)).filter(choice => choice.target.fieldPath === 'reviewPolicy.maxRounds');
            expect(remaining).toHaveLength(1); expect(remaining[0].target.nodeId).not.toBe(target.nodeId);
            await targets.write(handle, scope, subject, target, candidate.candidateId, true);
            expect((await f.plans.getBinding(handle, f.sourceSelector))).toMatchObject({ planRef: f.planRef, version: 2 });
            expect((await f.plans.getRevision(handle, candidate.planRef)).definition).toEqual(expected);
            await expect(targets.write(handle, scope, subject, target, candidate.candidateId)).rejects.toThrow('candidate_consumed');
            expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    }, 30000);

    test('Review bounds require their own declaration and node; zero, growth, sibling targets and changed user Bindings cannot publish', async () => {
        const f = await setup(make, { review: true }), { targets, target, scope, subject } = f, handle = f.h.handle;
        try {
            const capture = await targets.capture(handle, scope, subject, target);
            await expect(targets.prepare(handle, scope, subject, target, capture, 2)).rejects.toThrow('declaration_required');
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const declared = await targets.capture(handle, scope, subject, target);
            for (const value of [0, 3, 4, 1.5]) await expect(targets.prepare(handle, scope, subject, target, declared, value)).rejects.toThrow();
            const base = await f.plans.getRevision(handle, f.planRef), agent = base.definition.nodes.find(node => node.kind === 'agent');
            await expect(targets.capture(handle, scope, subject, { ...target, nodeId: agent.nodeId })).rejects.toThrow('exact original Review node');
            const candidate = await targets.prepare(handle, scope, subject, target, declared, 2);
            const sibling = base.definition.nodes.find(node => node.kind === 'review' && node.nodeId !== target.nodeId);
            await expect(targets.check(handle, scope, subject, { ...target, nodeId: sibling.nodeId }, candidate.candidateId)).rejects.toThrow();
            const gate = () => f.plans.saveBinding(handle, createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector,
                planRef: f.planRef, expectedVersion: 0 });
            await expect(targets.write(handle, scope, subject, target, candidate.candidateId, false, null, gate)).rejects.toThrow('binding_stale');
            expect((await f.plans.getBinding(handle, f.sourceSelector)).version).toBe(1);
            expect((await f.plans.getRevision(handle, f.planRef)).definition).toEqual(base.definition); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    }, 30000);

    test.each([false, true])('Review Binding ACK saved=%s keeps exact node history and original command replay', async saved => {
        const f = await setup(make, { review: true }), { targets, target, scope, subject } = f, handle = f.h.handle;
        try {
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const capture = await targets.capture(handle, scope, subject, target), candidate = await targets.prepare(handle, scope, subject, target, capture, 2);
            const plans = targets.nativePlans(), save = plans.saveBinding.bind(plans); let injected = false;
            plans.saveBinding = async (...args) => {
                if (injected) return save(...args);
                injected = true; if (saved) await save(...args);
                throw new StorageCommitUnknownError(new Error('Original Review Binding ACK'));
            };
            await expect(targets.write(handle, scope, subject, target, candidate.candidateId)).rejects.toMatchObject({ code: 'storage_commit_unknown' });
            const current = await targets.check(handle, scope, subject, target, candidate.candidateId);
            expect(hash(current.actual)).toBe(hash(saved ? current.desired : current.base));
            await targets.write(handle, scope, subject, target, candidate.candidateId);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).version).toBe(1); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    }, 30000);

    test('a declared tighter revision changes only the exact Binding; author Draft and existing Runs retain their original authority', async () => {
        const f = await setup(make), { targets, scope, subject, target } = f, handle = f.h.handle;
        try {
            const draft = await f.plans.get(handle, target.planRef.planId);
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const capture = await targets.capture(handle, scope, subject, target);
            const candidate = await targets.prepare(handle, scope, subject, target, capture, capture.body - 1);
            const checked = await targets.check(handle, scope, subject, target, candidate.candidateId);
            expect(checked.actual).toEqual(checked.base); expect(checked.desired.planRef).toEqual(candidate.planRef);
            expect((await f.plans.get(handle, target.planRef.planId)).definition).toEqual(draft.definition);
            expect((await f.plans.get(handle, target.planRef.planId)).draftVersion).toBe(draft.draftVersion);
            let gates = 0;
            await targets.write(handle, scope, subject, target, candidate.candidateId, false, null, async () => { gates++; });
            await targets.write(handle, scope, subject, target, candidate.candidateId, false, null, async () => { gates++; });
            expect(gates).toBe(1); expect((await f.plans.getBinding(handle, f.sourceSelector)).version).toBe(1);
            await f.run(); const root = await f.authority.execution.runs.get(handle, f.effects[0].runId);
            expect(root.planRef).toEqual(candidate.planRef); expect(root.limits.maxSteps).toBe(capture.body - 1);
            await targets.write(handle, scope, subject, target, candidate.candidateId, true);
            await targets.write(handle, scope, subject, target, candidate.candidateId, true);
            const binding = await f.plans.getBinding(handle, f.sourceSelector);
            expect(binding.planRef).toEqual(target.planRef); expect(binding.version).toBe(2);
            expect((await f.authority.execution.runs.get(handle, root.runId)).planRef).toEqual(candidate.planRef);
            expect((await targets.check(handle, scope, subject, target, candidate.candidateId, { rollback: true })).rolledBack).toBe(true);
            await expect(targets.write(handle, scope, subject, target, candidate.candidateId)).rejects.toThrow('native_orchestration_evolution_candidate_consumed');
            expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 30000);

    test('missing declarations, larger limits, arbitrary paths and foreign local subjects cannot prepare or publish a candidate', async () => {
        const f = await setup(make), { targets, scope, subject, target } = f, handle = f.h.handle;
        try {
            expect((await targets.catalog(handle, scope, subject)).every(item => item.target.kind === 'plan-strategy')).toBe(true);
            await expect(targets.capture(handle, scope, subject, { kind: 'project-strategy', taskId: f.task.taskId, field: 'maxRepairRounds' }))
                .rejects.toThrow('native_orchestration_evolution_target_unavailable');
            const undeclared = await targets.capture(handle, scope, subject, target);
            await expect(targets.prepare(handle, scope, subject, target, undeclared, undeclared.body - 1)).rejects.toThrow('declaration_required');
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const capture = await targets.capture(handle, scope, subject, target);
            await expect(targets.prepare(handle, scope, subject, target, capture, capture.body + 1)).rejects.toThrow();
            for (const fieldPath of ['capabilityCeiling', 'outputContract.ownerNodeId', 'secretRef', 'limits.maxTokens'])
                expect(() => assertPlanStrategyTarget({ ...target, fieldPath })).toThrow();
            const foreign = createNativeId('project');
            await expect(targets.capture(handle, { domain: 'project', projectId: foreign }, foreign, target)).rejects.toThrow();
            expect((await f.plans.getBinding(handle, f.sourceSelector)).planRef).toEqual(target.planRef); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('an independent Binding replacement in the publication gate survives and refuses the stale CAS', async () => {
        const f = await setup(make), { targets, scope, subject, target } = f, handle = f.h.handle;
        try {
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const capture = await targets.capture(handle, scope, subject, target), candidate = await targets.prepare(handle, scope, subject, target, capture, capture.body - 1);
            await expect(targets.write(handle, scope, subject, target, candidate.candidateId, false, null, () => f.plans.saveBinding(handle,
                createNativeId('orchestrationCommand'), { sourceSelector: f.sourceSelector, planRef: f.planRef, expectedVersion: 0 }))).rejects.toThrow('native_orchestration_evolution_binding_stale');
            const binding = await f.plans.getBinding(handle, f.sourceSelector); expect(binding.planRef).toEqual(f.planRef); expect(binding.version).toBe(1);
            expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test.each([false, true])('Binding ACK saved=%s can be reconciled without replaying any Model or replacing another version', async saved => {
        const f = await setup(make), { targets, scope, subject, target } = f, handle = f.h.handle;
        try {
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const capture = await targets.capture(handle, scope, subject, target), candidate = await targets.prepare(handle, scope, subject, target, capture, capture.body - 1);
            const plans = targets.nativePlans(), write = plans.saveBinding.bind(plans); let injected = false;
            plans.saveBinding = async (...args) => {
                if (injected) return write(...args);
                injected = true; if (saved) await write(...args);
                throw new StorageCommitUnknownError(new Error('Synthetic native Plan Binding ACK'));
            };
            await expect(targets.write(handle, scope, subject, target, candidate.candidateId)).rejects.toMatchObject({ code: 'storage_commit_unknown' });
            const checked = await targets.check(handle, scope, subject, target, candidate.candidateId);
            expect(checked.actual).toEqual(saved ? checked.desired : checked.base);
            await targets.write(handle, scope, subject, target, candidate.candidateId);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).version).toBe(1); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    });

    test('route withdrawal prevents future publication; exact rollback and discard preserve user route edits and immutable Plan history', async () => {
        const f = await setup(make), { targets, scope, subject, target } = f, handle = f.h.handle;
        try {
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const capture = await targets.capture(handle, scope, subject, target), candidate = await targets.prepare(handle, scope, subject, target, capture, capture.body - 1);
            await targets.write(handle, scope, subject, target, candidate.candidateId);
            await expect(targets.discard(handle, scope, subject, target, candidate.candidateId)).rejects.toThrow('native_orchestration_evolution_candidate_active');
            await f.persistence.saveRuntimeRoute(handle, { ...f.route, displayName: 'Independent original Route edit' });
            await expect(targets.check(handle, scope, subject, target, candidate.candidateId)).rejects.toThrow('native_orchestration_evolution_dependency_stale');
            await targets.write(handle, scope, subject, target, candidate.candidateId, true);
            await targets.discard(handle, scope, subject, target, candidate.candidateId);
            await targets.discard(handle, scope, subject, target, candidate.candidateId);
            expect((await f.persistence.getRuntimeRoute(handle, f.route.runtimeRouteId)).displayName).toBe('Independent original Route edit');
            expect((await f.plans.getRevision(handle, candidate.planRef)).definition.limits.maxSteps).toBe(capture.body - 1);
            expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    });
});
