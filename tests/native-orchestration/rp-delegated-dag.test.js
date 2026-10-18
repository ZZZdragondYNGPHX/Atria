import { makeTempSqliteEngineHarness } from '../storage/harness/contract-harness.js';
import { rpDelegationFixture } from './helpers/rp-delegation-fixture.js';
import { createNativeId } from '../../src/native/identity.js';
import { hashNativeDocument as hash } from '../../src/native/repositories/common.js';
import { readTaskLocalOutput } from '../../src/native/orchestration/task-local-output-contracts.js';
import { readGraphNodeResult } from '../../src/native/orchestration/graph-result-contracts.js';
import { readDelegatedRpSource } from '../../src/native/orchestration/delegated-source-contracts.js';
import { rpOperationInput } from '../../src/native/rp-run-control.js';
import { readAttempt, controlRecordKey } from '../../src/native/orchestration/controller-common.js';
import { NATIVE_RESOURCE_KINDS as K } from '../../src/native/contracts.js';

const id = kind => createNativeId('orchestration' + kind), text = body => JSON.stringify(body.messages);
const port = (name, type, required = true) => ({ name, type, required });
const edge = (from, to, input, maxVisits = 1, loopBack = false) => ({ edgeId: id('Edge'), from: { nodeId: from.nodeId, port: 'response' },
    to: { nodeId: to.nodeId, port: input }, condition: 'always', maxVisits, loopBack });
const bankOf = async f => Object.values((await f.control.status(f.h.handle, f.controlId)).operations)[0].compute;
const rootsOf = f => f.h.engine.withTransaction(f.h.handle, async tx => (await tx.listResources({ kind: K.orchestrationRun, handle: f.h.handle })).map(row => row.doc));

async function setup({ pureAgents = false, nonself = false, childRequests = nonself ? 5 : 3, missingPin = false, dynamic = false, missingFuturePin = false } = {}) {
    let nodes, sharedPin, plannerModelId, draftModelId, plannerRound = 0, draftRound = 0;
    const f = await rpDelegationFixture(makeTempSqliteEngineHarness, { configurePlan: async (plan, env) => {
        const route = { ...env.route, executionPolicy: { ...env.route.executionPolicy, computeBudget: { ...env.route.executionPolicy.computeBudget,
            maxRequests: 6, localWork: { ...env.route.executionPolicy.computeBudget.localWork, maxJobs: 64 } } } };
        await env.seeded.persistence.saveRuntimeRoute(env.h.handle, route); plan.dependencyPins[0].integrity = hash(route);
    }, configureChildRoute: route => {
        route.executionPolicy.computeBudget.maxRequests = childRequests; route.executionPolicy.computeBudget.localWork.maxJobs = 40;
    }, configureChildPlan: async (plan, env) => {
        const terminal = plan.definition.nodes[0], output = plan.definition.nodes[1]; terminal.label = 'Original RP child terminal';
        const base = await env.persistence.getRuntimeRoute(env.h.handle, plan.dependencyPins[0].resourceRef.runtimeRouteId);
        const make = async (kind, label, inputs) => {
            const connection = { ...env.connection, connectionProfileId: createNativeId('connectionProfile'), displayName: label };
            await env.persistence.saveConnectionProfile(env.h.handle, connection);
            const model = { ...env.model, modelProfileId: createNativeId('modelProfile'), remoteModelId: 'rp-child-dag-' + label,
                connectionProfileRef: { scope: 'player', connectionProfileId: connection.connectionProfileId } };
            await env.persistence.saveModelProfile(env.h.handle, model);
            const route = { ...base, runtimeRouteId: createNativeId('runtimeRoute'), modelProfileRef: { scope: 'player', modelProfileId: model.modelProfileId },
                connectionProfileRef: model.connectionProfileRef, executionPolicy: { ...base.executionPolicy, allowedModelProfileIds: [model.modelProfileId] } };
            await env.persistence.saveRuntimeRoute(env.h.handle, route); const pinId = 'rp.child.' + label;
            plan.dependencyPins.push({ pinId, port: 'model', resourceRef: { scope: 'player', runtimeRouteId: route.runtimeRouteId }, integrity: hash(route) });
            return { nodeId: id('Node'), kind, label, inputs, outputs: [port('response', kind === 'agent' ? 'text' : 'json', false)], dependencyPinIds: [pinId],
                capabilities: ['generation.send', ...kind === 'planner' ? ['graph.patch'] : []], policy: { agentPinId: pinId } };
        };
        const planner = await make(pureAgents ? 'agent' : 'planner', pureAgents ? 'first' : 'planner', nonself ? [port('seed', 'text')] : []), draft = await make('agent', 'draft', nonself ? [port('return', 'json', false)] : [port('control', pureAgents ? 'text' : 'json')]);
        plannerModelId = pureAgents ? 'rp-child-dag-first' : 'rp-child-dag-planner'; draftModelId = 'rp-child-dag-draft'; terminal.inputs = dynamic ? [port('control', 'json'), port('futureAdvice', 'text', false)] : [port('advice', nonself ? 'json' : 'text')];
        const loop = nonself ? edge(planner, draft, 'return', 1, true) : null;
        plan.definition.nodes = dynamic ? [planner, terminal, output] : nonself ? [draft, planner, terminal, output] : [planner, draft, terminal, output];
        plan.definition.entryNodeIds = [nonself ? draft.nodeId : planner.nodeId];
        plan.definition.edges = dynamic ? [edge(planner, terminal, 'control'), ...plan.definition.edges] : nonself ? [edge(draft, planner, 'seed', 2), edge(planner, terminal, 'advice'), loop, ...plan.definition.edges]
            : [edge(planner, draft, 'control'), edge(draft, terminal, 'advice'), ...plan.definition.edges];
        plan.definition.capabilityCeiling = ['generation.send', ...pureAgents ? [] : ['graph.patch']];
        plan.definition.graphChangePolicy = pureAgents ? { allowedOperations: [], allowedNodeKinds: [] } : dynamic ? { allowedOperations: ['addNode', 'addEdge', 'requestFinalize'], allowedNodeKinds: ['agent'] }
            : { allowedOperations: ['requestReplan', 'requestFinalize'], allowedNodeKinds: [] };
        Object.assign(plan.definition.limits, { maxNodes: 4, maxEdges: dynamic ? 4 : nonself ? 4 : 3, maxAttempts: nonself ? 6 : 4, maxEdgeVisits: dynamic ? 4 : nonself ? 5 : 3,
            maxLoopIterations: nonself ? 1 : 0, maxReplans: nonself ? 1 : 0 });
        const chat = await env.chats.get(env.h.handle, env.locator.charDir, env.locator.name), source = rpOperationInput(chat.body[0], 0);
        const resourceRef = { kind: 'native_rp_message', controlId: env.controlId, messageId: source.messageId, variantId: source.variantId, contentHash: source.contentHash };
        sharedPin = { pinId: 'rp.child.exact-source', port: 'context', resourceRef, integrity: hash(await readDelegatedRpSource(env.h.handle, resourceRef, env.control)) };
        plan.dependencyPins.push(sharedPin);
        for (const node of [planner, draft, terminal]) if (!missingPin || node !== draft) node.dependencyPinIds.push(sharedPin.pinId);
        nodes = { planner, draft, terminal, loop };
        if (dynamic) {
            if (missingFuturePin) draft.policy.agentPinId = 'rp.child.undeclared';
            if (missingFuturePin) draft.dependencyPinIds = ['rp.child.undeclared', sharedPin.pinId];
            nodes.operations = [{ op: 'addNode', node: draft }, { op: 'addEdge', edge: edge(planner, draft, 'control') },
                { op: 'addEdge', edge: edge(draft, terminal, 'futureAdvice') }, { op: 'requestFinalize' }];
        }
    }, configureParentPlan: plan => {
        if (!pureAgents) {
            plan.definition.nodes[0].capabilities.push('graph.patch'); plan.definition.capabilityCeiling = [...plan.definition.nodes[0].capabilities];
            plan.definition.graphChangePolicy = { allowedOperations: ['requestReplan', 'requestFinalize'], allowedNodeKinds: [] };
        }
        plan.dependencyPins.push(sharedPin); plan.definition.nodes[0].dependencyPinIds.push(sharedPin.pinId);
    }, responsePayload: body => pureAgents && body.model === plannerModelId ? 'RP_CHILD_FIRST_ADVICE' : body.model === plannerModelId ? JSON.stringify({ operations: dynamic ? nodes.operations : [{ op: nonself && ++plannerRound === 1 ? 'requestReplan' : 'requestFinalize' }] })
        : body.model === draftModelId ? 'RP_CHILD_DAG_ADVICE_' + ++draftRound : 'RP_CHILD_TERMINAL_AND_PARENT' });
    return { ...f, nodes, plannerModelId, draftModelId };
}

for (const nonself of [false, true]) test('SQLite RP child ' + (nonself ? 'nonself return' : 'declared pure Agent DAG') + ' preserves its dual Source and closes the original child bank before sole parent narration', async () => {
    const f = await setup({ nonself }), childCalls = nonself ? 5 : 3;
    try {
        const result = await f.run(); expect(result.delegation.status).toBe('returned'); expect(f.requests).toHaveLength(childCalls + 1);
        const child = await f.authority.execution.runs.get(f.h.handle, result.delegation.childRunId);
        expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(nonself ? 2 : 1); expect(child.outputClaims).toHaveLength(1);
        expect(child.progress).toMatchObject({ attempts: childCalls + 1, replans: Number(nonself), loopIterations: Number(nonself), edgeVisits: nonself ? 5 : 3 });
        expect(f.requests.slice(0, childCalls).every(body => text(body).includes('Authorized advisory source [rp0]') && text(body).includes('Original RP context'))).toBe(true);
        expect(text(f.requests[childCalls - 1])).toContain(nonself ? 'requestFinalize' : 'RP_CHILD_DAG_ADVICE_1');
        expect(text(f.requests[childCalls])).toContain('RP_CHILD_TERMINAL_AND_PARENT');
        const expectedPlannerEvidence = nonself ? f.requests[3] : f.requests[0];
        expect(text(expectedPlannerEvidence)).not.toContain('RP_CHILD_DAG_ADVICE_1');
        expect(text(f.requests[nonself ? 3 : 2])).toContain(nonself ? 'RP_CHILD_DAG_ADVICE_2' : 'RP_CHILD_DAG_ADVICE_1');
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(childCalls + 1); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(childCalls);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: childCalls }) })]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const output = await readTaskLocalOutput(tx, f.h.handle, child), history = output.publication.graphHistory;
            expect(history.effects).toHaveLength(childCalls); expect(history.planners).toHaveLength(nonself ? 2 : 1); expect(history.results).toHaveLength(nonself ? 2 : 1); expect(history.settled).toBe(true);
            const original = history.results[0]; expect((await readGraphNodeResult(tx, f.h.handle, child, original.receipt.resultRef.resultId)).record).toEqual(original.record);
            const final = (await readAttempt(tx, f.h.handle, child, history.finalProducer.attemptId)).doc;
            const key = controlRecordKey(f.h.handle, child.runId, 'attempt', final.attemptId), saved = await tx.getResource(key), changed = { ...saved.doc, inputRefs: [saved.doc.inputRefs[0], ...child.parentRef.inputRefs] };
            changed.inputDigest = hash(changed.inputRefs);
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).receipt).toEqual(output.receipt);
        });
        await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name);
        expect((await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child))).publication.graphHistory.settled).toBe(true);
        expect(f.requests).toHaveLength(childCalls + 1);
    } finally { await f.cleanup(); }
}, 180000);

test('RP child nonself return cannot replace its original held allocation after two paid Models', async () => {
    const f = await setup({ nonself: true, childRequests: 4 });
    try {
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(2);
        const child = (await rootsOf(f)).find(root => root.parentRef); expect(child.status).toBe('blocked'); expect(child.graphRevision).toBe(0);
        expect(child.resultRefs).toHaveLength(1); expect(child.outputClaims).toEqual([]); expect(child.progress.loopIterations).toBe(0);
        const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'patch' }));
        expect(patches.map(row => row.doc)).toEqual([expect.objectContaining({ accepted: false, issues: [{ code: 'native_orchestration_graph_budget_unavailable' }], appliedOperations: [] })]);
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(2); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'held', limits: expect.objectContaining({ maxRequests: 4 }) })]);
    } finally { await f.cleanup(); }
}, 90000);

test('RP child Agent without its exact independently pinned Source cannot receive a DAG capture or send', async () => {
    const f = await setup({ missingPin: true });
    try {
        await expect(f.run()).rejects.toThrow('native_orchestration_rp_child_control_unavailable'); expect(f.requests).toEqual([]); expect(f.effects).toEqual([]);
        expect(await rootsOf(f)).toEqual([]); expect((await f.control.status(f.h.handle, f.controlId)).operations).toEqual({});
    } finally { await f.cleanup(); }
}, 60000);


test('SQLite RP child Planner adds an Agent using only the original owned pin pool and sends the fresh graph brief', async () => {
    const f = await setup({ dynamic: true });
    try {
        const result = await f.run(); expect(result.delegation.status).toBe('returned'); expect(f.requests).toHaveLength(4);
        expect(f.requests.map(body => body.model)).toEqual([f.plannerModelId, f.draftModelId, f.model.remoteModelId, f.model.remoteModelId]);
        // Assert the physical request, not just an in-memory task object.
        expect(text(f.requests[0])).toContain('rp.child.draft'); expect(text(f.requests[0])).toContain(f.nodes.terminal.nodeId);
        expect(text(f.requests[0])).not.toContain(f.nodes.draft.nodeId);
        expect(text(f.requests[1])).toContain('Authorized advisory source [rp0]'); expect(text(f.requests[1])).toContain('Original RP context');
        expect(text(f.requests[1])).toContain(f.nodes.draft.nodeId); expect(text(f.requests[2])).toContain('RP_CHILD_DAG_ADVICE_1');
        expect(text(f.requests[3])).toContain('RP_CHILD_TERMINAL_AND_PARENT');
        const child = await f.authority.execution.runs.get(f.h.handle, result.delegation.childRunId);
        expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(1); expect(child.graph.nodes).toContainEqual(f.nodes.draft);
        expect(child.outputClaims).toHaveLength(1); expect(child.progress).toMatchObject({ attempts: 4, edgeVisits: 4, loopIterations: 0, replans: 0 });
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const output = await readTaskLocalOutput(tx, f.h.handle, child), history = output.publication.graphHistory;
            expect(history.effects).toHaveLength(3); expect(history.planners).toHaveLength(1); expect(history.results).toHaveLength(1); expect(history.settled).toBe(true);
            const original = history.results[0]; expect(original.producer.nodeId).toBe(f.nodes.draft.nodeId);
            expect((await readGraphNodeResult(tx, f.h.handle, child, original.receipt.resultRef.resultId)).record).toEqual(original.record);
            const key = { kind: K.orchestrationRun, handle: f.h.handle, runId: child.runId }, saved = await tx.getResource(key);
            const changed = JSON.parse(JSON.stringify(saved.doc)); changed.graph.nodes.find(node => node.nodeId === f.nodes.draft.nodeId).policy.agentPinId = 'rp.child.undeclared';
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readTaskLocalOutput(tx, f.h.handle, changed)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).receipt).toEqual(output.receipt);
        });
        expect(f.requests).toHaveLength(4);
    } finally { await f.cleanup(); }
}, 180000);

for (const missingFuturePin of [true, false]) test('RP child dynamic Agent ' + (missingFuturePin ? 'cannot introduce an unpublished Model pin' : 'cannot replace its original held request ceiling'), async () => {
    const f = await setup({ dynamic: true, missingFuturePin, childRequests: missingFuturePin ? 3 : 2 });
    try {
        await expect(f.run()).rejects.toThrow(); expect(f.requests).toHaveLength(1); expect(f.requests[0].model).toBe(f.plannerModelId);
        const child = (await rootsOf(f)).find(root => root.parentRef); expect(child.graphRevision).toBe(0); expect(child.resultRefs).toEqual([]); expect(child.outputClaims).toEqual([]);
        expect(child.graph.nodes.some(node => node.nodeId === f.nodes.draft.nodeId)).toBe(false);
        const patches = await f.h.engine.withTransaction(f.h.handle, tx => tx.listResources({ kind: K.orchestrationRecord, handle: f.h.handle, runId: child.runId, recordType: 'patch' }));
        expect(patches.map(row => row.doc)).toEqual([expect.objectContaining({ accepted: false, appliedOperations: [],
            ...missingFuturePin ? {} : { issues: [{ code: 'native_orchestration_graph_budget_unavailable' }] } })]);
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(1); expect(bank.attempts[0].status).toBe('settled');
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'held', limits: expect.objectContaining({ maxRequests: missingFuturePin ? 3 : 2 }) })]);
    } finally { await f.cleanup(); }
}, 90000);


test('SQLite RP child three Agent DAG needs no Planner or graph.patch and closes the original dual Source held bank', async () => {
    const f = await setup({ pureAgents: true });
    try {
        const result = await f.run(); expect(result.delegation.status).toBe('returned'); expect(f.requests).toHaveLength(4);
        expect(f.requests.map(body => body.model)).toEqual([f.plannerModelId, f.draftModelId, f.model.remoteModelId, f.model.remoteModelId]);
        const child = await f.authority.execution.runs.get(f.h.handle, result.delegation.childRunId);
        expect(child.status).toBe('completed'); expect(child.graphRevision).toBe(0); expect(child.outputClaims).toHaveLength(1);
        expect(child.graph.nodes.filter(node => node.kind !== 'output').every(node => node.kind === 'agent' && hash(node.capabilities) === hash(['generation.send']))).toBe(true);
        expect(child.progress).toMatchObject({ attempts: 4, patches: 0, reviews: 0, replans: 0, loopIterations: 0, edgeVisits: 3 });
        for (const body of f.requests.slice(0, 3)) { expect(text(body)).toContain('Original RP input'); expect(text(body)).toContain('Authorized advisory source [rp0]'); }
        expect(text(f.requests[1])).toContain('RP_CHILD_FIRST_ADVICE'); expect(text(f.requests[2])).toContain('RP_CHILD_DAG_ADVICE_1');
        expect(text(f.requests[3])).toContain('RP_CHILD_TERMINAL_AND_PARENT');
        const effects = f.effects.filter(effect => effect.proposal.inputRef.childRunId === child.runId); expect(effects).toHaveLength(3);
        expect(effects.every(effect => hash(effect.proposal.inputRef.audience) === hash({ kind: 'task', id: child.runId }))).toBe(true);
        const bank = await bankOf(f); expect(bank.attempts).toHaveLength(4); expect(bank.attempts.every(row => row.status === 'settled')).toBe(true);
        expect(bank.attempts.filter(row => row.reservationId === child.runId)).toHaveLength(3);
        expect(bank.reservations).toEqual([expect.objectContaining({ reservationId: child.runId, status: 'released', limits: expect.objectContaining({ maxRequests: 3 }) })]);
        await f.h.engine.withTransaction(f.h.handle, async tx => {
            const output = await readTaskLocalOutput(tx, f.h.handle, child), history = output.publication.graphHistory;
            expect(history.effects).toHaveLength(3); expect(history.planners).toEqual([]); expect(history.reviews).toEqual([]); expect(history.judges).toEqual([]);
            expect(history.results).toHaveLength(2); expect(history.loopIterations).toBe(0); expect(history.settled).toBe(true);
            const final = (await readAttempt(tx, f.h.handle, child, history.finalProducer.attemptId)).doc;
            const key = controlRecordKey(f.h.handle, child.runId, 'attempt', final.attemptId), saved = await tx.getResource(key);
            const changed = { ...saved.doc, inputRefs: [saved.doc.inputRefs[0], ...child.parentRef.inputRefs] }; changed.inputDigest = hash(changed.inputRefs);
            try { await tx.putResource(key, { ...saved, doc: changed, integrity: hash(changed) }); await expect(readTaskLocalOutput(tx, f.h.handle, child)).rejects.toThrow(); }
            finally { await tx.putResource(key, saved); }
            expect((await readTaskLocalOutput(tx, f.h.handle, child)).receipt).toEqual(output.receipt);
        });
        await f.chats.delete(f.h.handle, f.locator.charDir, f.locator.name);
        expect((await f.h.engine.withTransaction(f.h.handle, tx => readTaskLocalOutput(tx, f.h.handle, child))).publication.graphHistory.settled).toBe(true);
        expect(f.requests).toHaveLength(4);
    } finally { await f.cleanup(); }
}, 180000);
