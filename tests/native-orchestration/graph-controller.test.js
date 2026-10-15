import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { GraphController, graphPatchHash } from '../../src/native/orchestration/graph-controller.js';
import { runGuard, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument } from '../../src/native/repositories/common.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture } from './fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, required = false) => ({ name, type: 'task.result', required });
const edge = (from, fromPort, to, toPort) => ({ edgeId: id('Edge'), from: { nodeId: from, port: fromPort }, to: { nodeId: to, port: toPort }, condition: 'always', maxVisits: 10, loopBack: false });

describe.each(CONTRACT_HARNESSES)('$name G2 Host whole-patch control', ({ make }) => {
    let h, runs, graph, producerId, plannerId, joinId, rootId;
    beforeEach(async () => {
        h = await make();
        const lifecycle = attachNativeHostLifecycle(h.engine, { directoriesByHandle: () => h.dirs });
        const authorize = async () => {}, assertWriter = (handle, tx) => lifecycle.assertWriter(handle, tx);
        const plans = new PlanRepository({ engine: h.engine, authorize, assertWriter, validateDependencies: async () => ({ status: 'valid', issues: [], dependencyDigest: hashNativeDocument([]) }) });
        const fixture = planFixture(), output = fixture.definition.nodes[0];
        plannerId = id('Node'); joinId = id('Node');
        fixture.definition.nodes = [
            { nodeId: plannerId, kind: 'planner', label: 'Planner', inputs: [port('feedback')], outputs: [port('next')], dependencyPinIds: ['model.route'], capabilities: ['graph.patch'], policy: { agentPinId: 'model.route' } },
            { nodeId: joinId, kind: 'join', label: 'Join', inputs: [port('a'), port('b')], outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { strategy: 'all-settled', quorum: 1, deadlineMs: 60000 } },
            { ...output, inputs: [port('body', true)] },
        ];
        fixture.definition.edges = [edge(plannerId, 'next', joinId, 'a'), edge(joinId, 'next', output.nodeId, 'body')];
        fixture.definition.entryNodeIds = [plannerId];
        fixture.definition.capabilityCeiling = ['graph.patch'];
        fixture.definition.graphChangePolicy = { allowedOperations: ['addNode', 'addEdge', 'setPendingPriority', 'cancelPending', 'markBlocked', 'requestFinalize', 'requestReplan'], allowedNodeKinds: ['wait'] };
        fixture.definition.limits.maxSteps = 100;
        fixture.dependencyPins = [{ pinId: 'model.route', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: createNativeId('runtimeRoute') }, integrity: 'a'.repeat(64) }];
        const plan = await plans.create(h.handle, id('Command'), fixture);
        const expected = { planId: plan.planId, expectedDraftVersion: plan.draftVersion, expectedDefinitionHash: plan.definitionHash };
        const report = await plans.validate(h.handle, expected);
        const { planRef } = await plans.publish(h.handle, id('Command'), { ...expected, validationDigest: validationDigest(report) });
        const source = { sourceAuthority: 'controlled-test-port', sourceRef: { id: 'current-test-source' } };
        runs = new RunRepository({ engine: h.engine, authorize, assertWriter, admit: async () => ({ sourceBinding: { ...source, bindingDigest: hashNativeDocument(source) }, budgetAuthorityRef: { domain: 'controlled-test-bank' } }) });
        let root = await runs.start(h.handle, id('Command'), { planRef, sourceRequest: {}, retentionPolicyRef: { policyId: 'test-retention' } });
        rootId = root.runId;
        ({ attemptId: producerId } = await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId: plannerId, inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: hashNativeDocument({ grant: 'graph.patch' }), budgetRef: root.budgetAuthorityRef }));
        root = await runs.get(h.handle, rootId);
        await new AttemptController({ runs, authorizeAttempt: async () => {} }).activate(h.handle, { ...runGuard(root), attemptId: producerId });
        graph = new GraphController({ runs, authorizePatch: async () => {} });
    });
    afterEach(async () => { await h?.engine.close(); await h?.cleanup(); });
    const current = () => runs.get(h.handle, rootId);
    async function proposal(operations, prior = null) {
        const root = prior ?? await current();
        const patch = { schemaVersion: 1, patchId: id('Patch'), runId: rootId, producerAttemptId: producerId, expectedEpoch: root.epoch, expectedGraphRevision: root.graphRevision, operations,
            reasonRefs: [{ kind: 'source', bindingDigest: root.sourceBinding.bindingDigest }], payloadHash: '0'.repeat(64) };
        patch.payloadHash = graphPatchHash(patch);
        return { expectedStateVersion: root.stateVersion, patch };
    }
    function addBranch() {
        const nodeId = id('Node');
        const node = { nodeId, kind: 'wait', label: 'Bounded branch', inputs: [port('in', true)], outputs: [port('next')], dependencyPinIds: [], capabilities: [], policy: { timeoutMs: 1000 } };
        return { nodeId, operations: [{ op: 'addNode', node }, { op: 'addEdge', edge: edge(plannerId, 'next', nodeId, 'in') }, { op: 'addEdge', edge: edge(nodeId, 'next', joinId, 'b') }] };
    }

    test('accepted whole patch advances graph/counters once; duplicate patch returns its original receipt', async () => {
        const branch = addBranch(), input = await proposal(branch.operations);
        const accepted = await graph.propose(h.handle, input);
        expect(accepted).toMatchObject({ replayed: false, outcome: { patchReceipt: { accepted: true, newGraphRevision: 1 } } });
        const after = await current();
        expect(after.graph.nodes.some(node => node.nodeId === branch.nodeId)).toBe(true);
        const replay = await graph.propose(h.handle, input);
        expect(replay).toMatchObject({ replayed: true, outcome: accepted.outcome });
        expect((await graph.propose(h.handle, { ...input, expectedStateVersion: after.stateVersion })).outcome).toEqual(accepted.outcome);
        expect(await current()).toEqual(after);
        const changed = structuredClone(input); changed.patch.operations[0].node.label = 'Changed'; changed.patch.payloadHash = graphPatchHash(changed.patch);
        await expect(graph.propose(h.handle, changed)).rejects.toMatchObject({ code: 'native_orchestration_command_conflict' });
    });

    test('a rejected batch writes no partial topology or node disposition', async () => {
        const branch = addBranch();
        const input = await proposal([branch.operations[0], { op: 'setPendingPriority', nodeId: id('Node'), priority: 3 }]);
        const result = await graph.propose(h.handle, input);
        expect(result.outcome.patchReceipt).toMatchObject({ accepted: false, newGraphRevision: 0 });
        const after = await current();
        expect(after.graph.nodes.some(node => node.nodeId === branch.nodeId)).toBe(false);
        expect(after.nodeControl).not.toHaveProperty(branch.nodeId);
        expect(after.progress.patches).toBe(0);
    });

    test('active producer inputs, output owner and capability ceiling cannot be rewritten', async () => {
        const branch = addBranch(); branch.operations[0].node.capabilities = ['world.write'];
        const cases = [branch.operations, [{ op: 'addEdge', edge: edge(joinId, 'next', plannerId, 'feedback') }], [{ op: 'cancelPending', nodeId: (await current()).graph.outputContract.ownerNodeId }], [{ op: 'cancelPending', nodeId: joinId }]];
        for (const operations of cases) {
            const result = await graph.propose(h.handle, await proposal(operations));
            expect(result.outcome.patchReceipt.accepted).toBe(false);
        }
        expect((await current()).graphRevision).toBe(0);
    });

    test('new patch IDs cannot repeatedly reset identical work without new evidence', async () => {
        const operations = [{ op: 'setPendingPriority', nodeId: joinId, priority: 5 }];
        expect((await graph.propose(h.handle, await proposal(operations))).outcome.patchReceipt.accepted).toBe(true);
        const result = await graph.propose(h.handle, await proposal(operations));
        expect(result.outcome.patchReceipt).toMatchObject({ accepted: false, issues: [{ code: 'native_orchestration_patch_no_progress' }] });
        expect((await current()).graphRevision).toBe(1);
    });

    test('cancelling a pending optional branch preserves its attempt and never erases executed work', async () => {
        const branch = addBranch(); await graph.propose(h.handle, await proposal(branch.operations));
        let root = await current();
        const pending = await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId: branch.nodeId, inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: hashNativeDocument({}), budgetRef: root.budgetAuthorityRef });
        const result = await graph.propose(h.handle, await proposal([{ op: 'cancelPending', nodeId: branch.nodeId }]));
        expect(result.outcome.patchReceipt.accepted).toBe(true);
        root = await current();
        expect(root.nodeControl[branch.nodeId].disposition).toBe('cancelled');
        expect(root.attemptRefs).toContain(pending.attemptId);
        const record = await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, rootId, 'attempt', pending.attemptId)));
        expect(record.doc.status).toBe('cancelled');
    });
});
