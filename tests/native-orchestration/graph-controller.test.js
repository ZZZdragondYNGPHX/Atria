import { PlanRepository, validationDigest } from '../../src/native/orchestration/plan-repository.js';
import { RunRepository } from '../../src/native/orchestration/run-repository.js';
import { AttemptController } from '../../src/native/orchestration/attempt-controller.js';
import { GraphController } from '../../src/native/orchestration/graph-controller.js';
import { graphPatchHash, readTaskGraphRevision } from '../../src/native/orchestration/graph-revision-contracts.js';
import { runGuard, controlRecordKey, controlCommandId } from '../../src/native/orchestration/controller-common.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument, putMutable } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { attachNativeHostLifecycle } from '../../src/storage/native-host-lifecycle.js';
import { CONTRACT_HARNESSES } from '../storage/harness/contract-harness.js';
import { planFixture, prepareControllerOwnerRoot } from './fixtures.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, required = false) => ({ name, type: 'task.result', required });
const edge = (from, fromPort, to, toPort) => ({ edgeId: id('Edge'), from: { nodeId: from, port: fromPort }, to: { nodeId: to, port: toPort }, condition: 'always', maxVisits: 10, loopBack: false });

describe.each(CONTRACT_HARNESSES)('$name G2 Host whole-patch control', ({ make }) => {
    let h, runs, graph, producerId, plannerId, joinId, rootId;
    beforeEach(async () => {
        h = await make();
        await prepareControllerOwnerRoot(h.dirs.root);
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
        expect(accepted.outcome.patchReceipt).toMatchObject({ previousGraphRevision: 0, appliedOperations: input.patch.operations, reasonRefs: input.patch.reasonRefs });
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

    test('original Plan and command-bound accepted Patches reconstruct each frozen revision without later successors or control changes', async () => {
        const original = await current(), first = addBranch(), second = addBranch();
        await graph.propose(h.handle, await proposal([{ op: 'markBlocked', nodeId: id('Node') }]));
        await graph.propose(h.handle, await proposal(first.operations));
        const middle = await current();
        await graph.propose(h.handle, await proposal(first.operations)); // rejected duplicate, no revision
        await graph.propose(h.handle, await proposal([...second.operations, { op: 'setPendingPriority', nodeId: first.nodeId, priority: 7 }]));
        const root = await current();
        const snapshots = await h.engine.withTransaction(h.handle, async tx => Promise.all([0, 1, 2].map(revision => readTaskGraphRevision(tx, h.handle, root, revision))));
        expect(snapshots[0].graph).toEqual(original.graph); expect(snapshots[1].graph).toEqual(middle.graph); expect(snapshots[2].graph).toEqual(root.graph);
        expect(snapshots[1].nodeControl[first.nodeId].priority).toBe(0); expect(snapshots[2].nodeControl[first.nodeId].priority).toBe(7);
        expect(snapshots[0].graph.edges.some(edge => edge.to.nodeId === first.nodeId)).toBe(false);
        expect(snapshots[1].graph.edges.some(edge => edge.to.nodeId === second.nodeId)).toBe(false);
        const saved = structuredClone(snapshots[1]); snapshots[2].graph.nodes[0].label = 'Caller mutation';
        expect(snapshots[1]).toEqual(saved);
        await h.engine.close();
        const cold = new h.engine.constructor({ url: h.url, nativeHostTopology: 'direct_single_primary', directoriesByHandle: () => h.dirs });
        attachNativeHostLifecycle(cold, { directoriesByHandle: () => h.dirs });
        try {
            expect(await cold.withTransaction(h.handle, tx => readTaskGraphRevision(tx, h.handle, root, 1))).toEqual(saved);
            await expect(cold.withTransaction(h.handle, tx => readTaskGraphRevision(tx, h.handle, root, 3))).rejects.toMatchObject({ code: 'native_orchestration_graph_history_unavailable' });
        } finally { await cold.close(); }
    });

    test.each(['root-topology', 'root-control', 'patch', 'command'])('honestly rehashed %s tampering refuses the next proposal instead of extending a fabricated graph', async target => {
        const branch = addBranch(), input = await proposal(branch.operations); await graph.propose(h.handle, input);
        const patchKey = controlRecordKey(h.handle, rootId, 'patch', input.patch.patchId);
        await h.engine.withTransaction(h.handle, async tx => {
            const key = target.startsWith('root-') ? { kind: K.orchestrationRun, handle: h.handle, runId: rootId } : target === 'patch' ? patchKey
                : { kind: K.orchestrationCommand, handle: h.handle, commandId: controlCommandId('graph.patch', input.patch.patchId) };
            const row = await tx.getResource(key), doc = structuredClone(row.doc);
            if (target === 'root-topology') doc.graph.nodes[0].label = 'Fabricated topology';
            else if (target === 'root-control') doc.nodeControl[joinId].priority = 7;
            else if (target === 'patch') doc.appliedOperations[0].node.label = 'Fabricated patch';
            else doc.payloadHash = '0'.repeat(64);
            await putMutable(tx, key, doc, { expectedIntegrity: row.integrity });
        });
        const before = await current();
        await expect(graph.propose(h.handle, await proposal([{ op: 'setPendingPriority', nodeId: joinId, priority: 4 }]))).rejects.toMatchObject({ code: 'native_orchestration_graph_history_unavailable' });
        expect(await current()).toEqual(before);
    });

    test('a rejected unvalidated node payload never enters the durable operation history', async () => {
        const branch = addBranch(); branch.operations[0].node.unvalidatedField = 'not-a-durable-graph-field';
        const input = await proposal(branch.operations), result = await graph.propose(h.handle, input);
        expect(result.outcome.patchReceipt).toMatchObject({ accepted: false, appliedOperations: [] });
        const stored = await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, rootId, 'patch', input.patch.patchId)));
        expect(JSON.stringify(stored)).not.toContain('not-a-durable-graph-field');
    });

    test('corrupt durable graph history refuses the next proposal instead of guessing progress', async () => {
        const branch = addBranch(), input = await proposal(branch.operations); await graph.propose(h.handle, input);
        const key = controlRecordKey(h.handle, rootId, 'patch', input.patch.patchId);
        await h.engine.withTransaction(h.handle, async tx => { const record = await tx.getResource(key); await tx.putResource(key, { ...record, integrity: '0'.repeat(64) }); });
        const before = await current();
        await expect(graph.propose(h.handle, await proposal([{ op: 'setPendingPriority', nodeId: branch.nodeId, priority: 4 }]))).rejects.toMatchObject({ code: 'native_orchestration_graph_history_unavailable' });
        expect(await current()).toEqual(before);
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

    test('multiple pending-state operations in one batch coalesce into one final Attempt write', async () => {
        const branch = addBranch(); await graph.propose(h.handle, await proposal(branch.operations));
        const root = await current();
        const pending = await runs.beginAttempt(h.handle, id('Command'), { ...runGuard(root), nodeId: branch.nodeId, inputRefs: [], inputDigest: hashNativeDocument([]), effectiveGrantDigest: hashNativeDocument([]), budgetRef: root.budgetAuthorityRef });
        const result = await graph.propose(h.handle, await proposal([{ op: 'markBlocked', nodeId: branch.nodeId }, { op: 'cancelPending', nodeId: branch.nodeId }]));
        expect(result.outcome.patchReceipt.accepted).toBe(true);
        const stored = await h.engine.withTransaction(h.handle, tx => tx.getResource(controlRecordKey(h.handle, rootId, 'attempt', pending.attemptId)));
        expect(stored.doc.status).toBe('cancelled'); expect(stored.doc.reasonCode).toBe('graph_cancelPending');
    });
});
