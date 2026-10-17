import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { rpModelFixture } from './helpers/rp-model-fixture.js';
import { modelPortFixture } from './helpers/model-port-fixture.js';
import { backgroundModelFixture } from './helpers/background-model-fixture.js';
import { resolverTurnFixture } from './helpers/resolver-turn-fixture.js';
import { configureSessionOutput } from './helpers/session-output-fixture.js';
import { EvolutionTargets } from '../../src/native/agent-intelligence/evolution-targets.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readBackgroundTaskOutput } from '../../src/native/orchestration/background-task-output-contracts.js';
import { readRpOutput } from '../../src/native/orchestration/rp-output-contracts.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const harnesses = CONTRACT_HARNESSES.filter(({ name }) => ['FsEngine', 'SqliteEngine'].includes(name));
async function alternative({ plan, h, seeded, route }, nodeId = plan.definition.nodes.find(node => node.kind === 'agent').nodeId, { own = true } = {}) {
    const next = { ...route, runtimeRouteId: createNativeId('runtimeRoute'), displayName: 'Explicit node alternative' };
    await seeded.persistence.saveRuntimeRoute(h.handle, next);
    const pinId = 'alternative.' + plan.dependencyPins.length, resourceRef = { scope: 'player', runtimeRouteId: next.runtimeRouteId };
    plan.dependencyPins.push({ pinId, port: 'model', resourceRef, integrity: hash(next) });
    const node = plan.definition.nodes.find(node => node.nodeId === nodeId);
    if (own) { node.dependencyPinIds.push(pinId); node.policy.agentPinId = pinId; }
    return resourceRef;
}
async function modelRoutes(f) {
    return f.host.persistence._engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle }))
        .filter(row => row.key.recordType === 'effect' && row.doc.capability === 'generation.send').map(row => row.doc.actionRef.runtimeRouteId).toSorted());
}

describe.each(harnesses)('$name exact node Routes across original consumers', ({ make }) => {
    test('an RP Route strategy completes the original single Chat output and rollback preserves the completed Root', async () => {
        let selected;
        const f = await rpModelFixture(make, { configurePlan: async (plan, args) => {
            const node = plan.definition.nodes[0], originalPinId = node.policy.agentPinId;
            selected = await alternative({ plan, ...args }); node.policy.agentPinId = originalPinId;
            configureSessionOutput({ plan });
        } });
        try {
            const targets = new EvolutionTargets({ host: f.host }), scope = { domain: 'rp_chat', charDir: 'Actor', name: 'main', isGroup: false, groupId: '' };
            const choice = (await targets.catalog(f.h.handle, scope, 'Actor')).find(choice => choice.target.fieldPath === 'routeRef');
            await targets.declare(f.h.handle, scope, 'Actor', choice.target, choice.baseHash);
            const captured = await targets.capture(f.h.handle, scope, 'Actor', choice.target);
            const candidate = await targets.prepare(f.h.handle, scope, 'Actor', choice.target, captured, selected);
            await targets.write(f.h.handle, scope, 'Actor', choice.target, candidate.candidateId);
            await expect(f.run({ requestId: 'old-route-rejected' })).rejects.toThrow('route_mismatch'); expect(f.requests).toEqual([]);
            await f.run({ routeRef: selected });
            const root = await f.authority.execution.runs.get(f.h.handle, f.effects[0].runId);
            expect(root.status).toBe('completed'); expect(root.planRef).toEqual(candidate.planRef); expect(await modelRoutes(f)).toEqual([selected.runtimeRouteId]);
            expect((await f.chats.get(f.h.handle, f.locator.charDir, f.locator.name)).body).toHaveLength(3);
            const proof = await f.h.engine.withTransaction(f.h.handle, tx => readRpOutput(tx, f.h.handle, root));
            expect(proof.closure.effectIds.length).toBeGreaterThan(1);
            await targets.write(f.h.handle, scope, 'Actor', choice.target, candidate.candidateId, true);
            expect((await f.plans.getBinding(f.h.handle, f.sourceSelector)).planRef).toEqual(f.planRef);
            expect((await f.authority.execution.runs.get(f.h.handle, root.runId)).status).toBe('completed'); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('the Session Narrator follows its exact Plan pin with multiple original narrator Routes and retains cold output proof', async () => {
        let selected;
        const f = await modelPortFixture(make, { configurePlan: async args => {
            selected = await alternative(args); configureSessionOutput(args);
        } });
        try {
            await f.start();
            const runId = f.effectRef.runId, root = await f.authority.execution.runs.get(f.h.handle, runId);
            expect(root.status).toBe('completed'); expect(await modelRoutes(f)).toEqual([selected.runtimeRouteId]); expect(f.requests).toHaveLength(1);
            const proof = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root));
            await f.cold();
            const cold = await f.authority.execution.runs.get(f.h.handle, runId);
            expect((await f.host.persistence._engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, cold))).claim).toEqual(proof.claim);
        } finally { await f.cleanup(); }
    }, 60000);

    test('selected Scheduler lanes require the same private selection and exact owner, Host, source and input', async () => {
        let selected;
        const f = await modelPortFixture(make, { configurePlan: async args => { selected = await alternative(args); configureSessionOutput(args); } });
        try {
            const args = { host: f.host, handle: f.h.handle, base: f.base, input: f.input, transaction: null };
            const selection = await f.authority.preflightBinding(args);
            const lanes = await f.authority.selectedTurnLanes({ ...args, selection });
            expect(lanes.map(route => route.runtimeRouteId)).toEqual([selected.runtimeRouteId]);
            for (const change of [{ selection: { ...selection } }, { handle: 'foreign' }, { host: { ...f.host } },
                { input: { ...f.input, invocationId: 'foreign-lane-input' } }, { base: { ...f.base, revision: { ...f.base.revision, revisionId: createNativeId('revision') } } }]) {
                await expect(f.authority.selectedTurnLanes({ ...args, selection, ...change })).rejects.toThrow('selection_invalid');
            }
            expect(f.requests).toEqual([]); expect(await modelRoutes(f)).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);

    test('Resolver and Narrator choose their own declared alternatives without borrowing the other role or adding sends', async () => {
        let resolver, narrator;
        const f = await resolverTurnFixture(make, { configurePlan: async args => {
            resolver = await alternative({ ...args, route: args.resolverRoute }, args.resolverNodeId);
            narrator = await alternative(args, args.narratorNodeId); configureSessionOutput(args);
        } });
        f.input.routeRef = narrator;
        try {
            const result = await f.start(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(root.status).toBe('completed'); expect(f.requests).toHaveLength(2);
            expect(await modelRoutes(f)).toEqual([resolver.runtimeRouteId, narrator.runtimeRouteId].toSorted());
            expect(result.states.atri_lifecycle.domains.notes.records[0].value.text).toBe('updated');
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, root))).closure.effectIds.length).toBeGreaterThan(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test('a pending background Task adopts once through the selected node Route and the same original bank', async () => {
        let selected;
        const f = await backgroundModelFixture(make, { configurePlan: async args => { selected = await alternative(args); } });
        f.backgroundInput.slotBindings.structured = selected;
        try {
            const outcome = await f.run(), root = await f.authority.execution.runs.get(f.h.handle, f.effectRef.runId);
            expect(root.status).toBe('completed'); expect(outcome.results).toHaveLength(1); expect(await modelRoutes(f)).toEqual([selected.runtimeRouteId]);
            expect((await f.h.engine.withTransaction(f.h.handle, tx => readBackgroundTaskOutput(tx, f.h.handle, root))).receipt.costs.closed).toBe(true);
            expect((await f.run()).results).toEqual([]); expect(f.requests).toHaveLength(1);
        } finally { await f.cleanup(); }
    }, 60000);

    test.each(['rp', 'narrator', 'background'])('%s cannot borrow a Route pin that exists only at Plan level', async kind => {
        const add = args => alternative(args, undefined, { own: false });
        const f = kind === 'rp' ? await rpModelFixture(make, { configurePlan: (plan, args) => add({ plan, ...args }) })
            : kind === 'narrator' ? await modelPortFixture(make, { configurePlan: add }) : await backgroundModelFixture(make, { configurePlan: add });
        try {
            await expect(kind === 'narrator' ? f.start() : f.run()).rejects.toThrow('plan_unavailable');
            expect(f.requests).toEqual([]);
        } finally { await f.cleanup(); }
    }, 60000);
});
