import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { projectModelFixture } from './helpers/project-model-fixture.js';
import { EvolutionTargets } from '../../src/native/agent-intelligence/evolution-targets.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { StorageCommitUnknownError } from '../../src/storage/errors.js';
import { applyEvolutionProposal } from '../../src/native/agent-intelligence/evaluation/json.js';
import { readEffect } from '../../src/native/orchestration/effect-contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
async function setup(make, { foreign = false } = {}) {
    let allowed, outside;
    const f = await projectModelFixture(make, { configurePlan: async ({ plan, host, h, route }) => {
        for (const [index, owned] of (foreign ? [true, false] : [true]).entries()) {
            const next = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Declared Route ' + index };
            await host.persistence.saveRuntimeRoute(h.handle, next);
            const resourceRef = { scope: 'player', runtimeRouteId: next.runtimeRouteId }, pinId = 'studio.alternative.' + index;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef, integrity: hash(next) });
            if (owned) { plan.definition.nodes[0].dependencyPinIds.push(pinId); allowed = resourceRef; } else outside = resourceRef;
        }
    } });
    const targets = new EvolutionTargets({ host: f.host }), scope = { domain: 'project', projectId: f.projectId }, subject = f.projectId;
    const choice = (await targets.catalog(f.h.handle, scope, subject)).find(choice => choice.target.fieldPath === 'routeRef');
    if (!choice) { await f.cleanup(); throw new Error('Missing exact native Route strategy'); }
    return { ...f, targets, scope, subject, choice, target: choice.target, allowed, outside };
}

describe.each(harnesses)('$name original predeclared Plan Route evolution', ({ make }) => {
    test('a declared node Route candidate executes the original Project path and rolls back only its exact Binding', async () => {
        const f = await setup(make), { targets, target, scope, subject, allowed } = f, handle = f.h.handle;
        try {
            const original = await f.plans.getRevision(handle, f.planRef), draft = await f.plans.get(handle, f.planRef.planId);
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const captured = await targets.capture(handle, scope, subject, target);
            expect(captured.body).toEqual({ scope: 'player', runtimeRouteId: f.route.runtimeRouteId });
            expect(captured.allowedValues).toEqual([captured.body, allowed]);
            const proposal = applyEvolutionProposal({ value: allowed, rationale: 'Use the other explicitly owned node Route.' }, captured.body);
            const candidate = await targets.prepare(handle, scope, subject, target, captured, proposal.value);
            const revised = await f.plans.getRevision(handle, candidate.planRef), expected = structuredClone(original.definition);
            expected.nodes[0].policy.agentPinId = 'studio.alternative.0';
            expect(revised.definition).toEqual(expected); expect(revised.dependencyPins).toEqual(original.dependencyPins);
            expect((await f.plans.get(handle, f.planRef.planId)).definition).toEqual(draft.definition);
            const settings = await targets.evaluationSettings(handle, scope, subject, target, candidate.candidateId);
            expect(settings.runtimeRouteId).toBe(allowed.runtimeRouteId);
            let gates = 0;
            await targets.write(handle, scope, subject, target, candidate.candidateId, false, null, async () => { gates++; });
            await targets.write(handle, scope, subject, target, candidate.candidateId, false, null, async () => { gates++; });
            expect(gates).toBe(1);
            f.input.runtimeRouteId = allowed.runtimeRouteId;
            await f.run();
            const root = await f.authority.execution.runs.get(handle, f.effects[0].runId);
            expect(root.planRef).toEqual(candidate.planRef); expect(f.requests).toHaveLength(1);
            const effect = await f.h.engine.withTransaction(handle, tx => readEffect(tx, handle, root, f.effects[0].effectId));
            expect(effect.doc.actionRef.runtimeRouteId).toBe(allowed.runtimeRouteId);
            await targets.write(handle, scope, subject, target, candidate.candidateId, true);
            expect((await f.plans.getBinding(handle, f.sourceSelector))).toMatchObject({ planRef: f.planRef, version: 2 });
            expect((await f.authority.execution.runs.get(handle, root.runId)).planRef).toEqual(candidate.planRef);
            await expect(targets.write(handle, scope, subject, target, candidate.candidateId)).rejects.toThrow('candidate_consumed');
        } finally { await f.cleanup(); }
    }, 60000);

    test('undeclared, unchanged, foreign-node and newly invented Routes never expand the node pins', async () => {
        const f = await setup(make, { foreign: true }), { targets, target, scope, subject } = f, handle = f.h.handle;
        try {
            const before = await targets.capture(handle, scope, subject, target);
            await expect(targets.prepare(handle, scope, subject, target, before, f.allowed)).rejects.toThrow('declaration_required');
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const captured = await targets.capture(handle, scope, subject, target);
            for (const value of [captured.body, f.outside, { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') },
                { ...f.allowed, approved: true }, { scope: 'library', runtimeRouteId: f.allowed.runtimeRouteId }]) {
                await expect(targets.prepare(handle, scope, subject, target, captured, value)).rejects.toThrow();
            }
            await expect(targets.capture(handle, scope, subject, { ...target, nodeId: f.plan.definition.outputContract.ownerNodeId })).rejects.toThrow();
            expect((await f.plans.getBinding(handle, f.sourceSelector))).toMatchObject({ planRef: f.planRef, version: 0 }); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    }, 30000);

    test.each([false, true])('Route Binding ACK saved=%s reuses the exact publication command and preserves the pins', async saved => {
        const f = await setup(make), { targets, target, scope, subject } = f, handle = f.h.handle;
        try {
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const captured = await targets.capture(handle, scope, subject, target), candidate = await targets.prepare(handle, scope, subject, target, captured, f.allowed);
            const plans = targets.nativePlans(), save = plans.saveBinding.bind(plans); let injected = false;
            plans.saveBinding = async (...args) => {
                if (injected) return save(...args);
                injected = true; if (saved) await save(...args);
                throw new StorageCommitUnknownError(new Error('Original Route Binding ACK'));
            };
            await expect(targets.write(handle, scope, subject, target, candidate.candidateId)).rejects.toMatchObject({ code: 'storage_commit_unknown' });
            const current = await targets.check(handle, scope, subject, target, candidate.candidateId);
            expect(hash(current.actual)).toBe(hash(saved ? current.desired : current.base));
            await targets.write(handle, scope, subject, target, candidate.candidateId);
            expect((await f.plans.getBinding(handle, f.sourceSelector)).version).toBe(1); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    }, 30000);

    test('an edited alternative Route cannot publish against an old pin, and failed publication leaves its original Binding', async () => {
        const f = await setup(make), { targets, target, scope, subject } = f, handle = f.h.handle;
        try {
            await targets.declare(handle, scope, subject, target, f.choice.baseHash);
            const captured = await targets.capture(handle, scope, subject, target), candidate = await targets.prepare(handle, scope, subject, target, captured, f.allowed);
            const route = await f.host.persistence.getRuntimeRoute(handle, f.allowed.runtimeRouteId);
            await f.host.persistence.saveRuntimeRoute(handle, { ...route, displayName: 'Changed after candidate preparation' });
            await expect(targets.write(handle, scope, subject, target, candidate.candidateId)).rejects.toThrow('dependency_stale');
            expect((await f.plans.getBinding(handle, f.sourceSelector))).toMatchObject({ planRef: f.planRef, version: 0 }); expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    }, 30000);
});
