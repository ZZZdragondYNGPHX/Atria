import { expect, test } from '@jest/globals';
import { sessionDelegationFixture } from './helpers/session-delegation-fixture.js';
import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';
import { controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readSessionOutput } from '../../src/native/orchestration/session-output-contracts.js';

const id = kind => createNativeId('orchestration' + kind);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, name) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: from.outputs[0].name },
    to: { nodeId: to.nodeId, port: name }, condition: 'always', maxVisits: 1, loopBack: false });
const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));
const taskOf = body => (body.input ?? []).flatMap(item => { try { return [JSON.parse(item.content)]; } catch { return []; } }).findLast(item => typeof item?.nodeId === 'string' && typeof item?.label === 'string');

async function fixture({ usageUnknown = false, sourceWithdraw = false, scopePlanner = false, childRequests = null } = {}) {
    let release, arrived = 0, branches, fanout, join, final, planner;
    const both = new Promise(resolve => { release = resolve; });
    const f = await sessionDelegationFixture(makeTempSqliteEngineHarness, { childSteps: 2, childRequests: childRequests ?? (scopePlanner ? 4 : 3), parentRequests: scopePlanner ? 6 : 5, maxConcurrency: 2,
        configureChild: async (child, { seeded, h }) => {
            const [first, terminal, output] = child.definition.nodes; final = terminal;
            const originalRoute = await seeded.persistence.getRuntimeRoute(h.handle, child.dependencyPins[0].resourceRef.runtimeRouteId);
            const originalModel = await seeded.persistence.getModelProfile(h.handle, originalRoute.modelProfileRef.modelProfileId);
            const connection = await seeded.persistence.getConnectionProfile(h.handle, originalRoute.connectionProfileRef.connectionProfileId);
            const otherConnection = { ...connection, connectionProfileId: createNativeId('connectionProfile') };
            const otherModel = { ...originalModel, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'session-child-fanout-distinct-B',
                connectionProfileRef: { scope: 'player', connectionProfileId: otherConnection.connectionProfileId } };
            const otherRoute = { ...originalRoute, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: otherModel.modelProfileId },
                connectionProfileRef: otherModel.connectionProfileRef, executionPolicy: { ...originalRoute.executionPolicy, allowedModelProfileIds: [otherModel.modelProfileId] } };
            await seeded.persistence.saveConnectionProfile(h.handle, otherConnection); await seeded.persistence.saveModelProfile(h.handle, otherModel); await seeded.persistence.saveRuntimeRoute(h.handle, otherRoute);
            child.dependencyPins.push({ pinId: 'child.branchB', port: 'model', resourceRef: { scope: 'player', runtimeRouteId: otherRoute.runtimeRouteId }, integrity: hash(otherRoute) });
            const second = { ...structuredClone(first), nodeId: id('Node'), label: 'Actor-scoped child independent branch B', dependencyPinIds: ['child.branchB', first.policy.audiencePinId],
                policy: { agentPinId: 'child.branchB', audiencePinId: first.policy.audiencePinId } };
            first.label = 'Actor-scoped child independent branch A'; branches = [first, second];
            for (const node of branches) node.inputs = [port('scope', 'task.result')];
            fanout = { nodeId: id('Node'), kind: 'fanout', label: 'Original child scope freeze', inputs: [], outputs: [port('scope', 'task.result', false)],
                dependencyPinIds: [], capabilities: [], policy: { maxConcurrency: 2, failurePolicy: 'continue' } };
            join = { nodeId: id('Node'), kind: 'join', label: 'Original child actual Join', inputs: [port('left', 'text'), port('right', 'text')], outputs: [port('joined', 'text', false)],
                dependencyPinIds: [], capabilities: [], policy: { strategy: 'all-success', quorum: 2, deadlineMs: 120000 } };
            child.definition.nodes = [fanout, ...branches, join, final, output]; child.definition.entryNodeIds = [fanout.nodeId];
            child.definition.edges = [edge(fanout, first, 'scope'), edge(fanout, second, 'scope'), edge(first, join, 'left'), edge(second, join, 'right'), edge(join, final, 'previous'), edge(final, output, 'result')];
            Object.assign(child.definition.limits, { maxAttempts: 6, maxNodes: 6, maxEdges: 6, maxEdgeVisits: 6 });
            if (scopePlanner) {
                planner = { ...structuredClone(first), nodeId: id('Node'), kind: 'planner', label: 'Actor child original frozen scope Planner',
                    outputs: [port('control', 'json', false)], capabilities: ['generation.send', 'graph.patch'] };
                first.inputs = [port('control', 'json')];
                child.definition.nodes.splice(1, 0, planner);
                child.definition.edges = child.definition.edges.map(item => item.from.nodeId === fanout.nodeId && item.to.nodeId === first.nodeId
                    ? edge(fanout, planner, 'scope') : item);
                child.definition.edges.push(edge(planner, first, 'control'));
                child.definition.capabilityCeiling.push('graph.patch');
                child.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
                Object.assign(child.definition.limits, { maxAttempts: 7, maxNodes: 7, maxEdges: 7, maxEdgeVisits: 7 });
            }
        }, configureParent: (plan, _args, topology) => {
            if (scopePlanner) {
                topology.delegator.capabilities.push('graph.patch'); plan.definition.capabilityCeiling.push('graph.patch');
                plan.definition.graphChangePolicy = { allowedOperations: ['setPendingPriority', 'requestFinalize'], allowedNodeKinds: [] };
            }
        }, responseUsage: body => !(usageUnknown && body.model === 'session-child-fanout-distinct-B'),
        responsePayload: async body => {
            const task = taskOf(body);
            if (scopePlanner && task?.nodeId === branches[0].nodeId) return 'ACTOR_CHILD_CONCURRENT_A';
            if (branches.some(node => node.nodeId === task?.nodeId) || scopePlanner && task?.nodeId === planner.nodeId) {
                if (++arrived === 2) {
                    try { if (sourceWithdraw) await f.core.appendTimeline(f.h.handle, f.base.session.sessionId, { role: 'user', content: 'Withdraw both paid child branch Sources.' }); }
                    finally { release(); }
                }
                await both; // Both real HTTP requests must arrive before either returns.
                return scopePlanner && task.nodeId === planner.nodeId ? JSON.stringify({ operations: [{ op: 'setPendingPriority', nodeId: branches[0].nodeId, priority: 7 }] })
                    : task.nodeId === branches[0].nodeId ? 'ACTOR_CHILD_CONCURRENT_A' : 'ACTOR_CHILD_CONCURRENT_B';
            }
            if (task?.nodeId === final.nodeId) return 'ACTOR_CHILD_JOINED_TERMINAL';
            return JSON.stringify(body.input).includes('Game source-scoped delegate parent') ? 'PARENT_ACCEPTED_JOINED_CHILD' : 'The NPC waits for the player choice.';
        } });
    return { ...f, get authority() { return f.authority; }, get core() { return f.core; }, get effectRef() { return f.effectRef; },
        get arrived() { return arrived; }, branches, fanout, join, final, planner, release };
}

test('SQLite Game child Fanout runs two independent Actor-scoped Models concurrently before original TaskLocal and sole Narrator', async () => {
    const f = await fixture();
    try {
        const result = await f.start(), roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(f.arrived).toBe(2); expect(f.requests).toHaveLength(5); expect(child.status).toBe('completed'); expect(parent.status).toBe('completed');
        expect(f.requests.slice(0, 2).map(body => body.model).sort()).toEqual(['session-delegated-distinct-model', 'session-child-fanout-distinct-B'].sort());
        expect(f.requests.slice(0, 3).every(body => !body.tools?.length)).toBe(true);
        expect(JSON.stringify(f.requests[2].input)).toContain('ACTOR_CHILD_CONCURRENT_A'); expect(JSON.stringify(f.requests[2].input)).toContain('ACTOR_CHILD_CONCURRENT_B');
        expect(JSON.stringify(f.requests[3].input)).toContain('ACTOR_CHILD_JOINED_TERMINAL'); expect(JSON.stringify(f.requests[4].input)).toContain('PARENT_ACCEPTED_JOINED_CHILD');
        for (const request of f.requests.slice(0, 4)) { expect(JSON.stringify(request.input)).toContain('阿岚听说'); expect(JSON.stringify(request.input)).not.toContain('沈墨怀疑'); }
        expect(child.progress).toMatchObject({ attempts: 6, edgeVisits: 6, delegates: 0, handoffs: 0, loopIterations: 0 });
        expect(child.outputClaims).toHaveLength(1); expect(parent.outputClaims).toHaveLength(1);
        const local = await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child)), history = local.publication.graphHistory;
        expect(history.fanouts).toHaveLength(1); const [joined] = history.fanouts;
        expect(joined.frame.maxConcurrency).toBe(2); expect(joined.scopeAttempts).toHaveLength(2); expect(joined.providerEffects).toHaveLength(2);
        expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2); expect(joined.joinReceipt.outcome).toBe('completed'); expect(history.effects).toHaveLength(3); expect(history.settled).toBe(true);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[parent.budgetAuthorityRef.operationId].compute;
        expect(bank.attempts).toHaveLength(5); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true); expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const published = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, parent));
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, parent.runId);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(published.receipt);
            const key = controlRecordKey(f.h.handle, child.runId, 'join', joined.joinReceipt.joinId), saved = await tx.getResource(key), changed = { ...saved.doc, acceptedResultRefs: [] };
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(published.receipt);
        });
        expect(f.requests).toHaveLength(5);
    } finally { f.release(); await f.cleanup(); }
}, 240000);

for (const kind of ['source', 'usage_unknown']) test('SQLite Game child Fanout retains both paid branch identities at original ' + kind + ' boundary without parent Output or replay', async () => {
    const unknown = kind === 'usage_unknown', f = await fixture({ usageUnknown: unknown, sourceWithdraw: !unknown });
    try {
        await expect(f.start()).rejects.toThrow(); expect(f.arrived).toBe(2); expect(f.requests).toHaveLength(2);
        expect(f.requests.map(body => body.model).sort()).toEqual(['session-delegated-distinct-model', 'session-child-fanout-distinct-B'].sort());
        for (const body of f.requests) { expect(JSON.stringify(body.input)).toContain('阿岚听说'); expect(JSON.stringify(body.input)).not.toContain('沈墨怀疑'); }
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.status).toBe(unknown ? 'reconciling' : 'blocked'); expect(parent.status).toBe(unknown ? 'reconciling' : 'blocked');
        expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[parent.budgetAuthorityRef.operationId].compute;
        expect(bank.limits.maxRequests).toBe(5); expect(bank.attempts).toHaveLength(2); expect(new Set(bank.attempts.map(row => row.attemptId)).size).toBe(2);
        expect(bank.attempts.every(row => row.reservationId === child.runId)).toBe(true);
        expect(bank.attempts.filter(row => row.status === 'settled')).toHaveLength(unknown ? 1 : 2);
        expect(bank.attempts.filter(row => row.status === 'unknown')).toHaveLength(unknown ? 1 : 0);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: unknown ? 'held' : 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            expect(await readTaskLocalOutput(tx, f.h.handle, child)).toBeNull(); expect(await readSessionOutput(tx, f.h.handle, parent)).toBeNull();
            const effects = (await tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'effect' })).map(row => row.doc);
            expect(effects).toHaveLength(2); expect(effects.every(effect => effect.sourceBindingDigest === child.sourceBinding.bindingDigest)).toBe(true);
            expect(bank.attempts.map(row => row.orchestration.effectId).sort()).toEqual(effects.map(effect => effect.effectId).sort());
        });
        const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(snapshot.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(snapshot.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        expect(snapshot.revision.revisionId === child.sourceBinding.sourceRef.revisionId).toBe(unknown);
        await f.cold(); await expect(f.start()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
    } finally { f.release(); await f.cleanup(); }
}, 120000);

test('SQLite Game child frozen scope Planner controls its reserved Agent before original Join TaskLocal and sole Narrator', async () => {
    const f = await fixture({ scopePlanner: true });
    try {
        const result = await f.start(), roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(f.arrived).toBe(2); expect(f.requests).toHaveLength(6); expect(child.status).toBe('completed'); expect(parent.status).toBe('completed');
        expect(f.requests.slice(0, 2).map(body => body.model).sort()).toEqual(['session-delegated-distinct-model', 'session-child-fanout-distinct-B'].sort());
        expect(f.requests.slice(0, 4).every(body => !body.tools?.length)).toBe(true);
        expect(JSON.stringify(f.requests[3].input)).toContain('ACTOR_CHILD_CONCURRENT_A'); expect(JSON.stringify(f.requests[3].input)).toContain('ACTOR_CHILD_CONCURRENT_B');
        expect(JSON.stringify(f.requests[4].input)).toContain('ACTOR_CHILD_JOINED_TERMINAL'); expect(JSON.stringify(f.requests[5].input)).toContain('PARENT_ACCEPTED_JOINED_CHILD');
        for (const request of f.requests.slice(0, 5)) { expect(JSON.stringify(request.input)).toContain('阿岚听说'); expect(JSON.stringify(request.input)).not.toContain('沈墨怀疑'); }
        expect(child.progress).toMatchObject({ attempts: 7, edgeVisits: 7, patches: 1, delegates: 0, handoffs: 0, loopIterations: 0 });
        expect(child.outputClaims).toHaveLength(1); expect(parent.outputClaims).toHaveLength(1);
        expect(child.graphRevision).toBe(1); expect(child.nodeControl[f.branches[0].nodeId].priority).toBe(7);
        expect(JSON.stringify(f.requests[2].input)).toContain('setPendingPriority');
        const local = await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child)), history = local.publication.graphHistory;
        expect(history.fanouts).toHaveLength(1); const [joined] = history.fanouts;
        expect(joined.frame.maxConcurrency).toBe(2); expect(joined.scopeAttempts).toHaveLength(3); expect(joined.providerEffects).toHaveLength(3);
        expect(joined.joinReceipt.acceptedResultRefs).toHaveLength(2); expect(joined.joinReceipt.outcome).toBe('completed'); expect(history.effects).toHaveLength(4); expect(history.settled).toBe(true);
        expect(joined.frame.graphRevision).toBe(0); expect(history.planners).toHaveLength(1);
        expect(history.planners[0].patch.appliedOperations).toEqual([{ op: 'setPendingPriority', nodeId: f.branches[0].nodeId, priority: 7 }]);
        const reserved = joined.scopeAttempts.find(item => item.attempt.nodeId === f.branches[0].nodeId).attempt;
        expect(reserved.reservationRef.producerAttemptId).toBe(joined.frame.fanoutAttemptId); expect(reserved.graphRevision).toBe(1);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[parent.budgetAuthorityRef.operationId].compute;
        expect(bank.limits.maxRequests).toBe(6);
        expect(bank.attempts).toHaveLength(6); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true); expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(4);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 4 }) })]);
        expect(result.states.atri_world_state).toEqual(f.base.states.atri_world_state); expect(result.states.atri_lifecycle.domains).toEqual(f.base.states.atri_lifecycle.domains);
        const published = await f.h.engine.withTransaction(f.h.handle, tx => readSessionOutput(tx, f.h.handle, parent));
        await f.cold(); const cold = await f.authority.execution.runs.get(f.h.handle, parent.runId);
        await f.authority.engine.withTransaction(f.h.handle, async tx => {
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(published.receipt);
            const key = controlRecordKey(f.h.handle, child.runId, 'join', joined.joinReceipt.joinId), saved = await tx.getResource(key), changed = { ...saved.doc, acceptedResultRefs: [] };
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readSessionOutput(tx, f.h.handle, cold)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readSessionOutput(tx, f.h.handle, cold)).receipt).toEqual(published.receipt);
        });
        expect(f.requests).toHaveLength(6);
    } finally { f.release(); await f.cleanup(); }
}, 240000);

test('Game child scope Planner cannot increase the original held three-request allocation before any scope send', async () => {
    const f = await fixture({ scopePlanner: true, childRequests: 3 });
    try {
        let failure; try { await f.start(); } catch (error) { failure = error; }
        const causes = []; for (let error = failure; error; error = error.cause) causes.push(error.code ?? error.message);
        expect(causes.join(' ')).toContain('native_orchestration_graph_budget_unavailable'); expect(f.requests).toEqual([]);
        const roots = await rootsOf(f), child = roots.find(root => root.parentRef), parent = roots.find(root => !root.parentRef);
        expect(child.outputClaims).toEqual([]); expect(parent.outputClaims).toEqual([]);
        const bank = (await f.core.runs.status(f.h.handle, f.base.session.sessionId)).operations[parent.budgetAuthorityRef.operationId].compute;
        expect(bank.limits.maxRequests).toBe(6); expect(bank.attempts).toEqual([]);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        const snapshot = await f.core.observe(f.h.handle, f.base.session.sessionId);
        expect(snapshot.timeline).toEqual(f.base.timeline); expect(snapshot.states.atri_world_state).toEqual(f.base.states.atri_world_state);
        await f.cold(); await expect(f.start()).rejects.toThrow(); expect(f.requests).toEqual([]);
    } finally { f.release(); await f.cleanup(); }
}, 120000);
