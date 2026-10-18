import { expect, test } from '@jest/globals';
import { sessionDelegatedDynamicFixture } from './helpers/session-delegated-dynamic-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';

import { handoffReturnReceiptId } from '../../src/native/orchestration/handoff-return-contracts.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';

const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));
const bankOf = async (f, root) => (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[root.budgetAuthorityRef.operationId].compute;

test('SQLite Game child Planner adds a pure Agent from its original owned pin and reaches one parent narration', async () => {
    const f = await sessionDelegatedDynamicFixture(makeTempSqliteEngineHarness);
    try {
        const result = await f.start(), roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('completed'); expect(parent.status).toBe('completed'); expect(parent.outputClaims).toHaveLength(1);
        expect(f.requests).toHaveLength(5); expect(f.requests.map(body => body.model)).toEqual(['session-child-dynamic-planner', 'session-child-dynamic-owned-spare',
            'session-delegated-distinct-model', f.seeded.model.remoteModelId, f.seeded.model.remoteModelId]);
        expect(JSON.stringify(f.requests[1].input)).toContain(f.added.label); expect(JSON.stringify(f.requests[1].input)).toContain('addNode');
        expect(JSON.stringify(f.requests[2].input)).toContain('DYNAMIC_CHILD_ACTOR_ADVICE');
        expect(JSON.stringify(f.requests[3].input)).toContain('CHILD_DYNAMIC_TERMINAL_ADVICE');
        expect(JSON.stringify(f.requests[4].input)).toContain('PARENT_ACCEPTED_CHILD_DYNAMIC');
        for (const body of f.requests.slice(0, 4)) { expect(JSON.stringify(body.input)).toContain('阿岚听说'); expect(JSON.stringify(body.input)).not.toContain('沈墨怀疑'); }
        expect(child.graphRevision).toBe(1); expect(child.progress).toMatchObject({ attempts: 4, patches: 1, replans: 0, loopIterations: 0, edgeVisits: 4 });
        expect(child.graph.nodes).toContainEqual(f.added); expect(child.resultRefs).toHaveLength(2); expect(child.outputClaims).toHaveLength(1);
        expect(child.graph.outputContract).toEqual(f.topology.child.definition.outputContract);
        const terminalId = f.topology.children[0].nodeId;
        expect(child.graph.edges.find(edge => edge.to.nodeId === child.graph.outputContract.ownerNodeId).from.nodeId).toBe(terminalId);
        const local = await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child));
        const history = local.publication.graphHistory;
        expect(history.planners).toHaveLength(1); expect(history.effects).toHaveLength(3); expect(history.results).toHaveLength(1);
        expect(history.planners[0].patch.appliedOperations).toEqual(f.operations); expect(history.finalProducer.nodeId).toBe(terminalId);
        expect(history.results[0].producer.nodeId).toBe(f.added.nodeId); expect(history.results[0].producer.graphRevision).toBe(1);
        expect(history.results[0].record.payload).toBe('DYNAMIC_CHILD_ACTOR_ADVICE');
        expect(history.results[0].record.envelope.sourceRefs[2].sourceRef.audience).toEqual(f.topology.actorA);
        const bank = await bankOf(f, parent); expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3); expect(bank.localWork.every(row => row.status === 'settled')).toBe(true);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const original = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, parent));
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, parent.runId);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(original.receipt);
            const key = { kind: K.orchestrationRun, handle: f.h.handle, runId: child.runId }, stored = await tx.getResource(key);
            const changed = { ...stored.doc, graph: { ...stored.doc.graph,
                nodes: stored.doc.graph.nodes.map(node => node.nodeId === f.added.nodeId ? { ...node, label: 'FORGED_CHILD_DYNAMIC_LABEL' } : node) } };
            try { await tx.putResource(key, { ...stored, doc: changed, integrity: hash(changed) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, stored); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(original.receipt);
        });
        expect(f.requests).toHaveLength(5);
    } finally { await f.cleanup(); }
}, 180000);

test.each([
    ['undeclared model dependency', { undeclaredModel: true }, 'native_orchestration_session_child_graph_unavailable'],
    ['candidate work exceeds held child budget', { childRequests: 2 }, 'native_orchestration_graph_budget_unavailable'],
])('Game child dynamic %s keeps exact paid facts without widening its original authority', async (_name, options, issue) => {
    const f = await sessionDelegatedDynamicFixture(makeTempSqliteEngineHarness, options);
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1); expect(f.requests[0].model).toBe('session-child-dynamic-planner');
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe('blocked'); expect(parent.status).toBe('blocked'); expect(child.graphRevision).toBe(0);
        expect(child.graph.nodes.some(node => node.nodeId === f.added.nodeId)).toBe(false);
        expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]); expect(child.resultRefs).toEqual([]); expect(child.pendingEffectRefs).toEqual([]);
        const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'patch' }));
        expect(patches.map(row => row.doc)).toEqual([expect.objectContaining({ accepted: false, issues: [{ code: issue }], appliedOperations: [] })]);
        const bank = await bankOf(f, parent); expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
        expect(bank.attempts[0].reservationId).toBe(child.runId);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released',
            limits: expect.objectContaining({ maxRequests: options.childRequests ?? 3 }) })]);
        expect(await f.h.engine.withTransaction(f.h.handle, tx => tx.getResource(controlRecordKey(f.h.handle, parent.runId, 'receipt', handoffReturnReceiptId(child.runId))))).toBeNull();
        const current = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(current.timeline).toEqual(f.base.timeline); expect(current.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(1);
    } finally { await f.cleanup(); }
}, 90000);
